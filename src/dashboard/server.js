const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const path = require("path");

const Busboy = require("busboy");

const { DashboardAuth, LoginRateLimiter, isSameOriginRequest } = require("./auth");
const { DashboardDataService, DashboardInputError } = require("./data-service");

const MAX_JSON_BYTES = 64 * 1024;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Map([
  ["image/gif", ".gif"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

function createDashboardServer({
  config,
  staticDir = path.resolve(__dirname, "..", "..", "dashboard", "dist"),
  auth = new DashboardAuth(),
  dataService = new DashboardDataService({ config }),
  rateLimiter = new LoginRateLimiter(),
} = {}) {
  if (!config) {
    throw new Error("Dashboard config is required.");
  }

  return http.createServer(async (request, response) => {
    setSecurityHeaders(response);
    try {
      await routeRequest({
        request,
        response,
        config,
        staticDir,
        auth,
        dataService,
        rateLimiter,
      });
    } catch (error) {
      handleRequestError(error, response);
    }
  });
}

async function routeRequest(context) {
  const { request, response, auth } = context;
  const requestUrl = new URL(request.url || "/", "http://dashboard.local");
  const pathname = requestUrl.pathname;

  if (pathname === "/healthz" && request.method === "GET") {
    return sendJson(response, 200, {
      ok: true,
      configured: auth.configured,
    });
  }

  if (pathname === "/api/session" && request.method === "GET") {
    const session = auth.readRequestSession(request);
    return sendJson(response, 200, {
      configured: auth.configured,
      authenticated: Boolean(session),
      csrf: session?.csrf || "",
      expiresAt: session?.expiresAt || "",
    });
  }

  if (pathname === "/api/login" && request.method === "POST") {
    return handleLogin(context);
  }

  const isApiRequest = pathname.startsWith("/api/");
  const session = isApiRequest ? auth.readRequestSession(request) : null;
  if (isApiRequest && !session) {
    return sendJson(response, 401, {
      error: "unauthorized",
      message: "登录已失效，请重新登录。",
    });
  }

  if (isApiRequest && isMutationMethod(request.method)) {
    if (!isSameOriginRequest(request) || !safeTextEqual(request.headers["x-cyberboss-csrf"], session.csrf)) {
      return sendJson(response, 403, {
        error: "csrf_failed",
        message: "安全校验失败，请刷新页面后重试。",
      });
    }
  }

  if (pathname === "/api/logout" && request.method === "POST") {
    response.setHeader("Set-Cookie", auth.buildClearCookie(request));
    return sendJson(response, 200, { ok: true });
  }

  if (pathname === "/api/overview" && request.method === "GET") {
    return sendJson(response, 200, context.dataService.getOverview());
  }

  if (pathname === "/api/diary" && request.method === "GET") {
    return sendJson(response, 200, context.dataService.getDiary(requestUrl.searchParams.get("date") || ""));
  }

  if (pathname === "/api/activity" && request.method === "GET") {
    return sendJson(response, 200, context.dataService.getActivities({
      type: requestUrl.searchParams.get("type") || "",
      limit: requestUrl.searchParams.get("limit") || 200,
    }));
  }

  if (pathname === "/api/stickers" && request.method === "GET") {
    return sendJson(response, 200, context.dataService.getStickers());
  }

  if (pathname === "/api/stickers" && request.method === "POST") {
    return handleStickerUpload(context);
  }

  const stickerMatch = pathname.match(/^\/api\/stickers\/([^/]+)$/);
  if (stickerMatch && request.method === "PATCH") {
    const body = await readJsonBody(request);
    const sticker = await context.dataService.updateSticker(
      decodeURIComponent(stickerMatch[1]),
      { tags: body.tags, desc: body.desc }
    );
    return sendJson(response, 200, { sticker });
  }

  const mediaMatch = pathname.match(/^\/api\/stickers\/([^/]+)\/media$/);
  if (mediaMatch && request.method === "GET") {
    const filePath = context.dataService.resolveStickerMedia(decodeURIComponent(mediaMatch[1]));
    if (!filePath) {
      return sendJson(response, 404, {
        error: "not_found",
        message: "找不到这个表情包。",
      });
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", "image/gif");
    response.setHeader("Cache-Control", "private, max-age=300");
    fs.createReadStream(filePath)
      .on("error", (error) => {
        if (!response.headersSent) {
          handleRequestError(error, response);
        } else {
          response.destroy(error);
        }
      })
      .pipe(response);
    return;
  }

  if (isApiRequest) {
    return sendJson(response, 404, {
      error: "not_found",
      message: "找不到这个接口。",
    });
  }

  return serveStaticAsset({ request, response, pathname, staticDir: context.staticDir });
}

async function handleLogin({ request, response, auth, rateLimiter }) {
  if (!isSameOriginRequest(request)) {
    return sendJson(response, 403, {
      error: "origin_failed",
      message: "安全校验失败。",
    });
  }
  if (!auth.configured) {
    return sendJson(response, 503, {
      error: "not_configured",
      message: "请先在 Zeabur Secret 中设置 CYBERBOSS_DASHBOARD_PASSWORD。",
    });
  }
  const clientKey = resolveClientKey(request);
  if (rateLimiter.isBlocked(clientKey)) {
    return sendJson(response, 429, {
      error: "rate_limited",
      message: "尝试次数太多，请稍后再试。",
    });
  }
  const body = await readJsonBody(request);
  if (!auth.authenticate(body.password)) {
    rateLimiter.recordFailure(clientKey);
    return sendJson(response, 401, {
      error: "invalid_password",
      message: "密码不对，再试一次吧。",
    });
  }
  rateLimiter.clear(clientKey);
  const session = auth.createSession();
  response.setHeader("Set-Cookie", auth.buildSessionCookie(session.token, request));
  return sendJson(response, 200, {
    authenticated: true,
    csrf: session.csrf,
    expiresAt: session.expiresAt,
  });
}

async function handleStickerUpload({ request, response, config, dataService }) {
  const upload = await readStickerUpload(request, config);
  let sticker = null;
  try {
    sticker = await dataService.saveStickerUpload(upload);
  } finally {
    if (upload.filePath) {
      await fsp.rm(upload.filePath, { force: true }).catch(() => {});
    }
  }
  return sendJson(response, 201, { sticker });
}

function readStickerUpload(request, config) {
  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({
        headers: request.headers,
        limits: {
          files: 1,
          fields: 8,
          fileSize: MAX_UPLOAD_BYTES,
        },
      });
    } catch {
      reject(new DashboardInputError("上传格式不正确。"));
      return;
    }

    const fields = {};
    let filePath = "";
    let fileWritePromise = Promise.resolve();
    let uploadError = null;

    busboy.on("field", (name, value) => {
      fields[name] = String(value || "").slice(0, 2_000);
    });
    busboy.on("file", (name, stream, info) => {
      if (name !== "file" || filePath) {
        stream.resume();
        return;
      }
      const mimeType = normalizeText(info?.mimeType).toLowerCase();
      const extension = ALLOWED_UPLOAD_TYPES.get(mimeType);
      if (!extension) {
        uploadError = new DashboardInputError("仅支持 GIF、JPG、PNG 或 WebP 图片。");
        stream.resume();
        return;
      }
      fs.mkdirSync(path.join(config.stateDir, "inbox"), { recursive: true });
      filePath = path.join(
        config.stateDir,
        "inbox",
        `dashboard-upload-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`
      );
      const output = fs.createWriteStream(filePath, { flags: "wx" });
      fileWritePromise = new Promise((fileResolve, fileReject) => {
        output.once("finish", fileResolve);
        output.once("error", fileReject);
        stream.once("limit", () => {
          fileReject(new DashboardInputError("图片不能超过 10 MB。"));
        });
        stream.once("error", fileReject);
      });
      stream.pipe(output);
    });
    busboy.once("error", reject);
    busboy.once("close", async () => {
      try {
        await fileWritePromise;
        if (uploadError) {
          throw uploadError;
        }
        if (!filePath) {
          throw new DashboardInputError("请选择一张图片。");
        }
        resolve({
          filePath,
          desc: normalizeText(fields.desc),
          tags: parseUploadTags(fields.tags),
        });
      } catch (error) {
        if (filePath) {
          await fsp.rm(filePath, { force: true }).catch(() => {});
        }
        reject(error);
      }
    });
    request.pipe(busboy);
  });
}

function parseUploadTags(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }
  try {
    const parsed = JSON.parse(normalized);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Fall back to a comma-delimited tag string.
  }
  return normalized.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_JSON_BYTES) {
        reject(new DashboardInputError("请求内容太大。"));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.once("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new DashboardInputError("请求格式不是有效的 JSON。"));
      }
    });
    request.once("error", reject);
  });
}

function serveStaticAsset({ request, response, pathname, staticDir }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD");
    response.end();
    return;
  }
  const normalizedStaticDir = path.resolve(staticDir);
  let decodedPath = "/";
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    response.statusCode = 400;
    response.end("Bad request");
    return;
  }
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  let filePath = path.resolve(normalizedStaticDir, relativePath);
  if (!isPathInside(filePath, normalizedStaticDir)) {
    response.statusCode = 404;
    response.end("Not found");
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(normalizedStaticDir, "index.html");
  }
  if (!fs.existsSync(filePath)) {
    response.statusCode = 503;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("Dashboard assets are not built. Run npm run dashboard:build.");
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  response.statusCode = 200;
  response.setHeader("Content-Type", contentTypeForExtension(extension));
  response.setHeader(
    "Cache-Control",
    path.basename(filePath) === "index.html" ? "no-store" : "public, max-age=31536000, immutable"
  );
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  fs.createReadStream(filePath).pipe(response);
}

function setSecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "worker-src 'self'",
  ].join("; "));
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function handleRequestError(error, response) {
  if (response.headersSent) {
    response.destroy(error);
    return;
  }
  if (error instanceof DashboardInputError || isKnownValidationError(error)) {
    sendJson(response, 400, {
      error: "invalid_input",
      message: error.message,
    });
    return;
  }
  console.error(`[cyberboss] dashboard request failed: ${error?.stack || error}`);
  sendJson(response, 500, {
    error: "internal_error",
    message: "服务器刚刚走神了，请稍后再试。",
  });
}

function isKnownValidationError(error) {
  return /Sticker|sticker|description|tags|image/i.test(String(error?.message || ""));
}

function sendJson(response, statusCode, value) {
  if (response.writableEnded) {
    return;
  }
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`${JSON.stringify(value)}\n`);
}

function resolveClientKey(request) {
  const forwarded = normalizeText(request?.headers?.["x-forwarded-for"]).split(",")[0].trim();
  return forwarded || normalizeText(request?.socket?.remoteAddress) || "unknown";
}

function isMutationMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "").toUpperCase());
}

function isPathInside(filePath, parentPath) {
  const relative = path.relative(parentPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeTextEqual(left, right) {
  const leftBuffer = Buffer.from(normalizeText(left), "utf8");
  const rightBuffer = Buffer.from(normalizeText(right), "utf8");
  return leftBuffer.length > 0
    && leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function contentTypeForExtension(extension) {
  return {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
  }[extension] || "application/octet-stream";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

module.exports = {
  createDashboardServer,
  parseUploadTags,
  readJsonBody,
};
