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
      reminderQueueFile: path.join(rootDir, "reminder-queue.json"),
      checkinConfigFile: path.join(rootDir, "checkin-config.json"),
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
