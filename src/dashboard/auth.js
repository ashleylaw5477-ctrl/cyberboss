const crypto = require("crypto");

const SESSION_COOKIE_NAME = "cyberboss_dashboard_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

class DashboardAuth {
  constructor({
    password = process.env.CYBERBOSS_DASHBOARD_PASSWORD || "",
    secret = process.env.CYBERBOSS_DASHBOARD_SESSION_SECRET || "",
    now = () => Date.now(),
  } = {}) {
    this.password = normalizeText(password);
    this.now = now;
    this.signingKey = deriveSigningKey(this.password, secret);
  }

  get configured() {
    return this.password.length > 0;
  }

  authenticate(candidate) {
    if (!this.configured) {
      return false;
    }
    return safeEqual(
      crypto.createHash("sha256").update(String(candidate || ""), "utf8").digest(),
      crypto.createHash("sha256").update(this.password, "utf8").digest()
    );
  }

  createSession() {
    if (!this.configured) {
      throw new Error("Dashboard password is not configured.");
    }
    const payload = {
      exp: this.now() + SESSION_MAX_AGE_SECONDS * 1_000,
      csrf: crypto.randomBytes(24).toString("base64url"),
      nonce: crypto.randomBytes(12).toString("base64url"),
    };
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    return {
      token: `${encoded}.${sign(encoded, this.signingKey)}`,
      csrf: payload.csrf,
      expiresAt: new Date(payload.exp).toISOString(),
    };
  }

  verifySession(token) {
    if (!this.configured) {
      return null;
    }
    const [encoded, signature, ...extra] = normalizeText(token).split(".");
    if (!encoded || !signature || extra.length) {
      return null;
    }
    if (!safeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(sign(encoded, this.signingKey), "utf8")
    )) {
      return null;
    }
    try {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      if (!Number.isFinite(payload?.exp) || payload.exp <= this.now() || !normalizeText(payload?.csrf)) {
        return null;
      }
      return {
        csrf: normalizeText(payload.csrf),
        expiresAt: new Date(payload.exp).toISOString(),
      };
    } catch {
      return null;
    }
  }

  readRequestSession(request) {
    const cookies = parseCookies(request?.headers?.cookie);
    return this.verifySession(cookies[SESSION_COOKIE_NAME]);
  }

  buildSessionCookie(token, request) {
    const secure = isSecureRequest(request);
    return [
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      "Path=/",
      `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
      "HttpOnly",
      "SameSite=Lax",
      ...(secure ? ["Secure"] : []),
    ].join("; ");
  }

  buildClearCookie(request) {
    const secure = isSecureRequest(request);
    return [
      `${SESSION_COOKIE_NAME}=`,
      "Path=/",
      "Max-Age=0",
      "HttpOnly",
      "SameSite=Lax",
      ...(secure ? ["Secure"] : []),
    ].join("; ");
  }
}

class LoginRateLimiter {
  constructor({ maxAttempts = 8, windowMs = 15 * 60_000, now = () => Date.now() } = {}) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.now = now;
    this.attempts = new Map();
  }

  isBlocked(key) {
    const record = this.getCurrentRecord(key);
    return record.count >= this.maxAttempts;
  }

  recordFailure(key) {
    const record = this.getCurrentRecord(key);
    record.count += 1;
    this.attempts.set(normalizeText(key) || "unknown", record);
    return record.count;
  }

  clear(key) {
    this.attempts.delete(normalizeText(key) || "unknown");
  }

  getCurrentRecord(key) {
    const normalizedKey = normalizeText(key) || "unknown";
    const current = this.attempts.get(normalizedKey);
    if (!current || this.now() - current.startedAt >= this.windowMs) {
      return { count: 0, startedAt: this.now() };
    }
    return current;
  }
}

function isSameOriginRequest(request) {
  const origin = normalizeText(request?.headers?.origin);
  if (!origin) {
    return true;
  }
  const forwardedHost = normalizeText(request?.headers?.["x-forwarded-host"]);
  const host = (forwardedHost || normalizeText(request?.headers?.host)).split(",")[0].trim();
  if (!host) {
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isSecureRequest(request) {
  const forwardedProto = normalizeText(request?.headers?.["x-forwarded-proto"])
    .split(",")[0]
    .trim()
    .toLowerCase();
  return forwardedProto === "https" || Boolean(request?.socket?.encrypted);
}

function parseCookies(header) {
  const output = {};
  for (const part of String(header || "").split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();
    try {
      output[key] = decodeURIComponent(rawValue);
    } catch {
      output[key] = rawValue;
    }
  }
  return output;
}

function deriveSigningKey(password, secret) {
  return crypto
    .createHash("sha256")
    .update(`cyberboss-dashboard\0${normalizeText(secret)}\0${normalizeText(password)}`, "utf8")
    .digest();
}

function sign(value, key) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest("base64url");
}

function safeEqual(left, right) {
  if (!Buffer.isBuffer(left) || !Buffer.isBuffer(right) || left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  DashboardAuth,
  LoginRateLimiter,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  isSameOriginRequest,
  parseCookies,
};
