#!/usr/bin/env node
// Author tool: turn a plain text Chinese story into a tokenized JSON file
// the reader app can consume.
//
// Usage:
//   npm install --no-save pinyin-pro
//   node scripts/add-pinyin.mjs <input.txt> <id> "<Title>" <level> <estMinutes> [tag1,tag2]
//
// Example:
//   node scripts/add-pinyin.mjs raw/new-story.txt p4-new-story "新故事" P4 4 fable,animals \
//     > stories/p4-new-story.json
//
// IMPORTANT: pinyin-pro picks one reading for each polyphone character. Always
// have a teacher review the generated file before classroom use.

import { readFileSync } from "node:fs";
import { pinyin } from "pinyin-pro";

const [, , inputPath, id, title, level, estMinutes, tagsCsv = ""] = process.argv;

if (!inputPath || !id || !title || !level || !estMinutes) {
  console.error(
    "Usage: node scripts/add-pinyin.mjs <input.txt> <id> <title> <level> <estMinutes> [tagsCsv]"
  );
  process.exit(1);
}

const raw = readFileSync(inputPath, "utf8").replace(/\r\n/g, "\n");

const tokens = [];
for (const ch of raw) {
  if (ch === "\n") {
    tokens.push({ char: "\n", pinyin: "" });
    continue;
  }
  if (/\s/.test(ch)) continue;
  const isHan = /[一-鿿]/.test(ch);
  if (isHan) {
    const py = pinyin(ch, { toneType: "symbol", type: "string", v: true });
    tokens.push({ char: ch, pinyin: py });
  } else {
    tokens.push({ char: ch, pinyin: "" });
  }
}

const tags = tagsCsv ? tagsCsv.split(",").map((t) => t.trim()).filter(Boolean) : [];

const story = {
  id,
  title,
  level,
  estMinutes: Number(estMinutes),
  tags,
  tokens,
};

process.stdout.write(JSON.stringify(story, null, 2) + "\n");
