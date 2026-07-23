"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { parseEnvelope } = require("../scripts/inject-garden-wake");

test("accepts the versioned Garden wake envelope", () => {
  assert.deepEqual(
    parseEnvelope(JSON.stringify({
      version: 1,
      type: "garden_wake",
      reason: "game_turn_required",
      message: "游戏轮到你了。",
    })),
    {
      reason: "game_turn_required",
      message: "游戏轮到你了。",
    }
  );
});

test("rejects malformed and unsupported envelopes", () => {
  assert.throws(() => parseEnvelope(""), /empty/);
  assert.throws(() => parseEnvelope("{"), /valid JSON/);
  assert.throws(
    () => parseEnvelope(JSON.stringify({ version: 2, type: "garden_wake", message: "wake" })),
    /Unsupported/
  );
  assert.throws(
    () => parseEnvelope(JSON.stringify({ version: 1, type: "garden_wake", message: "" })),
    /missing or too long/
  );
});
