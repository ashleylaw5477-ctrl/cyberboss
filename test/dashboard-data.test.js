const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { DashboardDataService, parseDiaryEntries } = require("../src/dashboard/data-service");
const { ActivityLogService } = require("../src/services/activity-log-service");

test("dashboard diary keeps the original markdown and parses entry headings", () => {
  const entries = parseDiaryEntries("2026-07-23", [
    "## 08:30 Morning",
    "",
    "**Started** the day.",
    "",
    "## 22:10",
    "",
    "- Wrapped up",
  ].join("\n"));
  assert.equal(entries.length, 2);
  assert.equal(entries[0].title, "Morning");
  assert.equal(entries[0].body, "**Started** the day.");
  assert.equal(entries[1].time, "22:10");
});

test("dashboard data merges persisted actions with existing diary and reminders", (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-dashboard-data-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const config = createTestConfig(stateDir);
  fs.mkdirSync(config.diaryDir, { recursive: true });
  fs.writeFileSync(
    path.join(config.diaryDir, "2026-07-23.md"),
    "## 09:10 Morning note\n\nKept the original **Markdown**.",
    "utf8"
  );
  fs.writeFileSync(config.reminderQueueFile, JSON.stringify({
    reminders: [{
      id: "reminder-1",
      accountId: "account",
      senderId: "sender",
      contextToken: "must-not-leak",
      text: "Drink some water",
      dueAtMs: Date.parse("2026-07-23T10:00:00.000Z"),
      createdAt: "2026-07-23T08:00:00.000Z",
    }],
  }), "utf8");
  fs.writeFileSync(config.sessionsFile, JSON.stringify({
    bindings: {
      "default:account:sender": {
        accountId: "account",
        senderId: "sender",
        activeWorkspaceRoot: "/data/workspace",
        threadIdByWorkspaceRootByRuntime: {
          claudecode: { "/data/workspace": "thread-secret-id" },
        },
        runtimeParamsByWorkspaceRootByRuntime: {
          claudecode: { "/data/workspace": { model: "claude-test" } },
        },
      },
    },
  }), "utf8");

  const activityLog = new ActivityLogService({ filePath: config.activityLogFile });
  activityLog.append("checkin", {
    id: "checkin-1",
    occurredAt: "2026-07-23T09:00:00.000Z",
    title: "Knox 又想起了 Ally",
  });
  activityLog.append("silent", {
    id: "silent-1",
    occurredAt: "2026-07-23T09:01:00.000Z",
    summary: "没有打扰你。",
  });

  const service = new DashboardDataService({ config, activityLog });
  const diary = service.getDiary("2026-07-23");
  assert.equal(diary.exists, true);
  assert.match(diary.markdown, /\*\*Markdown\*\*/);

  const activities = service.getActivities({ limit: 20 }).items;
  assert.deepEqual(
    new Set(activities.map((item) => item.type)),
    new Set(["checkin", "silent", "diary_write", "reminder"])
  );

  const overview = service.getOverview();
  assert.equal(overview.agent.name, "Knox");
  assert.equal(overview.session.workspaceName, "workspace");
  assert.equal(overview.runtime.model, "claude-test");
  assert.equal(overview.lastAction.type, "silent");
  assert.equal(JSON.stringify(overview).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(overview).includes("/data/workspace"), false);
});

test("activity log ignores corrupt lines and returns newest entries first", (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-activity-log-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const filePath = path.join(stateDir, "activity-log.jsonl");
  const activityLog = new ActivityLogService({ filePath });
  activityLog.append("checkin", { id: "older", occurredAt: "2026-07-23T08:00:00.000Z" });
  fs.appendFileSync(filePath, "{not json}\n", "utf8");
  activityLog.append("send_message", { id: "newer", occurredAt: "2026-07-23T09:00:00.000Z" });
  assert.deepEqual(activityLog.list().map((item) => item.id), ["newer", "older"]);
});

function createTestConfig(stateDir) {
  return {
    stateDir,
    workspaceRoot: "/data/workspace",
    userName: "Ally",
    runtime: "claudecode",
    claudeModel: "",
    codexModel: "",
    accountId: "",
    dashboardAgentName: "Knox",
    diaryDir: path.join(stateDir, "diary"),
    activityLogFile: path.join(stateDir, "activity-log.jsonl"),
    sessionsFile: path.join(stateDir, "sessions.json"),
    reminderQueueFile: path.join(stateDir, "reminder-queue.json"),
    checkinConfigFile: path.join(stateDir, "checkin-config.json"),
    stickersDir: path.join(stateDir, "stickers"),
    stickerAssetsDir: path.join(stateDir, "stickers", "assets"),
    stickersIndexFile: path.join(stateDir, "stickers", "index.json"),
    stickerTagsFile: path.join(stateDir, "stickers", "tags.json"),
    stickersTemplateDir: "",
    stickersTemplateIndexFile: "",
    stickerTagsTemplateFile: "",
    stickerNormalizeGifScript: path.resolve(__dirname, "..", "scripts", "normalize-sticker-gif.js"),
  };
}
