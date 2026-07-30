const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");

const NOTE_ID_PATTERN = /^note_[a-z0-9]+_[a-f0-9]{12}$/;
const MAX_BODY_LENGTH = 512 * 1024;

class NoteService {
  constructor({ config }) {
    const configuredDir = config?.notesDir || (config?.stateDir ? path.join(config.stateDir, "notes") : "");
    if (!configuredDir) {
      throw new Error("Note storage directory is required.");
    }
    this.notesDir = path.resolve(configuredDir);
    this.filesDir = path.join(this.notesDir, "files");
    this.indexFile = path.join(this.notesDir, "index.json");
    this.writeQueue = Promise.resolve();
  }

  async create(input = {}) {
    return this.enqueueWrite(async () => {
      const normalized = normalizeNoteInput(input, { requireBody: true, requireTitle: true });
      const now = new Date().toISOString();
      const id = createNoteId();
      const item = {
        id,
        title: normalized.title,
        category: normalized.category,
        tags: normalized.tags,
        summary: normalized.summary || deriveSummary(normalized.body),
        filename: `${id}.md`,
        createdAt: now,
        updatedAt: now,
      };
      const index = await this.readIndex();
      index.items.push(item);
      await this.ensureStorage();
      await atomicWriteText(this.resolveBodyPath(id), normalized.body);
      await this.writeIndex(index);
      return { ...item, body: normalized.body };
    });
  }

  async update(input = {}) {
    return this.enqueueWrite(async () => {
      const id = normalizeId(input.id);
      const index = await this.readIndex();
      const itemIndex = index.items.findIndex((item) => item.id === id);
      if (itemIndex < 0) {
        throw new NoteNotFoundError(id);
      }
      const current = index.items[itemIndex];
      const currentBody = await readRequiredText(this.resolveBodyPath(id));
      const nextInput = normalizeNoteInput({
        title: input.title === undefined ? current.title : input.title,
        body: input.body === undefined ? currentBody : input.body,
        category: input.category === undefined ? current.category : input.category,
        tags: input.tags === undefined ? current.tags : input.tags,
        summary: input.summary === undefined ? current.summary : input.summary,
      }, { requireBody: true, requireTitle: true });
      const updated = {
        ...current,
        title: nextInput.title,
        category: nextInput.category,
        tags: nextInput.tags,
        summary: nextInput.summary || deriveSummary(nextInput.body),
        filename: `${id}.md`,
        updatedAt: new Date().toISOString(),
      };
      index.items[itemIndex] = updated;
      await this.ensureStorage();
      await atomicWriteText(this.resolveBodyPath(id), nextInput.body);
      await this.writeIndex(index);
      return { ...updated, body: nextInput.body };
    });
  }

  async list({ category = "", tag = "", query = "" } = {}) {
    const index = await this.readIndex();
    const normalizedCategory = normalizeText(category).toLocaleLowerCase();
    const normalizedTag = normalizeText(tag).toLocaleLowerCase();
    const normalizedQuery = normalizeText(query).toLocaleLowerCase();
    return index.items
      .filter((item) => !normalizedCategory || item.category.toLocaleLowerCase() === normalizedCategory)
      .filter((item) => !normalizedTag || item.tags.some((value) => value.toLocaleLowerCase() === normalizedTag))
      .filter((item) => {
        if (!normalizedQuery) return true;
        return [
          item.title,
          item.category,
          item.summary,
          ...item.tags,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map((item) => ({ ...item, tags: [...item.tags] }));
  }

  async get({ id } = {}) {
    const normalizedId = normalizeId(id);
    const index = await this.readIndex();
    const item = index.items.find((candidate) => candidate.id === normalizedId);
    if (!item) {
      throw new NoteNotFoundError(normalizedId);
    }
    const body = await readRequiredText(this.resolveBodyPath(normalizedId));
    return { ...item, tags: [...item.tags], body };
  }

  enqueueWrite(operation) {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.catch(() => {});
    return result;
  }

  async ensureStorage() {
    await fsp.mkdir(this.filesDir, { recursive: true });
  }

  async readIndex() {
    let text = "";
    try {
      text = await fsp.readFile(this.indexFile, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return { version: 1, items: [] };
      }
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Note index is not valid JSON.");
    }
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) {
      throw new Error("Note index has an unsupported format.");
    }
    return {
      version: 1,
      items: parsed.items.map(normalizeIndexItem),
    };
  }

  async writeIndex(index) {
    await this.ensureStorage();
    await atomicWriteText(this.indexFile, `${JSON.stringify(index, null, 2)}\n`);
  }

  resolveBodyPath(id) {
    const normalizedId = normalizeId(id);
    const filePath = path.resolve(this.filesDir, `${normalizedId}.md`);
    if (path.dirname(filePath) !== this.filesDir) {
      throw new Error("Note path is outside the note storage directory.");
    }
    return filePath;
  }
}

class NoteNotFoundError extends Error {
  constructor(id) {
    super(`Note not found: ${id}`);
    this.name = "NoteNotFoundError";
  }
}

function normalizeNoteInput(input, { requireBody = false, requireTitle = false } = {}) {
  const title = normalizeText(input.title);
  const body = normalizeBody(input.body);
  const category = normalizeText(input.category);
  const summary = normalizeText(input.summary);
  const tags = normalizeTags(input.tags);
  if (requireTitle && !title) throw new Error("Note title cannot be empty.");
  if (requireBody && !body) throw new Error("Note body cannot be empty.");
  if (title.length > 200) throw new Error("Note title cannot exceed 200 characters.");
  if (category.length > 80) throw new Error("Note category cannot exceed 80 characters.");
  if (summary.length > 500) throw new Error("Note summary cannot exceed 500 characters.");
  if (body.length > MAX_BODY_LENGTH) throw new Error("Note body is too large.");
  return { title, body, category, tags, summary };
}

function normalizeIndexItem(value) {
  const id = normalizeId(value?.id);
  const title = normalizeText(value?.title);
  if (!title) throw new Error(`Note index item ${id} is missing a title.`);
  return {
    id,
    title,
    category: normalizeText(value?.category),
    tags: normalizeTags(value?.tags),
    summary: normalizeText(value?.summary),
    filename: `${id}.md`,
    createdAt: normalizeIso(value?.createdAt),
    updatedAt: normalizeIso(value?.updatedAt),
  };
}

function normalizeTags(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("Note tags must be an array.");
  const tags = [...new Set(value.map(normalizeText).filter(Boolean))];
  if (tags.length > 8) throw new Error("A note can have at most 8 tags.");
  if (tags.some((tag) => tag.length > 24)) {
    throw new Error("Note tags cannot exceed 24 characters.");
  }
  return tags;
}

function normalizeId(value) {
  const id = normalizeText(value).toLowerCase();
  if (!NOTE_ID_PATTERN.test(id)) {
    throw new Error("Invalid note id.");
  }
  return id;
}

function normalizeIso(value) {
  const parsed = Date.parse(normalizeText(value));
  if (!Number.isFinite(parsed)) throw new Error("Note timestamp is invalid.");
  return new Date(parsed).toISOString();
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBody(value) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
}

function createNoteId() {
  return `note_${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}`;
}

function deriveSummary(body) {
  const parts = String(body || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .split(/\n\s*\n/)
    .map((part) => ({
      heading: /^#{1,6}[ \t]+/.test(part.trim()),
      text: part
        .replace(/^#{1,6}[ \t]+/gm, "")
        .replace(/^[>*+\-][ \t]+/gm, "")
        .replace(/^\d+\.[ \t]+/gm, "")
        .replace(/[`_*~]/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    }))
    .filter((part) => part.text);
  return (parts.find((part) => !part.heading) || parts[0])?.text.slice(0, 240) || "";
}

async function atomicWriteText(filePath, text) {
  const directory = path.dirname(filePath);
  await fsp.mkdir(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  try {
    await fsp.writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx" });
    await fsp.rename(temporaryPath, filePath);
  } finally {
    await fsp.rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function readRequiredText(filePath) {
  try {
    return await fsp.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Note body file is missing.");
    }
    throw error;
  }
}

module.exports = {
  NoteNotFoundError,
  NoteService,
  atomicWriteText,
  createNoteId,
  deriveSummary,
};
