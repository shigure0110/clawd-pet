#!/usr/bin/env node
// check_notify.js - F1 / §4.6 checks of a notify script against every fixture, WITHOUT any pet: it runs
// the script with CLAWD_PORT pointing at its own capture server (127.0.0.1, an ephemeral port, never
// 31126/31127) and compares each POST /status body with hooks/expected.json.
//
//   node tools/qa/dev/check_notify.js [--notify next|baseline|ref|<path>] [--runs 10] [--only <fixture>] [--no-timing]
//
// Checks per fixture (FAIL = exit 1):
//   legacy   status / sessionId / cwd / event as today's hook sends them; the message regex (Stop and
//            UserPromptSubmit only for next/ref: their strings change in edit #2)
//   fields   the §4.6 tags named in expected.json (tool, kind, cmd, ok, verdict, source, ntype, mode,
//            toolUseId, limit); "" and null mean empty (absent, "" or null all pass)
//   domain   kind / cmd / verdict / ok / limit values are tags from §4.6 only; tool <= 40 chars
//   privacy  no QA_SENTINEL_OUTPUT / QA_SENTINEL_PROMPT (output, prompt, agent prompt, last message)
//            anywhere in the POST; no CJK text (the Chinese strings are gone)
// Timing (F1): median wall time of --runs runs of `notify PreToolUse < pre_read_1.json` for the target
// and for the baseline copy (old notify); FAIL when the target is more than 5 ms slower.
// With --notify baseline only the legacy part is checked (old notify sends no new fields).
// Report: tools/qa/out/dev/notify_check_<label>.tsv
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const U = require("./notify_util");

const argv = process.argv.slice(2);
const val = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};
const which = val("--notify", "next");
const RUNS = Number(val("--runs", 10));
const ONLY = val("--only", null);
const TIMING = !argv.includes("--no-timing");

let target;
try {
  target = U.resolveNotify(which);
} catch (e) {
  console.error("check_notify: " + e.message);
  process.exit(e.code === "NO_NOTIFY" ? 3 : 2);
}
const legacyOnly = target.label === "baseline";
const expected = JSON.parse(fs.readFileSync(path.join(U.HOOKS_DIR, "expected.json"), "utf8"));
const OUT_DIR = path.join(U.REPO, "tools", "qa", "out", "dev");
fs.mkdirSync(OUT_DIR, { recursive: true });

const rows = [["fixture", "check", "result", "detail"]];
let fails = 0;
function res(fx, check, ok, detail = "") {
  const r = ok === true ? "PASS" : ok === false ? "FAIL" : ok;
  if (r === "FAIL") fails++;
  rows.push([fx, check, r, String(detail).replace(/\s+/g, " ").slice(0, 300)]);
  if (r !== "PASS") console.log(`  [${r}] ${fx}: ${check}${detail ? " - " + String(detail).slice(0, 200) : ""}`);
}

// capture server
let bodies = [];
const server = http.createServer((req, res) => {
  let b = "";
  req.setEncoding("utf8");
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    bodies.push({ url: req.url, method: req.method, raw: b });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
  });
});

function run(notifyPath, fixtureFile, port) {
  return new Promise((resolve) => {
    const payload = JSON.parse(fs.readFileSync(fixtureFile, "utf8"));
    const t0 = process.hrtime.bigint();
    const child = spawn(process.execPath, [notifyPath, payload.hook_event_name], { env: U.childEnv(port), stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    const kill = setTimeout(() => child.kill(), 5000);
    child.on("close", (code) => {
      clearTimeout(kill);
      resolve({ code, ms: Number(process.hrtime.bigint() - t0) / 1e6, err: err.trim(), payload });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(payload));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const empty = (v) => v === undefined || v === null || v === "";

const KINDS = new Set(["shell", "read", "edit", "web", "agent", "todo", "mcp", "other"]);
const CMDS = new Set(["test", "git-commit", "git-push"]);
const VERDICTS = new Set(["pass", "fail"]);
const NEW_FIELDS = ["tool", "kind", "cmd", "ok", "verdict", "source", "ntype", "mode", "toolUseId", "limit"];
const LEGACY_KEYS = new Set(["status", "message", "sessionId", "cwd", "event"]);
const CJK = /[　-〿㐀-鿿＀-￯]/;

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  if (port === 31126 || port === 31127) throw new Error("capture server got a pet port; rerun");
  console.log(`check_notify: ${path.relative(U.REPO, target.path)} (${target.label}) → capture server 127.0.0.1:${port}`);

  const names = Object.keys(expected.fixtures).filter((n) => !ONLY || n === ONLY);
  for (const name of names) {
    const exp = expected.fixtures[name];
    bodies = [];
    const r = await run(target.path, U.fixturePath(name), port);
    await sleep(60);
    res(name, "exit code 0", r.code === 0, r.code === 0 ? "" : `exit ${r.code} ${r.err}`);
    const posts = bodies.filter((b) => b.url === "/status" && b.method === "POST");
    if (posts.length !== 1) {
      res(name, "exactly one POST /status", false, `${posts.length} posts`);
      continue;
    }
    let body;
    try {
      body = JSON.parse(posts[0].raw);
    } catch (e) {
      res(name, "POST body is JSON", false, posts[0].raw.slice(0, 120));
      continue;
    }
    // legacy
    res(name, `status = ${exp.status}`, body.status === exp.status, body.status);
    res(name, "sessionId", body.sessionId === (exp.sessionId || expected.sessions.A), body.sessionId);
    res(name, "cwd unchanged", body.cwd === r.payload.cwd, body.cwd);
    res(name, `event = ${exp.event}`, body.event === exp.event, body.event);
    if (exp.message && !(legacyOnly && exp.messageChanged)) res(name, `message /${exp.message}/`, new RegExp(exp.message).test(body.message || ""), body.message);
    // privacy: tool output / the last assistant message never leave the hook; the user's prompt never
    // does either. The legacy `message` (80 chars of a tool detail, e.g. an Agent prompt) is today's
    // behaviour and unchanged in this build (§0.6): reported as INFO, not failed.
    res(name, "no tool output / last message in the POST", !/QA_SENTINEL_OUTPUT/.test(posts[0].raw), (posts[0].raw.match(/.{0,30}QA_SENTINEL_OUTPUT/) || [""])[0]);
    const newVals = NEW_FIELDS.map((k) => (typeof body[k] === "string" ? body[k] : "")).join(" ");
    res(name, "no prompt text in the new fields", !/QA_SENTINEL_PROMPT/.test(newVals), newVals.slice(0, 80));
    if (/QA_SENTINEL_PROMPT/.test(body.message || "")) {
      const toolDetail = (exp.event === "PreToolUse" || exp.event === "PostToolUse") && body.message.startsWith(`${r.payload.tool_name}: `);
      res(name, "prompt text in the legacy message", toolDetail ? "INFO" : false, toolDetail ? "tool detail (§0.6, unchanged this build)" : body.message.slice(0, 80));
    }
    if (legacyOnly) {
      const extra = Object.keys(body).filter((k) => !LEGACY_KEYS.has(k));
      res(name, "old notify: legacy keys only", extra.length === 0 ? true : "INFO", extra.join(","));
      continue;
    }
    res(name, "no CJK text", !CJK.test(posts[0].raw), (posts[0].raw.match(CJK) || [""])[0]);
    // fields
    for (const [k, want] of Object.entries(exp.fields || {})) {
      const got = body[k];
      const ok = want === null || want === "" ? empty(got) : got === want;
      res(name, `${k} = ${JSON.stringify(want)}`, ok, JSON.stringify(got));
    }
    // domain
    if (!empty(body.kind)) res(name, "kind is a §4.6 tag", KINDS.has(body.kind), body.kind);
    if (!empty(body.cmd)) res(name, "cmd is a §4.6 tag", CMDS.has(body.cmd), body.cmd);
    if (!empty(body.verdict)) res(name, "verdict is a §4.6 tag", VERDICTS.has(body.verdict), body.verdict);
    if (!empty(body.ok)) res(name, "ok is boolean", typeof body.ok === "boolean", JSON.stringify(body.ok));
    if (!empty(body.limit)) res(name, "limit is boolean", typeof body.limit === "boolean", JSON.stringify(body.limit));
    if (!empty(body.tool)) res(name, "tool <= 40 chars", String(body.tool).length <= 40, String(body.tool).length);
    for (const k of ["source", "ntype", "mode", "toolUseId"])
      if (!empty(body[k])) res(name, `${k} is a short tag`, typeof body[k] === "string" && body[k].length <= 64 && !/\s/.test(body[k]), body[k]);
    const extra = Object.keys(body).filter((k) => !LEGACY_KEYS.has(k) && !NEW_FIELDS.includes(k));
    if (extra.length) res(name, "extra keys", "INFO", extra.join(","));
  }

  if (TIMING && RUNS > 0) {
    const fx = U.fixturePath("pre_read_1");
    const med = (t) => {
      t.sort((a, b) => a - b);
      return t.length % 2 ? t[(t.length - 1) / 2] : (t[t.length / 2 - 1] + t[t.length / 2]) / 2;
    };
    // target and old notify interleaved run by run, so machine-load drift hits both alike
    const pb = target.label === "baseline" ? null : U.resolveNotify("baseline").path;
    await run(target.path, fx, port); // warm the file cache
    if (pb) await run(pb, fx, port);
    const tt = [];
    const tb = [];
    for (let i = 0; i < RUNS; i++) {
      tt.push((await run(target.path, fx, port)).ms);
      if (pb) tb.push((await run(pb, fx, port)).ms);
    }
    const mt = med(tt);
    if (!pb) res("timing", `median of ${RUNS} runs (old notify)`, "INFO", `${mt.toFixed(1)} ms`);
    else {
      const mb = med(tb);
      const d = mt - mb;
      res("timing", `median of ${RUNS} runs vs old notify: +${d.toFixed(1)} ms (limit 5 ms)`, target.label === "next" ? d <= 5 : "INFO", `${target.label} ${mt.toFixed(1)} ms, old ${mb.toFixed(1)} ms`);
    }
  }

  server.close();
  const file = path.join(OUT_DIR, `notify_check_${target.label}.tsv`);
  fs.writeFileSync(file, rows.map((r) => r.join("\t")).join("\n") + "\n");
  const n = (k) => rows.filter((r) => r[2] === k).length;
  console.log(`check_notify (${target.label}): PASS ${n("PASS")}  FAIL ${n("FAIL")}  INFO ${n("INFO")}  → ${path.relative(U.REPO, file)}`);
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error("check_notify: " + e.message);
  process.exit(2);
});
