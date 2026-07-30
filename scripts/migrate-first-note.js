#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { readConfig } = require("../src/core/config");
const { NoteService } = require("../src/services/note-service");

const TITLE = "Ally 的斗地主课";
const SOURCE_HEADING = "Knox 笔记备份｜Ally 的斗地主课";

async function migrateFirstNote(config = readConfig()) {
  const noteService = new NoteService({ config });
  const existing = await noteService.list({ query: TITLE });
  if (existing.some((item) => item.title === TITLE)) {
    return { created: false, reason: "already_exists", note: existing.find((item) => item.title === TITLE) };
  }
  const sourceFile = path.join(config.diaryDir, "2026-07-29.md");
  let markdown = "";
  try {
    markdown = fs.readFileSync(sourceFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return { created: false, reason: "source_missing", sourceFile };
    }
    throw error;
  }
  const body = extractDiaryEntry(markdown, SOURCE_HEADING);
  if (!body) {
    return { created: false, reason: "entry_missing", sourceFile };
  }
  const note = await noteService.create({
    title: TITLE,
    category: "游戏课",
    tags: ["斗地主", "全局观", "算牌"],
    summary: "牌权、剩余牌地图与隐藏终局组合。",
    body,
  });
  return { created: true, note, sourceFile };
}

function extractDiaryEntry(markdown, title) {
  const normalized = String(markdown || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const headingIndex = lines.findIndex((line) => {
    const match = line.match(/^##\s+\d{2}:\d{2}(?:\s+(.+))?\s*$/);
    return match?.[1]?.trim() === title;
  });
  if (headingIndex < 0) return "";
  let endIndex = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+\d{2}:\d{2}(?:\s+.+)?\s*$/.test(lines[index])) {
      endIndex = index;
      break;
    }
  }
  return lines.slice(headingIndex + 1, endIndex).join("\n").trim();
}

if (require.main === module) {
  migrateFirstNote()
    .then((result) => {
      if (result.created) {
        console.log(`[cyberboss] migrated first note: ${result.note.id}`);
      } else {
        console.log(`[cyberboss] first note migration skipped: ${result.reason}`);
      }
    })
    .catch((error) => {
      console.error(`[cyberboss] first note migration failed: ${error.stack || error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  extractDiaryEntry,
  migrateFirstNote,
};
