#!/usr/bin/env node
// ref_notify.js - QA REFERENCE IMPLEMENTATION of the Gate 3 hook fields (spec §4.6), used only to
// self-test the fixtures, replay.js and check_notify.js before executor B's hooks/notify.next.js exists.
// It is NOT the hook: it is never registered, it has no watchdog / revive, and it refuses to run
// without CLAWD_PORT (it can never reach the live pet on 31126).
//   CLAWD_PORT=31199 node tools/qa/dev/ref_notify.js PreToolUse < tools/qa/dev/hooks/pre_read_1.json
"use strict";
const http = require("http");

const PORT = Number(process.env.CLAWD_PORT) || 0;
if (!PORT || PORT === 31126) {
  console.error("ref_notify: set CLAWD_PORT to a QA port (never 31126)");
  process.exit(2);
}

const EVENT_TO_STATUS = {
  SessionStart: "idle", SessionEnd: "idle", UserPromptSubmit: "running", PreToolUse: "running", PostToolUse: "running",
  PostToolUseFailure: "error", Stop: "waiting", StopFailure: "error", Notification: "waiting", Elicitation: "waiting",
  SubagentStart: "running", SubagentStop: "running", PreCompact: "running", PostCompact: "running",
};
const KIND = {
  Bash: "shell", BashOutput: "shell", KillShell: "shell", KillBash: "shell", PowerShell: "shell",
  Read: "read", Grep: "read", Glob: "read", LS: "read", NotebookRead: "read",
  Edit: "edit", MultiEdit: "edit", Write: "edit", NotebookEdit: "edit",
  WebSearch: "web", WebFetch: "web", Agent: "agent", Task: "agent", TodoWrite: "todo",
};
// §4.6, verbatim
const PUSH_RE = /\bgit\s+push\b|\bgh\s+pr\s+create\b/;
const COMMIT_RE = /\bgit\s+commit\b/;
const TEST_RE = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bpytest\b|\b(jest|vitest|mocha)\b|\bcargo\s+test\b|\bgo\s+test\b|\bdotnet\s+test\b|--qa\b|validate\.js\b/;
const FAIL_RE = /\b\d+ (failed|failing)\b|\bFAIL(ED)?\b|AssertionError|\bError:|✗/;
const PASS_RE = /\b\d+ passed\b|\ball tests pass|\bOK \(|\b0 failed\b|✓/;
const LIMIT_RE = /(usage|rate)[ -]?limit|limit reached|quota|overloaded/i;

const truncate = (s, n) => (typeof s !== "string" ? "" : s.length <= n ? s : s.slice(0, n - 1) + "…");
function detail(name, ti) {
  if (!name || !ti) return "";
  if (name === "Bash" && ti.command) return truncate(ti.command, 80);
  if ((name === "Edit" || name === "Write" || name === "Read") && ti.file_path) return truncate(ti.file_path, 80);
  if ((name === "Glob" || name === "Grep") && ti.pattern) return truncate(ti.pattern, 80);
  if (name === "WebFetch" && ti.url) return truncate(ti.url, 80);
  if (name === "WebSearch" && ti.query) return truncate(ti.query, 80);
  if (name === "Agent" && ti.prompt) return truncate(ti.prompt, 80);
  if (typeof ti.description === "string" && ti.description.trim()) return truncate(ti.description.trim(), 80);
  return "";
}

function tags(event, p) {
  const tool = typeof p.tool_name === "string" ? p.tool_name.slice(0, 40) : "";
  const kind = tool ? KIND[tool] || (tool.startsWith("mcp__") ? "mcp" : "other") : "";
  let cmd = "";
  if (kind === "shell" && p.tool_input && typeof p.tool_input.command === "string") {
    const c = p.tool_input.command.slice(0, 300).toLowerCase();
    cmd = PUSH_RE.test(c) ? "git-push" : COMMIT_RE.test(c) ? "git-commit" : TEST_RE.test(c) ? "test" : "";
  }
  const tr = p.tool_response;
  let ok = null;
  let verdict = "";
  if (event === "PostToolUse") {
    ok = !((tr && typeof tr === "object" && (tr.interrupted === true || tr.is_error === true)) || (typeof tr === "string" && tr.startsWith("Error")));
    if (cmd === "test") {
      const text = (typeof tr === "string" ? tr : tr && typeof tr === "object" ? String(tr.stdout || "") + String(tr.stderr || "") : "").slice(-4096);
      verdict = FAIL_RE.test(text) ? "fail" : PASS_RE.test(text) ? "pass" : "";
    }
  }
  const nmsg = String(p.message || p.notification_message || "");
  return {
    tool, kind, cmd, ok, verdict,
    source: event === "SessionStart" ? String(p.source || p.start_reason || "") : "",
    ntype: event === "Notification" ? String(p.notification_type || "") : "",
    mode: typeof p.permission_mode === "string" ? p.permission_mode : "",
    toolUseId: typeof p.tool_use_id === "string" ? p.tool_use_id : "",
    limit: event === "Notification" ? LIMIT_RE.test(nmsg) : null,
  };
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let p = {};
  try { p = JSON.parse(input); } catch (e) {}
  const event = process.argv[2] || p.hook_event_name || "";
  const base = { sessionId: p.session_id || "", cwd: p.cwd || "", event, ...tags(event, p) };
  const send = (status, message) => {
    const data = JSON.stringify({ status, message, ...base });
    const req = http.request({ hostname: "127.0.0.1", port: PORT, path: "/status", method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data), Connection: "close" } }, (res) => res.resume());
    req.setTimeout(1500, () => req.destroy());
    req.on("error", () => {});
    req.end(data);
  };
  if (!EVENT_TO_STATUS[event]) return send("running", "");
  if (event === "Stop") {
    const bg = (Array.isArray(p.background_tasks) ? p.background_tasks.length : 0) + (Array.isArray(p.session_crons) ? p.session_crons.length : 0);
    if (bg) return send("running", "");
    const parts = String(p.cwd || p.workspace_dir || "").split(/[\\/]/).filter(Boolean);
    const proj = parts[parts.length - 1] || "";
    return send("completed", proj ? `${truncate(proj, 24)} is ready for you` : "");
  }
  if (event === "PreToolUse" || event === "PostToolUse") {
    const d = detail(p.tool_name || "", p.tool_input || {});
    return send("running", d ? `${p.tool_name}: ${d}` : p.tool_name || "");
  }
  if (event === "Notification") {
    const msg = String(p.message || p.notification_message || "");
    if (msg) send("waiting", msg);
    return;
  }
  if (event === "UserPromptSubmit") return send("running", "Thinking...");
  send(EVENT_TO_STATUS[event], "");
});
