#!/usr/bin/env node
// Activate hooks/notify.next.js as the live hook (hooks/notify.js), atomically.
//
//   node scripts/activate-notify.js              swap notify.next.js in
//   node scripts/activate-notify.js --rollback   put hooks/notify.prev.js back
//
// Every Claude Code session on this machine runs hooks/notify.js on every tool call, so the file is
// never edited in place:
//   1. copy the candidate to hooks/notify.js.new
//   2. node --check it (through stdin: Node refuses --check on a ".new" extension)
//   3. sample run: pipe a PreToolUse payload through it with CLAWD_PORT=31127 CLAWD_NO_REVIVE=1
//      (a dev port, never the live pet's 31126), and require exit code 0. A file that ignores
//      CLAWD_PORT (the old notify.js, on --rollback) gets the syntax check only: its sample
//      would land on the live pet.
//   4. keep the current hooks/notify.js as hooks/notify.prev.js (written once, on the first
//      activation; a later different live hook goes to notify.prev.<stamp>.js instead). A candidate
//      that is already live is a no-op, so running the script twice never touches the backup
//   5. rename notify.js.new over notify.js; a hook may be reading the file, so EBUSY / EPERM are
//      retried up to 10 times, 50 ms apart
//   6. node --check hooks/notify.js and the sample run again; if that fails, notify.prev.js is put
//      back the same way
// Afterwards, make any tool call in a Claude Code session and check that
// http://127.0.0.1:31126/status shows a fresh message.
// Nothing outside hooks/ is written; ~/.claude/settings.json is not touched.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const HOOKS = path.join(__dirname, "..", "hooks");
const LIVE = path.join(HOOKS, "notify.js");
const NEXT = path.join(HOOKS, "notify.next.js");
const PREV = path.join(HOOKS, "notify.prev.js");
const STAGED = path.join(HOOKS, "notify.js.new");

const SAMPLE = JSON.stringify({
  session_id: "activate-notify-sample",
  transcript_path: "",
  cwd: path.join(__dirname, ".."),
  permission_mode: "default",
  hook_event_name: "PreToolUse",
  tool_name: "Read",
  tool_input: { file_path: "README.md" },
  tool_use_id: "toolu_activate_sample",
});

function fail(msg) {
  console.error(`activate-notify: ${msg}`);
  process.exit(1);
}

function syntaxCheck(file) {
  // stdin: `node --check file.new` fails on the extension; stdin is parsed as CommonJS, like a hook
  const r = spawnSync(process.execPath, ["--check"], { input: fs.readFileSync(file), encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`node --check ${path.basename(file)} failed:\n${r.stderr || r.stdout}`);
}

// A hook that ignores CLAWD_PORT (the notify.js from before this change hard-codes 31126) would
// post the sample to the live pet: then only its syntax check counts. Returns false when skipped.
function sampleRun(file) {
  if (!/process\.env\.CLAWD_PORT/.test(fs.readFileSync(file, "utf8"))) {
    console.log(`${path.basename(file)} does not read CLAWD_PORT: sample run skipped (it would reach the live pet)`);
    return false;
  }
  const r = spawnSync(process.execPath, [file, "PreToolUse"], {
    input: SAMPLE,
    env: { ...process.env, CLAWD_PORT: "31127", CLAWD_NO_REVIVE: "1" },
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });
  if (r.error) throw new Error(`sample run of ${path.basename(file)} failed: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`sample run of ${path.basename(file)} exited ${r.status}:\n${r.stderr}`);
  return true;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Rename with retries (a running hook may hold the target open for a moment)
function renameRetry(from, to) {
  for (let i = 1; i <= 10; i++) {
    try {
      fs.renameSync(from, to);
      return i;
    } catch (e) {
      if ((e.code !== "EBUSY" && e.code !== "EPERM") || i === 10) throw e;
      sleep(50);
    }
  }
  return 0;
}

function sameBytes(a, b) {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch (e) {
    return false;
  }
}

function stampName(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// notify.prev.js is the hook that was live before the first activation, and --rollback returns to
// it: it is written once and never overwritten. A live hook that is neither that backup nor the
// candidate (an earlier activation of an older notify.next.js) is kept as notify.prev.<stamp>.js,
// so re-running this script never loses a hook.
function backUpLive() {
  if (!fs.existsSync(LIVE)) return;
  if (!fs.existsSync(PREV)) {
    fs.copyFileSync(LIVE, PREV);
    return;
  }
  if (sameBytes(LIVE, PREV) || sameBytes(LIVE, NEXT)) return;
  const extra = path.join(HOOKS, `notify.prev.${stampName()}.js`);
  fs.copyFileSync(LIVE, extra);
  console.log(`notify.prev.js already holds the original hook; the replaced one is kept as hooks/${path.basename(extra)}`);
}

// Stage `source`, check it, then swap it over the live hook (backing the live one up first when
// `backup` is set). Returns the number of rename tries.
function swapIn(source, backup) {
  fs.copyFileSync(source, STAGED);
  try {
    syntaxCheck(STAGED);
    sampleRun(STAGED);
  } catch (e) {
    fs.rmSync(STAGED, { force: true });
    throw e;
  }
  if (backup) backUpLive();
  try {
    return renameRetry(STAGED, LIVE);
  } catch (e) {
    fs.rmSync(STAGED, { force: true });
    throw new Error(`rename failed (${e.code}); hooks/notify.js was left unchanged`);
  }
}

function verifyLive() {
  syntaxCheck(LIVE);
  return sampleRun(LIVE);
}

const rollback = process.argv.includes("--rollback");
const source = rollback ? PREV : NEXT;
if (!fs.existsSync(source)) fail(`${path.relative(process.cwd(), source)} not found`);
if (fs.existsSync(STAGED)) fs.rmSync(STAGED, { force: true }); // a leftover from an interrupted run
// Nothing to swap: running the script twice must not touch the backup
if (fs.existsSync(LIVE) && sameBytes(LIVE, source)) {
  console.log(rollback ? "hooks/notify.js already is notify.prev.js: nothing to roll back" : "notify.next.js is already active: nothing to do");
  process.exit(0);
}

try {
  const tries = swapIn(source, !rollback);
  console.log(`${rollback ? "notify.prev.js" : "notify.next.js"} checked and renamed over hooks/notify.js (try ${tries})`);
} catch (e) {
  fail(e.message);
}

try {
  const sampled = verifyLive();
  console.log(`hooks/notify.js: node --check ok${sampled ? ", sample run exit 0" : ""}`);
} catch (e) {
  console.error(`activate-notify: the live file failed its check after the swap:\n${e.message}`);
  if (!rollback && fs.existsSync(PREV)) {
    try {
      swapIn(PREV, false);
      verifyLive();
      console.error("activate-notify: restored the previous hooks/notify.js from notify.prev.js");
    } catch (e2) {
      console.error(`activate-notify: restoring notify.prev.js failed too: ${e2.message}`);
    }
  }
  process.exit(1);
}

if (!rollback) console.log("backup of the previous hook: hooks/notify.prev.js (undo with: node scripts/activate-notify.js --rollback)");
console.log("Now make any tool call in a Claude Code session and check http://127.0.0.1:31126/status for a fresh message.");
