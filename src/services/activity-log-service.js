const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ACTIVITY_TYPES = new Set([
  "checkin",
  "reminder",
  "send_message",
  "silent",
  "diary_write",
  "sticker_send",
]);
const DEFAULT_LIST_LIMIT = 200;
const MAX_LIST_LIMIT = 1_000;

class ActivityLogService {
  constructor({ filePath }) {
    this.filePath = filePath;
  }

  append(type, details = {}) {
    const normalizedType = normalizeType(type);
    if (!normalizedType) {
      throw new Error(`Unsupported activity type: ${type}`);
    }
    const occurredAt = normalizeIsoTime(details.occurredAt) || new Date().toISOString();
    const entry = {
      id: normalizeText(details.id) || crypto.randomUUID(),
      type: normalizedType,
      occurredAt,
      title: normalizeText(details.title),
      summary: normalizeText(details.summary),
      meta: normalizeMeta(details.meta),
    };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
    return entry;
  }

  list({ type = "", limit = DEFAULT_LIST_LIMIT, before = "" } = {}) {
    const normalizedType = normalizeType(type, { allowEmpty: true });
    const normalizedLimit = Math.max(
      1,
      Math.min(MAX_LIST_LIMIT, Number.parseInt(String(limit || DEFAULT_LIST_LIMIT), 10) || DEFAULT_LIST_LIMIT)
    );
    const beforeMs = Date.parse(normalizeText(before)) || Number.POSITIVE_INFINITY;
    return readActivityLines(this.filePath)
      .filter((entry) => !normalizedType || entry.type === normalizedType)
      .filter((entry) => (Date.parse(entry.occurredAt) || 0) < beforeMs)
      .sort(compareActivities)
      .slice(0, normalizedLimit);
  }

  latest(types = []) {
    const acceptedTypes = new Set(
      (Array.isArray(types) ? types : [types])
        .map((type) => normalizeType(type, { allowEmpty: true }))
        .filter(Boolean)
    );
    return readActivityLines(this.filePath)
      .filter((entry) => !acceptedTypes.size || acceptedTypes.has(entry.type))
      .sort(compareActivities)[0] || null;
  }
}

function readActivityLines(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line);
          const type = normalizeType(parsed?.type, { allowEmpty: true });
          const occurredAt = normalizeIsoTime(parsed?.occurredAt);
          if (!type || !occurredAt) {
            return [];
          }
          return [{
            id: normalizeText(parsed.id) || crypto.randomUUID(),
            type,
            occurredAt,
            title: normalizeText(parsed.title),
            summary: normalizeText(parsed.summary),
            meta: normalizeMeta(parsed.meta),
          }];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function normalizeMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return {};
  }
  const output = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,48}$/.test(key)) {
      continue;
    }
    if (typeof value === "string") {
      output[key] = value.slice(0, 500);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      output[key] = value;
    } else if (typeof value === "boolean" || value === null) {
      output[key] = value;
    }
  }
  return output;
}

function normalizeType(value, { allowEmpty = false } = {}) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized && allowEmpty) {
    return "";
  }
  return ACTIVITY_TYPES.has(normalized) ? normalized : "";
}

function normalizeIsoTime(value) {
  const parsed = Date.parse(normalizeText(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compareActivities(left, right) {
  const timeDifference = (Date.parse(right?.occurredAt || "") || 0)
    - (Date.parse(left?.occurredAt || "") || 0);
  return timeDifference || String(right?.id || "").localeCompare(String(left?.id || ""));
}

module.exports = {
  ACTIVITY_TYPES,
  ActivityLogService,
  readActivityLines,
};
