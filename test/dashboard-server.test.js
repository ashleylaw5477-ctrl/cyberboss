const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { DashboardAuth } = require("../src/dashboard/auth");
const { createDashboardServer } = require("../src/dashboard/server");

test("dashboard server protects API routes and enforces CSRF on mutations", async (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "cyberboss-dashboard-server-"));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(rootDir, "index.html"), "<h1>Dashboard</h1>", "utf8");

  let receivedUpload = null;
  const server = createDashboardServer({
    config: {
      stateDir: rootDir,
      activityLogFile: path.join(rootDir, "activity-log.jsonl"),
      runtime: "claudecode",
      diaryDir: path.join(rootDir, "diary"),
      notesDir: path.join(rootDir, "notes"),
      reminderQueueFile: path.join(rootDir, "reminder-queue.json"),
      checkinConfigFile: path.join(rootDir, "checkin-config.json"),
      weixinInstructionsFile: path.join(rootDir, "weixin-instructions.md"),
      sessionsFile: path.join(rootDir, "sessions.json"),
      stickersDir: path.join(rootDir, "stickers"),
      stickerAssetsDir: path.join(rootDir, "stickers", "assets"),
      stickersIndexFile: path.join(rootDir, "stickers", "index.json"),
      stickerTagsFile: path.join(rootDir, "stickers", "tags.json"),
      stickersTemplateDir: "",
      stickerTagsTemplateFile: "",
      dashboardAgentName: "Knox",
      userName: "Ally",
    },
    staticDir: rootDir,
    auth: new DashboardAuth({ password: "correct horse battery staple", secret: "test" }),
    dataService: {
      getOverview: () => ({ agent: { name: "Knox" } }),
      getDesk: async () => ({ latestNote: null, latestDiary: null, counts: { notes: 0, diaryDays: 0 } }),
      getInstructions: () => ({ markdown: "# Test instructions", updatedAt: "", filename: "weixin-instructions.md" }),
      updateInstructions: async (markdown) => ({ markdown, updatedAt: "", filename: "weixin-instructions.md" }),
      getNotes: async () => ({ items: [{ id: "note_test_abcdef123456", title: "Test" }], categories: [], tags: [] }),
      getNote: async (id) => ({ id, title: "Test", body: "Markdown" }),
      async saveStickerUpload(upload) {
        assert.equal(fs.existsSync(upload.filePath), true);
        receivedUpload = upload;
        return {
          stickerId: "stk_999",
          tags: upload.tags,
          desc: upload.desc,
        };
      },
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const unauthorized = await fetch(`${baseUrl}/api/overview`);
  assert.equal(unauthorized.status, 401);

  const wrongLogin = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ password: "wrong" }),
  });
  assert.equal(wrongLogin.status, 401);

  const login = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ password: "correct horse battery staple" }),
  });
  assert.equal(login.status, 200);
  const session = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];

  const overview = await fetch(`${baseUrl}/api/overview`, {
    headers: { cookie },
  });
  assert.equal(overview.status, 200);
  assert.equal((await overview.json()).agent.name, "Knox");

  const desk = await fetch(`${baseUrl}/api/desk`, { headers: { cookie } });
  assert.equal(desk.status, 200);
  assert.equal((await desk.json()).counts.notes, 0);

  const instructions = await fetch(`${baseUrl}/api/instructions`, { headers: { cookie } });
  assert.equal(instructions.status, 200);
  assert.equal((await instructions.json()).markdown, "# Test instructions");

  const rejectedInstructionsUpdate = await fetch(`${baseUrl}/api/instructions`, {
    method: "PATCH",
    headers: { cookie, origin: baseUrl, "content-type": "application/json" },
    body: JSON.stringify({ markdown: "changed" }),
  });
  assert.equal(rejectedInstructionsUpdate.status, 403);

  const instructionsUpdate = await fetch(`${baseUrl}/api/instructions`, {
    method: "PATCH",
    headers: {
      cookie,
      origin: baseUrl,
      "content-type": "application/json",
      "x-cyberboss-csrf": session.csrf,
    },
    body: JSON.stringify({ markdown: "changed" }),
  });
  assert.equal(instructionsUpdate.status, 200);
  assert.equal((await instructionsUpdate.json()).markdown, "changed");

  const notes = await fetch(`${baseUrl}/api/notes`, { headers: { cookie } });
  assert.equal(notes.status, 200);
  assert.equal((await notes.json()).items[0].title, "Test");

  const note = await fetch(`${baseUrl}/api/notes/note_test_abcdef123456`, { headers: { cookie } });
  assert.equal(note.status, 200);
  assert.equal((await note.json()).body, "Markdown");

  const uploadBody = new FormData();
  uploadBody.set("file", new Blob(["fake png bytes"], { type: "image/png" }), "preview.png");
  uploadBody.set("desc", "A tiny preview sticker");
  uploadBody.set("tags", JSON.stringify(["preview", "happy"]));
  const upload = await fetch(`${baseUrl}/api/stickers`, {
    method: "POST",
    headers: {
      cookie,
      origin: baseUrl,
      "x-cyberboss-csrf": session.csrf,
    },
    body: uploadBody,
  });
  assert.equal(upload.status, 201);
  assert.deepEqual(receivedUpload.tags, ["preview", "happy"]);
  assert.equal(receivedUpload.desc, "A tiny preview sticker");
  assert.equal(fs.existsSync(receivedUpload.filePath), false);

  const rejectedLogout = await fetch(`${baseUrl}/api/logout`, {
    method: "POST",
    headers: { cookie, origin: baseUrl },
  });
  assert.equal(rejectedLogout.status, 403);

  const logout = await fetch(`${baseUrl}/api/logout`, {
    method: "POST",
    headers: {
      cookie,
      origin: baseUrl,
      "x-cyberboss-csrf": session.csrf,
    },
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
});
