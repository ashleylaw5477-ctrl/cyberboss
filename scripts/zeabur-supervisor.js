#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const children = new Set();
let stopping = false;

function spawnNode(args, options = {}) {
  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    env: options.env || process.env,
    stdio: "inherit",
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function stopAll(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      child.kill(signal);
    } catch {
      // Best-effort shutdown; the container runtime will reap leftovers.
    }
  }
}

function watch(child, label) {
  child.once("exit", (code, signal) => {
    if (stopping) return;
    const detail = signal ? `signal=${signal}` : `code=${code ?? 0}`;
    console.error(`[cyberboss] ${label} stopped (${detail}); stopping service`);
    stopAll("SIGTERM");
    process.exitCode = code || 1;
  });
}

function startGardenBridge() {
  const token = normalizeText(
    process.env.GARDEN_MACHINE_TOKEN || process.env.GALATEA_GARDEN_MCP_TOKEN
  );
  if (!token) {
    console.log("[cyberboss] Garden wake bridge disabled: no machine token configured");
    return null;
  }

  const bridgeCli = normalizeText(process.env.GARDEN_WAKE_BRIDGE_CLI)
    || "/opt/galatea-garden-wake-bridge/dist/cli.js";
  const injector = path.join(rootDir, "scripts", "inject-garden-wake.js");
  const env = {
    ...process.env,
    GARDEN_BASE_URL: normalizeText(process.env.GARDEN_BASE_URL)
      || "https://galatea.abysslumina.com",
    GARDEN_MACHINE_TOKEN: token,
    GARDEN_INJECTOR_EXECUTABLE: process.execPath,
    GARDEN_INJECTOR_ARGS_JSON: JSON.stringify([injector]),
    GARDEN_INJECTOR_WORKING_DIRECTORY: rootDir,
  };
  console.log("[cyberboss] starting Galatea Garden wake bridge");
  return spawnNode([bridgeCli, "run"], { env });
}

function main() {
  const bridge = startGardenBridge();
  if (bridge) watch(bridge, "Garden wake bridge");

  const cyberboss = spawnNode([path.join(rootDir, "scripts", "shared-start.js")]);
  watch(cyberboss, "Cyberboss");

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stopAll(signal);
      process.exitCode = 0;
    });
  }
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

main();
