const fs = require("fs");
const path = require("path");

const { resolveDefaultCheckinRange } = require("../core/checkin-config-store");
const { ActivityLogService } = require("../services/activity-log-service");
const {
  StickerService,
  loadStickerIndexSync,
  loadStickerTagsSync,
  resolveStickerFilePath,
} = require("../services/sticker-service");

const DIARY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STICKER_ID_PATTERN = /^stk_\d+$/i;

class DashboardDataService {
  constructor({ config, activityLog = null, stickerService = null } = {}) {
    this.config = config;
    this.activityLog = activityLog || new ActivityLogService({
      filePath: config.activityLogFile,
    });
    this.stickerService = stickerService || new StickerService({
      config,
      channelAdapter: null,
      sessionStore: null,
      channelFileService: null,
      activityLog: this.activityLog,
    });
  }

  getOverview() {
    const session = this.getCurrentSessionSummary();
    const activities = this.getActivities({ limit: 200 }).items;
    const reminders = this.getPendingReminders();
    const checkinRange = readCheckinRange(this.config.checkinConfigFile);
    const lastCheckin = activities.find((item) => item.type === "checkin") || null;
    const lastAction = activities.find((item) => item.type === "send_message" || item.type === "silent") || null;
    const bridgePid = readPid(path.join(this.config.stateDir, "logs", "shared-wechat.pid"));
    const runtimePid = readPid(path.join(this.config.stateDir, "logs", "shared-app-server.pid"));
    const bridgeRunning = isPidAlive(bridgePid);
    const runtimeRunning = this.config.runtime === "codex" ? isPidAlive(runtimePid) : bridgeRunning;
    return {
      agent: {
        name: this.config.dashboardAgentName || "Knox",
        userName: this.config.userName || "你",
        status: bridgeRunning ? "online" : "offline",
        statusLabel: bridgeRunning ? "正在值守" : "暂时离线",
      },
      runtime: {
        id: this.config.runtime,
        running: runtimeRunning,
        bridgeRunning,
        model: session.model,
      },
      session,
      lastCheckin,
      lastAction,
      checkin: {
        minMinutes: Math.round(checkinRange.minIntervalMs / 60_000),
        maxMinutes: Math.round(checkinRange.maxIntervalMs / 60_000),
      },
      reminders: reminders.slice(0, 5),
      counts: {
        diaryDays: this.listDiaryDates().length,
        stickers: Object.keys(loadStickerIndexSync(this.config)).length,
        pendingReminders: reminders.length,
      },
      refreshedAt: new Date().toISOString(),
    };
  }

  getCurrentSessionSummary() {
    const state = readJsonFile(this.config.sessionsFile, {});
    const bindings = Object.entries(state?.bindings || {})
      .map(([bindingKey, binding]) => ({ bindingKey, ...(binding || {}) }))
      .filter((binding) => !this.config.accountId || binding.accountId === this.config.accountId);
    const binding = bindings.find((candidate) => normalizeText(candidate.activeWorkspaceRoot))
      || bindings[0]
      || null;
    if (!binding) {
      return {
        connected: false,
        workspaceName: this.config.workspaceRoot ? path.basename(this.config.workspaceRoot) : "",
        threadId: "",
        model: "",
      };
    }
    const workspaceRoot = normalizeText(binding.activeWorkspaceRoot) || this.config.workspaceRoot || "";
    const runtimeId = normalizeText(this.config.runtime) || "codex";
    const threadMap = binding.threadIdByWorkspaceRootByRuntime?.[runtimeId]
      || (runtimeId === "codex" ? binding.threadIdByWorkspaceRoot : null)
      || {};
    const paramsMap = binding.runtimeParamsByWorkspaceRootByRuntime?.[runtimeId]
      || (runtimeId === "codex" ? binding.codexParamsByWorkspaceRoot : null)
      || {};
    const params = paramsMap[workspaceRoot] || {};
    return {
      connected: true,
      workspaceName: workspaceRoot ? path.basename(workspaceRoot) || workspaceRoot : "",
      threadId: normalizeText(threadMap[workspaceRoot]),
      model: normalizeText(params.model) || normalizeText(this.config.claudeModel) || normalizeText(this.config.codexModel),
    };
  }

  listDiaryDates() {
    try {
      return fs.readdirSync(this.config.diaryDir)
        .filter((name) => name.endsWith(".md"))
        .map((name) => name.slice(0, -3))
        .filter((date) => DIARY_DATE_PATTERN.test(date))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  getDiary(date = "") {
    const dates = this.listDiaryDates();
    const requested = normalizeText(date);
    if (requested && !DIARY_DATE_PATTERN.test(requested)) {
      throw new DashboardInputError("日期格式必须是 YYYY-MM-DD。");
    }
    const selectedDate = requested || formatShanghaiDate(new Date());
    const filePath = path.join(this.config.diaryDir, `${selectedDate}.md`);
    const markdown = readTextFile(filePath);
    return {
      date: selectedDate,
      dates,
      exists: Boolean(markdown),
      markdown,
      entries: parseDiaryEntries(selectedDate, markdown),
    };
  }

  getActivities({ type = "", limit = 200 } = {}) {
    const normalizedType = normalizeText(type);
    const persisted = this.activityLog.list({ limit: 1_000 });
    const synthetic = [
      ...this.buildDiaryActivities(),
      ...this.buildReminderActivities(),
    ];
    const seen = new Set();
    const merged = [...persisted, ...synthetic]
      .sort(compareActivities)
      .filter((item) => {
        const key = buildActivityDedupKey(item);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .filter((item) => !normalizedType || item.type === normalizedType)
      .slice(0, Math.max(1, Math.min(1_000, Number(limit) || 200)));
    return {
      items: merged,
      types: ["checkin", "reminder", "send_message", "silent", "diary_write", "sticker_send"],
    };
  }

  buildDiaryActivities() {
    return this.listDiaryDates()
      .slice(0, 90)
      .flatMap((date) => {
        const markdown = readTextFile(path.join(this.config.diaryDir, `${date}.md`));
        return parseDiaryEntries(date, markdown).map((entry, index) => ({
          id: `diary:${date}:${entry.time || index}`,
          type: "diary_write",
          occurredAt: entry.occurredAt,
          title: entry.title || "写下了一段日记",
          summary: stripMarkdown(entry.body).slice(0, 240),
          meta: { date, time: entry.time },
        }));
      });
  }

  buildReminderActivities() {
    return this.getPendingReminders().map((reminder) => ({
      id: `reminder:${reminder.id}`,
      type: "reminder",
      occurredAt: reminder.createdAt,
      title: "安排了一条提醒",
      summary: reminder.text,
      meta: {
        reminderId: reminder.id,
        dueAt: reminder.dueAt,
        status: "scheduled",
      },
    }));
  }

  getPendingReminders() {
    const state = readJsonFile(this.config.reminderQueueFile, {});
    return (Array.isArray(state?.reminders) ? state.reminders : [])
      .flatMap((reminder) => {
        const dueAtMs = Number(reminder?.dueAtMs);
        const id = normalizeText(reminder?.id);
        const text = normalizeText(reminder?.text);
        if (!id || !text || !Number.isFinite(dueAtMs)) {
          return [];
        }
        return [{
          id,
          text,
          dueAt: new Date(dueAtMs).toISOString(),
          createdAt: normalizeIsoTime(reminder?.createdAt) || new Date().toISOString(),
        }];
      })
      .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt));
  }

  getStickers() {
    const index = loadStickerIndexSync(this.config);
    const tags = loadStickerTagsSync(this.config);
    return {
      tags,
      items: Object.entries(index)
        .map(([stickerId, value]) => {
          const filePath = resolveStickerFilePath(this.config, stickerId);
          if (!fs.existsSync(filePath)) {
            return null;
          }
          return {
            stickerId,
            tags: Array.isArray(value?.tags) ? value.tags : [],
            desc: normalizeText(value?.desc),
            mediaUrl: `/api/stickers/${encodeURIComponent(stickerId)}/media`,
            updatedAt: getFileModifiedAt(filePath),
          };
        })
        .filter(Boolean)
        .sort((left, right) => right.stickerId.localeCompare(left.stickerId)),
    };
  }

  resolveStickerMedia(stickerId) {
    const normalizedId = normalizeText(stickerId).toLowerCase();
    if (!STICKER_ID_PATTERN.test(normalizedId)) {
      throw new DashboardInputError("无效的表情包 ID。");
    }
    const index = loadStickerIndexSync(this.config);
    if (!index[normalizedId]) {
      return null;
    }
    const filePath = resolveStickerFilePath(this.config, normalizedId);
    return fs.existsSync(filePath) ? filePath : null;
  }

  async updateSticker(stickerId, { tags = [], desc = "" } = {}) {
    const normalizedId = normalizeText(stickerId).toLowerCase();
    if (!STICKER_ID_PATTERN.test(normalizedId)) {
      throw new DashboardInputError("无效的表情包 ID。");
    }
    await this.stickerService.update({
      items: [{ stickerId: normalizedId, tags, desc }],
    });
    return this.getStickers().items.find((item) => item.stickerId === normalizedId) || null;
  }

  async saveStickerUpload({ filePath, tags = [], desc = "" } = {}) {
    const result = await this.stickerService.saveFromInbox({
      items: [{ filePath, tags, desc }],
    });
    const saved = result.results?.[0] || null;
    return {
      ...saved,
      mediaUrl: saved?.stickerId
        ? `/api/stickers/${encodeURIComponent(saved.stickerId)}/media`
        : "",
    };
  }
}

class DashboardInputError extends Error {}

function parseDiaryEntries(date, markdown) {
  const normalized = String(markdown || "").replace(/\r\n/g, "\n");
  if (!normalized) {
    return [];
  }
  const headingPattern = /^##\s+(\d{2}:\d{2})(?:\s+(.+))?\s*$/gm;
  const matches = [...normalized.matchAll(headingPattern)];
  if (!matches.length) {
    return [{
      time: "",
      title: "",
      body: normalized.trim(),
      occurredAt: buildShanghaiIso(date, "12:00"),
    }];
  }
  return matches.map((match, index) => {
    const bodyStart = match.index + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? normalized.length;
    return {
      time: normalizeText(match[1]),
      title: normalizeText(match[2]),
      body: normalized.slice(bodyStart, bodyEnd).trim(),
      occurredAt: buildShanghaiIso(date, match[1]),
    };
  });
}

function readCheckinRange(filePath) {
  const persisted = readJsonFile(filePath, null);
  const fallback = resolveDefaultCheckinRange();
  const minIntervalMs = Number(persisted?.minIntervalMs);
  const maxIntervalMs = Number(persisted?.maxIntervalMs);
  if (Number.isFinite(minIntervalMs) && minIntervalMs > 0
    && Number.isFinite(maxIntervalMs) && maxIntervalMs >= minIntervalMs) {
    return { minIntervalMs, maxIntervalMs };
  }
  return fallback;
}

function readPid(filePath) {
  const value = Number.parseInt(readTextFile(filePath), 10);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function getFileModifiedAt(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return "";
  }
}

function formatShanghaiDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildShanghaiIso(date, time) {
  const parsed = Date.parse(`${date}T${time || "12:00"}:00+08:00`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function normalizeIsoTime(value) {
  const parsed = Date.parse(normalizeText(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function stripMarkdown(value) {
  return String(value || "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildActivityDedupKey(item) {
  const meta = item?.meta || {};
  if (item.type === "diary_write" && meta.date) {
    return `diary:${meta.date}:${meta.time || ""}`;
  }
  if (item.type === "reminder" && meta.reminderId) {
    return `reminder:${meta.reminderId}`;
  }
  return `${item.type}:${item.occurredAt}:${item.summary}`;
}

function compareActivities(left, right) {
  return (Date.parse(right?.occurredAt || "") || 0) - (Date.parse(left?.occurredAt || "") || 0);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  DashboardDataService,
  DashboardInputError,
  parseDiaryEntries,
  readCheckinRange,
};
