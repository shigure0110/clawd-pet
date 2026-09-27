// notify_util.js - shared by replay.js and check_notify.js: which notify script a replay may run, and the
// port guard. Rules (lead decision 5, spec §0.3):
//   - hooks/notify.js is the LIVE hook: it is never run by QA (it hard-codes port 31126) and never edited.
//   - default target: hooks/notify.next.js (executor B's Gate 3 hook), run with CLAWD_PORT=<dev port>.
//   - "baseline": a copy of git HEAD:hooks/notify.js written to tmp/c/notify_baseline.js with ONLY its port
//     line changed to read CLAWD_PORT (and throw without it). It stands for "old notify": the plain
//     status POSTs of today's hook, without the Gate 3 fields.
//   - "ref": tools/qa/dev/ref_notify.js, the QA reference implementation of §4.6 (self-test only).
//   - Any script must read CLAWD_PORT; one that still hard-codes `const PORT = 31126` is refused.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DEV_DIR = __dirname;
const REPO = path.resolve(DEV_DIR, "..", "..", "..");
const HOOKS_DIR = path.join(DEV_DIR, "hooks");
const LIVE_HOOK = path.join(REPO, "hooks", "notify.js");
const LIVE_PORT = 31126;

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function safePort(p) {
  const n = Number(p);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) throw new Error(`bad port ${p}`);
  if (n === LIVE_PORT) throw new Error("port 31126 is the live pet: refused");
  return n;
}

const BASE_LINE = "const PORT = 31126;";
const BASE_PATCH =
  'const PORT = Number(process.env.CLAWD_PORT) || (() => { throw new Error("CLAWD_PORT required (QA baseline copy)"); })();';

// git HEAD:hooks/notify.js with the port line patched → tmp/c/notify_baseline.js
function buildBaseline() {
  const out = path.join(REPO, "tmp", "c", "notify_baseline.js");
  let src = execFileSync("git", ["show", "HEAD:hooks/notify.js"], { cwd: REPO, encoding: "utf8" });
  const n = src.split(BASE_LINE).length - 1;
  if (n !== 1) throw new Error(`baseline: expected exactly one "${BASE_LINE}" in HEAD:hooks/notify.js, found ${n}`);
  src = src.replace(BASE_LINE, BASE_PATCH);
  src = "// QA BASELINE COPY of git HEAD:hooks/notify.js (tools/qa/dev/notify_util.js). Port from CLAWD_PORT only.\n// Never registered as a hook; replayed only against the dev pet or a capture server.\n" + src;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, src);
  return out;
}

// which: "next" (default) | "baseline" | "ref" | a path
function resolveNotify(which) {
  let p, label;
  if (!which || which === "next") [p, label] = [path.join(REPO, "hooks", "notify.next.js"), "next"];
  else if (which === "baseline") [p, label] = [buildBaseline(), "baseline"];
  else if (which === "ref") [p, label] = [path.join(DEV_DIR, "ref_notify.js"), "ref"];
  else [p, label] = [path.resolve(which), "custom"];
  if (same(p, LIVE_HOOK)) throw new Error("hooks/notify.js is the LIVE hook (port 31126): QA never runs it. Use hooks/notify.next.js.");
  if (!fs.existsSync(p)) {
    const e = new Error(`${path.relative(REPO, p)} does not exist${label === "next" ? " yet (executor B, Gate 3 / lead decision 5)" : ""}`);
    e.code = "NO_NOTIFY";
    throw e;
  }
  const text = fs.readFileSync(p, "utf8");
  if (!text.includes("CLAWD_PORT")) throw new Error(`${path.relative(REPO, p)} does not read CLAWD_PORT: it would post to the live pet. Refused.`);
  if (/const\s+PORT\s*=\s*31126\s*;/.test(text)) throw new Error(`${path.relative(REPO, p)} hard-codes PORT = 31126. Refused.`);
  return { path: p, label };
}

// a fixture token → absolute path (name, name.json, or a path)
function fixturePath(tok) {
  const cands = [tok, path.join(HOOKS_DIR, tok), path.join(HOOKS_DIR, tok + ".json")];
  for (const c of cands) if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.resolve(c);
  throw new Error(`no fixture "${tok}" in ${path.relative(REPO, HOOKS_DIR)}`);
}

// a sequence file (one fixture or +ms per line, # comments)
function readSeq(tok) {
  const cands = [tok, path.join(HOOKS_DIR, tok), path.join(HOOKS_DIR, tok + ".txt")];
  const f = cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  if (!f) throw new Error(`no sequence "${tok}"`);
  return fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.replace(/#.*/, "").trim()).filter(Boolean);
}

// The child environment for a notify run: the dev port, no revive, never the autoconfig switch
function childEnv(port) {
  const env = { ...process.env, CLAWD_PORT: String(safePort(port)), CLAWD_NO_REVIVE: "1" };
  delete env.CCPET_AUTOCONFIG;
  return env;
}

module.exports = { REPO, DEV_DIR, HOOKS_DIR, LIVE_HOOK, safePort, resolveNotify, buildBaseline, fixturePath, readSeq, childEnv };
