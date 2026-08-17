const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { NoteService, deriveSummary } = require("../src/services/note-service");
const { extractDiaryEntry, migrateFirstNote } = require("../scripts/migrate-first-note");

test("note service creates, lists, reads, and updates durable Markdown notes", async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-notes-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const notesDir = path.join(stateDir, "notes");
  const service = new NoteService({ config: { stateDir, notesDir } });

  const created = await service.create({
    title: "Ally 的斗地主课",
    body: "# 第一课\n\n记住牌权与剩余牌地图。",
    category: "游戏课",
    tags: ["斗地主", "全局观", "斗地主"],
  });

  assert.match(created.id, /^note_[a-z0-9]+_[a-f0-9]{12}$/);
  assert.equal(created.summary, "记住牌权与剩余牌地图。");
  assert.deepEqual(created.tags, ["斗地主", "全局观"]);
  assert.equal(fs.readFileSync(path.join(notesDir, "files", `${created.id}.md`), "utf8"), created.body);

  const listed = await service.list({ category: "游戏课", tag: "斗地主", query: "全局" });
  assert.equal(listed.length, 1);
  assert.equal("body" in listed[0], false);

  const updated = await service.update({
    id: created.id,
    body: "修正乱码后的正文。",
    tags: ["斗地主", "算牌"],
  });
  assert.equal(updated.title, created.title);
  assert.equal(updated.body, "修正乱码后的正文。");
  assert.deepEqual(updated.tags, ["斗地主", "算牌"]);
  assert.ok(Date.parse(updated.updatedAt) >= Date.parse(created.updatedAt));

  const reloaded = new NoteService({ config: { stateDir, notesDir } });
  assert.deepEqual(await reloaded.get({ id: created.id }), updated);

  const deleted = await reloaded.delete({ id: created.id });
  assert.equal(deleted.deleted, true);
  await assert.rejects(() => reloaded.get({ id: created.id }), /Note not found/);
});

test("note service rejects unsafe ids and does not accept file paths", async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-notes-safe-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const service = new NoteService({ config: { stateDir } });

  await assert.rejects(
    service.get({ id: "../../sessions.json" }),
    /Invalid note id/
  );
  await assert.rejects(
    service.create({ title: "Too many tags", body: "body", tags: Array.from({ length: 9 }, (_, i) => `tag-${i}`) }),
    /at most 8 tags/
  );
});

test("deriveSummary strips common Markdown decoration", () => {
  assert.equal(
    deriveSummary("## 标题\n\n**真正的** [摘要](https://example.com)。"),
    "真正的 摘要。"
  );
});

test("first note migration copies the matching diary entry once and keeps the diary intact", async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-note-migration-"));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  const config = {
    stateDir,
    diaryDir: path.join(stateDir, "diary"),
    notesDir: path.join(stateDir, "notes"),
  };
  fs.mkdirSync(config.diaryDir, { recursive: true });
  const diary = [
    "## 20:00 其他记录",
    "",
    "不要迁移。",
    "",
    "## 23:21 Knox 笔记备份｜Ally 的斗地主课",
    "",
    "# 斗地主",
    "",
    "迁移这一段。",
    "",
    "## 23:50 备份说明",
    "",
    "保留我。",
  ].join("\n");
  const diaryFile = path.join(config.diaryDir, "2026-07-29.md");
  fs.writeFileSync(diaryFile, diary, "utf8");

  assert.equal(extractDiaryEntry(diary, "Knox 笔记备份｜Ally 的斗地主课"), "# 斗地主\n\n迁移这一段。");
  const first = await migrateFirstNote(config);
  const second = await migrateFirstNote(config);
  assert.equal(first.created, true);
  assert.equal(second.reason, "already_exists");
  assert.equal(fs.readFileSync(diaryFile, "utf8"), diary);
});
