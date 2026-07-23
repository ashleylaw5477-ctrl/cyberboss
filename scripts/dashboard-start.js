#!/usr/bin/env node
"use strict";

const os = require("os");
const path = require("path");

try {
  require("dotenv").config({ path: path.join(process.cwd(), ".env") });
  require("dotenv").config({ path: path.join(os.homedir(), ".cyberboss", ".env") });
} catch {
  // Environment variables supplied by the host are enough.
}

const { readConfig } = require("../src/core/config");
const { createDashboardServer } = require("../src/dashboard/server");

function main() {
  const config = readConfig();
  const server = createDashboardServer({ config });
  server.listen(config.dashboardPort, config.dashboardHost, () => {
    console.log(
      `[cyberboss] dashboard=http://${config.dashboardHost}:${config.dashboardPort} auth=${process.env.CYBERBOSS_DASHBOARD_PASSWORD ? "configured" : "missing"}`
    );
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
