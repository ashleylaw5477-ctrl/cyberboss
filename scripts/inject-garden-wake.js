#!/usr/bin/env node
"use strict";

const { readConfig } = require("../src/core/config");
const { SessionStore } = require("../src/adapters/runtime/codex/session-store");
const { SystemMessageService } = require("../src/services/system-message-service");

const MAX_ENVELOPE_BYTES = 16 * 1024;
const MAX_MESSAGE_LENGTH = 4096;

async function readStdin(stream = process.stdin) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_ENVELOPE_BYTES) {
      throw new Error("Garden wake envelope is too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

function parseEnvelope(raw) {
  if (!raw) {
    throw new Error("Garden wake envelope is empty");
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Garden wake envelope is not valid JSON");
  }
  const message = normalizeText(value?.message);
  if (value?.version !== 1 || value?.type !== "garden_wake") {
    throw new Error("Unsupported Garden wake envelope");
  }
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    throw new Error("Garden wake message is missing or too long");
  }
  return {
    reason: normalizeText(value.reason) || "unknown",
    message,
  };
}

function queueWake(envelope, env = process.env) {
  const config = readConfig();
  const sessionStore = new SessionStore({ filePath: config.sessionsFile });
  const service = new SystemMessageService({ config, sessionStore });
  const userId = normalizeText(env.CYBERBOSS_GARDEN_USER_ID);
  const workspaceRoot = normalizeText(env.CYBERBOSS_GARDEN_WORKSPACE);
  return service.queueMessage({
    text: envelope.message,
    userId,
    workspaceRoot,
  });
}

async function main() {
  const envelope = parseEnvelope(await readStdin());
  const queued = queueWake(envelope);
  process.stderr.write(
    `[cyberboss] Garden wake queued reason=${envelope.reason} id=${queued.id}\n`
  );
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Cyberboss Garden injector failed: ${error.message || String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseEnvelope, readStdin };
