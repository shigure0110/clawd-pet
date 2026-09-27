#!/usr/bin/env node
// replay.js - pipes Gate 3 hook fixtures through a notify script into the DEV pet (driver behind replay.sh).
// Per fixture it runs exactly:  CLAWD_PORT=<port> CLAWD_NO_REVIVE=1 node <notify> <hook_event_name> < fixture
//
//   node tools/qa/dev/replay.js [options] <token> ...
//     token        a fixture name in tools/qa/dev/hooks/ (".json" optional) or a path; "+<ms>" pauses
//     --seq <f>    tokens from a sequence file (hooks/seq_*.txt); may repeat, mixes with plain tokens
//     --notify n   next (default: hooks/notify.next.js) | baseline (old notify, git HEAD copy) | ref | <path>
//     --port p     default $CLAWD_QA_PORT or 31127; 31126 (the live pet) is refused
//     -s <sid>     replace the fixtures' session A id (focus); -S <sid> replaces session B
//     -u <sfx>     append "_<sfx>" to every tool_use_id (a Pre and its Post stay paired)
//     -m <mode>    override permission_mode
//     -g <ms>      fixed-rate mode: start event i at i*ms without waiting for the previous one to exit
//                  (the 10-event burst); default waits for each notify to exit, then the next token
//     -q           quiet (errors only)
// Output: one line per event; exit 1 when a notify run failed or timed out (4 s).
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const U = require("./notify_util");

const args = process.argv.slice(2);
const opt = { notify: "next", port: process.env.CLAWD_QA_PORT || 31127, sid: null, sid2: null, sfx: null, mode: null, gap: null, quiet: false };
const tokens = [];
try {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => {
      if (i + 1 >= args.length) throw new Error(`${a} needs a value`);
      return args[++i];
    };
    if (a === "--notify") opt.notify = next();
    else if (a === "--port") opt.port = next();
    else if (a === "--seq") tokens.push(...U.readSeq(next()));
    else if (a === "-s") opt.sid = next();
    else if (a === "-S") opt.sid2 = next();
    else if (a === "-u") opt.sfx = next();
    else if (a === "-m") opt.mode = next();
    else if (a === "-g") opt.gap = Number(next());
    else if (a === "-q") opt.quiet = true;
    else if (a === "--check") opt.check = true; // only resolve the notify script (exit 0 / 2 / 3)
    else if (a === "-h" || a === "--help") {
      console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 18).join("\n"));
      process.exit(0);
    } else tokens.push(a);
  }
  opt.port = U.safePort(opt.port);
} catch (e) {
  console.error("replay: " + e.message);
  process.exit(2);
}
let notify;
try {
  notify = U.resolveNotify(opt.notify);
} catch (e) {
  console.error("replay: " + e.message);
  process.exit(e.code === "NO_NOTIFY" ? 3 : 2);
}
if (opt.check) {
  console.log(`replay: ${path.relative(U.REPO, notify.path)} (${notify.label}) ok, port ${opt.port}`);
  process.exit(0);
}
if (!tokens.length) {
  console.error("replay: no fixture given (see --help)");
  process.exit(2);
}
const expected = JSON.parse(fs.readFileSync(path.join(U.HOOKS_DIR, "expected.json"), "utf8"));
const SID_A = expected.sessions.A;
const SID_B = expected.sessions.B;

function load(tok) {
  const file = U.fixturePath(tok);
  const p = JSON.parse(fs.readFileSync(file, "utf8"));
  if (opt.sid && p.session_id === SID_A) p.session_id = opt.sid;
  if (opt.sid2 && p.session_id === SID_B) p.session_id = opt.sid2;
  if (opt.sfx && typeof p.tool_use_id === "string") p.tool_use_id += "_" + opt.sfx;
  if (opt.mode && "permission_mode" in p) p.permission_mode = opt.mode;
  return { name: path.basename(file, ".json"), payload: p, event: p.hook_event_name || "" };
}

function runOne(item) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const child = spawn(process.execPath, [notify.path, item.event], { env: U.childEnv(opt.port), stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    const kill = setTimeout(() => {
      err += " (timeout 4 s)";
      child.kill();
    }, 4000);
    child.on("close", (code) => {
      clearTimeout(kill);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const ok = code === 0 && !/timeout/.test(err);
      if (!opt.quiet || !ok)
        console.log(`replay ${item.name} ${item.event} sid=${item.payload.session_id.slice(0, 12)} exit=${code} ${ms.toFixed(0)}ms${err.trim() ? " stderr: " + err.trim().slice(0, 200) : ""}`);
      resolve(ok);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(item.payload));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let items;
  try {
    items = tokens.map((t) => (/^\+\d+$/.test(t) ? { pause: Number(t.slice(1)) } : load(t)));
  } catch (e) {
    console.error("replay: " + e.message);
    process.exit(2);
  }
  if (!opt.quiet) console.log(`replay → 127.0.0.1:${opt.port} via ${path.relative(U.REPO, notify.path)} (${notify.label})`);
  let allOk = true;
  if (opt.gap != null && opt.gap >= 0) {
    // fixed rate: event i starts at t0 + i*gap (pauses shift the schedule)
    const runs = [];
    const t0 = Date.now();
    let at = 0;
    for (const it of items) {
      if (it.pause != null) {
        at += it.pause;
        continue;
      }
      const wait = t0 + at - Date.now();
      if (wait > 0) await sleep(wait);
      runs.push(runOne(it));
      at += opt.gap;
    }
    allOk = (await Promise.all(runs)).every(Boolean);
  } else {
    for (const it of items) {
      if (it.pause != null) await sleep(it.pause);
      else allOk = (await runOne(it)) && allOk;
    }
  }
  process.exit(allOk ? 0 : 1);
})();
