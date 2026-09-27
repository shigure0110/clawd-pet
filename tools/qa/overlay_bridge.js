#!/usr/bin/env node
// overlay_bridge.js - lets contact_sheet.py place hats and emotes with the RUNTIME maths
// (renderer/overlay.js, executor B) instead of a Python re-implementation that can drift.
// Line protocol over stdin/stdout (one JSON value per line):
//   in:  first line = the CLAWD_META object; then [fn, rowName, frame, opts] with fn "hatBox" | "emoteBox"
//   out: "ready" after the meta line; then one JSON result per request ({error} on an exception)
//   node tools/qa/overlay_bridge.js <path to overlay.js>
"use strict";
const path = require("path");
const readline = require("readline");

const file = path.resolve(process.argv[2] || path.join(__dirname, "..", "..", "renderer", "overlay.js"));
let OV;
try {
  OV = require(file);
} catch (e) {
  process.stdout.write(JSON.stringify({ error: "cannot load " + file + ": " + e.message }) + "\n");
  process.exit(1);
}
if (!OV || typeof OV.hatBox !== "function" || typeof OV.emoteBox !== "function") {
  process.stdout.write(JSON.stringify({ error: file + " does not export hatBox / emoteBox" }) + "\n");
  process.exit(1);
}
let meta = null;
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let out;
  try {
    const v = JSON.parse(line);
    if (meta === null) {
      meta = v;
      out = "ready";
    } else {
      const [fn, row, frame, opts] = v;
      out = OV[fn](meta, row, frame, opts || {});
    }
  } catch (e) {
    out = { error: String(e && e.message) };
  }
  process.stdout.write(JSON.stringify(out) + "\n");
});
