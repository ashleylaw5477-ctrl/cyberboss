const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DashboardAuth,
  LoginRateLimiter,
  SESSION_MAX_AGE_SECONDS,
  isSameOriginRequest,
} = require("../src/dashboard/auth");

test("dashboard auth creates a 30-day signed session and rejects tampering", () => {
  const start = Date.parse("2026-07-23T00:00:00.000Z");
  let now = start;
  const auth = new DashboardAuth({
    password: "a long private password",
    secret: "separate signing secret",
    now: () => now,
  });

  assert.equal(auth.configured, true);
  assert.equal(auth.authenticate("a long private password"), true);
  assert.equal(auth.authenticate("wrong"), false);

  const session = auth.createSession();
  const verified = auth.verifySession(session.token);
  assert.equal(verified.csrf, session.csrf);
  assert.equal(
    Date.parse(verified.expiresAt) - start,
    SESSION_MAX_AGE_SECONDS * 1_000
  );
  assert.equal(auth.verifySession(`${session.token.slice(0, -2)}xx`), null);

  now += SESSION_MAX_AGE_SECONDS * 1_000 + 1;
  assert.equal(auth.verifySession(session.token), null);
});

test("dashboard auth stays locked when no password is configured", () => {
  const auth = new DashboardAuth({ password: "" });
  assert.equal(auth.configured, false);
  assert.equal(auth.authenticate("anything"), false);
  assert.throws(() => auth.createSession(), /not configured/i);
});

test("login limiter blocks repeated failures inside the window", () => {
  let now = 1000;
  const limiter = new LoginRateLimiter({
    maxAttempts: 2,
    windowMs: 500,
    now: () => now,
  });
  limiter.recordFailure("client");
  assert.equal(limiter.isBlocked("client"), false);
  limiter.recordFailure("client");
  assert.equal(limiter.isBlocked("client"), true);
  now += 501;
  assert.equal(limiter.isBlocked("client"), false);
});

test("same-origin validation accepts the forwarded Zeabur host only", () => {
  assert.equal(isSameOriginRequest({
    headers: {
      origin: "https://knox.zeabur.app",
      host: "internal:3000",
      "x-forwarded-host": "knox.zeabur.app",
    },
  }), true);
  assert.equal(isSameOriginRequest({
    headers: {
      origin: "https://evil.example",
      host: "knox.zeabur.app",
    },
  }), false);
});
