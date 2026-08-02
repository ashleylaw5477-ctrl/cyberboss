#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const children = new Set();
let stopping = false;

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || rootDir,
    env: options.env || process.env,
    stdio: "inherit",
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function spawnNode(args, options = {}) {
  return spawnProcess(process.execPath, args, options);
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

function startDashboard() {
  const enabled = normalizeText(process.env.CYBERBOSS_DASHBOARD_ENABLED).toLowerCase();
  if (["0", "false", "no", "off"].includes(enabled)) {
    console.log("[cyberboss] dashboard disabled");
    return null;
  }
  console.log(`[cyberboss] starting dashboard port=${normalizeText(process.env.PORT) || "3000"}`);
  return spawnNode([path.join(rootDir, "scripts", "dashboard-start.js")]);
}

function startFeedlingResident() {
  const enabled = normalizeText(process.env.FEEDLING_RESIDENT_ENABLED).toLowerCase();
  if (["0", "false", "no", "off"].includes(enabled)) {
    console.log("[cyberboss] Feedling resident consumer disabled");
    return null;
  }

  const apiUrl = normalizeText(process.env.FEEDLING_API_URL);
  const apiKey = normalizeText(process.env.FEEDLING_API_KEY);
  const runtimeTokenFile = normalizeText(process.env.FEEDLING_RUNTIME_TOKEN_FILE);
  const enclaveUrl = normalizeText(process.env.FEEDLING_ENCLAVE_URL);
  if (!apiUrl || (!apiKey && !runtimeTokenFile) || !enclaveUrl) {
    console.log(
      "[cyberboss] Feedling resident consumer disabled: "
      + "FEEDLING_API_URL, FEEDLING_API_KEY (or FEEDLING_RUNTIME_TOKEN_FILE), "
      + "and FEEDLING_ENCLAVE_URL are required"
    );
    return null;
  }

  const runtime = normalizeRuntime(process.env.CYBERBOSS_RUNTIME || "claudecode");
  const home = normalizeText(process.env.HOME) || "/data/home";
  const env = {
    ...process.env,
    AGENT_MODE: "cli",
    FEEDLING_CONSUMER_DIR: normalizeText(process.env.FEEDLING_CONSUMER_DIR)
      || "/opt/feedling-mcp",
  };
  reportConsumerRevision(env.FEEDLING_CONSUMER_DIR);

  if (runtime === "claudecode") {
    const profile = normalizeText(process.env.CLAUDE_CONFIG_DIR)
      || path.join(home, ".claude");
    const command = normalizeText(process.env.CYBERBOSS_CLAUDE_COMMAND) || "claude";
    env.CLAUDE_CONFIG_DIR = profile;
    env.AGENT_CLI_CMD = normalizeText(process.env.FEEDLING_AGENT_CLI_CMD)
      || `${command} --print --output-format json "{message}"`;
    env.AGENT_CLI_PATH = normalizeText(process.env.AGENT_CLI_PATH)
      || "/usr/local/bin:/usr/bin:/bin";
    console.log(`[cyberboss] Feedling resident runtime=claudecode profile=${profile}`);
  } else if (runtime === "codex") {
    const profile = normalizeText(process.env.CODEX_HOME)
      || path.join(home, ".codex");
    const command = normalizeText(process.env.CYBERBOSS_CODEX_COMMAND) || "codex";
    env.CODEX_HOME = profile;
    env.AGENT_CLI_CMD = normalizeText(process.env.FEEDLING_AGENT_CLI_CMD)
      || `${command} exec --json "{message}"`;
    env.AGENT_CLI_PATH = normalizeText(process.env.AGENT_CLI_PATH)
      || "/usr/local/bin:/usr/bin:/bin";
    console.log(`[cyberboss] Feedling resident runtime=codex profile=${profile}`);
  } else {
    throw new Error(`unsupported CYBERBOSS_RUNTIME for Feedling resident: ${runtime}`);
  }

  const python = normalizeText(process.env.FEEDLING_CONSUMER_PYTHON)
    || "/opt/feedling-venv/bin/python";
  const consumer = path.join(env.FEEDLING_CONSUMER_DIR, "tools", "chat_resident_consumer.py");
  console.log(`[cyberboss] starting Feedling resident consumer checkout=${env.FEEDLING_CONSUMER_DIR}`);
  return spawnProcess(python, [consumer], {
    cwd: env.FEEDLING_CONSUMER_DIR,
    env,
  });
}

function reportConsumerRevision(consumerDir) {
  const head = gitRevision(consumerDir, ["rev-parse", "HEAD"]);
  const originMain = gitRevision(consumerDir, ["rev-parse", "origin/main"]);
  if (!head || !originMain) {
    throw new Error(`official Feedling consumer checkout is incomplete: ${consumerDir}`);
  }
  console.log(`[cyberboss] Feedling consumer HEAD=${head} origin/main=${originMain}`);
  if (head !== originMain) {
    throw new Error("official Feedling consumer checkout is not fast-forwarded to origin/main");
  }
}

function gitRevision(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 ? normalizeText(result.stdout) : "";
}

function normalizeRuntime(value) {
  const runtime = normalizeText(value).toLowerCase();
  if (["claude", "claudecode", "claude-code"].includes(runtime)) return "claudecode";
  if (["codex", "codex-cli"].includes(runtime)) return "codex";
  return runtime;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function main() {
  const resident = startFeedlingResident();
  if (resident) watch(resident, "Feedling resident consumer");

  const bridge = startGardenBridge();
  if (bridge) watch(bridge, "Garden wake bridge");

  const dashboard = startDashboard();
  if (dashboard) watch(dashboard, "Dashboard");

  const cyberboss = spawnNode([path.join(rootDir, "scripts", "shared-start.js")]);
  watch(cyberboss, "Cyberboss");

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stopAll(signal);
      process.exitCode = 0;
    });
  }
}

main();
