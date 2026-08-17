const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { DashboardDataService, parseDiaryEntries } = require("../src/dashboard/data-service");
const { ActivityLogService } = require("../src/services/activity-log-service");
const { NoteService } = require("../src/services/note-service");

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

test("dashboard data can update and delete a diary day safely", async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-dashboard-diary-mutate-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const config = createTestConfig(stateDir);
  fs.mkdirSync(config.diaryDir, { recursive: true });
  fs.writeFileSync(path.join(config.diaryDir, "2026-07-23.md"), "## 08:00 Old\n\nOld body", "utf8");

  const service = new DashboardDataService({ config });
  const updated = await service.updateDiary("2026-07-23", "## 09:00 New\n\nNew body");
  assert.equal(updated.markdown, "## 09:00 New\n\nNew body\n");
  assert.equal(service.getDiary("2026-07-23").entries[0].title, "New");

  const deleted = await service.deleteDiary("2026-07-23");
  assert.equal(deleted.deleted, true);
  assert.equal(service.getDiary("2026-07-23").exists, false);
  await assert.rejects(() => service.updateDiary("not-a-date", "body"), /YYYY-MM-DD/);
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

test("dashboard desk exposes only diary summaries and note metadata/body", async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-dashboard-desk-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const config = createTestConfig(stateDir);
  fs.mkdirSync(config.diaryDir, { recursive: true });
  fs.writeFileSync(
    path.join(config.diaryDir, "2026-07-29.md"),
    "## 22:10 今天\n\n写下第一篇笔记的备份。",
    "utf8"
  );
  const noteService = new NoteService({ config });
  const note = await noteService.create({
    title: "Ally 的斗地主课",
    body: "牌权、剩余牌地图与隐藏终局组合。",
    category: "游戏课",
    tags: ["斗地主", "全局观", "算牌"],
    summary: "一篇斗地主课程笔记。",
  });
  const service = new DashboardDataService({ config, noteService });

  const desk = await service.getDesk();
  assert.equal(desk.latestNote.id, note.id);
  assert.equal(desk.latestDiary.date, "2026-07-29");
  assert.equal(desk.latestDiary.entryCount, 1);
  assert.equal(JSON.stringify(desk).includes(note.body), false);

  const list = await service.getNotes();
  assert.deepEqual(list.categories, ["游戏课"]);
  assert.deepEqual(list.tags, ["全局观", "斗地主", "算牌"]);
  assert.equal("body" in list.items[0], false);

  const loaded = await service.getNote(note.id);
  assert.equal(loaded.body, note.body);
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
    notesDir: path.join(stateDir, "notes"),
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
