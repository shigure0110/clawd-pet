#!/usr/bin/env node
// make_fixtures.js - writes tools/qa/dev/hooks/*.json (Gate 3 hook fixtures) and hooks/expected.json.
//
//   node tools/qa/dev/make_fixtures.js          (from ClaudeCodePet/; rewrites every fixture)
//
// Source of the field names: the documented Claude Code hook input schemas (hooks.md / hooks-guide.md,
// fetched for the lead, lead decision 6 in _work/anim_plan_20260926.md; no key-name dump exists).
//   common:            session_id, prompt_id (absent until the first prompt), transcript_path, cwd,
//                      permission_mode, hook_event_name, effort {level}
//   subagent calls:    + agent_id, agent_type (session_id is the PARENT's)
//   PreToolUse:        tool_name, tool_input, tool_use_id (toolu_*)
//   PostToolUse:       tool_name, tool_input, tool_use_id, tool_response (Bash success: a plain string)
//   SessionStart:      start_reason  startup|resume|clear|compact|fork
//   SessionEnd:        end_reason
//   UserPromptSubmit:  user_input
//   Stop:              last_assistant_message
//   Notification:      notification_type (permission_prompt, idle_prompt, ...), notification_title,
//                      notification_message
// Where the build spec (§4.6) or the LIVE hooks/notify.js reads a different name for the same value,
// the fixture carries that name too, with the same value (see ALSO below), so a notify that follows
// either one works and the "old notify" path gets what today's hook reads:
//   SessionStart  source        (§4.6 table "source: SessionStart source"; the docs call it start_reason)
//   SessionEnd    reason        (§4.6 logger list; the docs call it end_reason)
//   Notification  message/title (today's notify.js reads payload.message; the docs call it notification_message)
//   UserPromptSubmit prompt     (the docs call it user_input; nothing forwards it)
// Also from §4.6, not the docs: post_bash_test_pass_obj.json uses the object form of tool_response
// ({stdout, stderr, interrupted, isImage}); §4.6's `ok` / `verdict` rules read those keys.
// Failed Bash calls: the docs route them to PostToolUseFailure, which is NOT registered on this machine
// (lead decision 6), so "Post fail" is tested through the §4.4 inference (seq_*.txt) and through a
// PostToolUse whose output reports failures (post_bash_test_failtext.json). hooks/future/ holds a
// PostToolUseFailure fixture for the day the user registers that event; nothing replays it now.
//
// Privacy sentinels: QA_SENTINEL_OUTPUT (tool output) and QA_SENTINEL_PROMPT (prompt / agent prompt)
// must never appear in what notify POSTs (check_notify.js).
"use strict";
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "hooks");
const SID_A = "5e55a0a0-0000-4000-8000-00000000000a"; // the focus session
const SID_B = "5e55b0b0-0000-4000-8000-00000000000b"; // a second, background session
const CWD_A = "C:\\Users\\qa\\projects\\alpha";
const CWD_B = "C:\\Users\\qa\\projects\\beta";
const PROMPT_A = "9a000000-0000-4000-8000-0000000000a1";
const PROMPT_B = "9b000000-0000-4000-8000-0000000000b1";
const tp = (sid, proj) => `C:\\Users\\qa\\.claude\\projects\\C--Users-qa-projects-${proj}\\${sid}.jsonl`;

// common fields, in the documented order
function base(event, { b = false, prompt = true, mode = "default", effort = false } = {}) {
  const o = { session_id: b ? SID_B : SID_A };
  if (prompt) o.prompt_id = b ? PROMPT_B : PROMPT_A;
  o.transcript_path = tp(b ? SID_B : SID_A, b ? "beta" : "alpha");
  o.cwd = b ? CWD_B : CWD_A;
  o.permission_mode = mode;
  o.hook_event_name = event;
  if (effort) o.effort = { level: "high" };
  return o;
}
const pre = (tool, input, id, opt = {}) => ({ ...base("PreToolUse", { effort: true, ...opt }), tool_name: tool, tool_input: input, tool_use_id: id });
const post = (tool, input, id, response, opt = {}) => ({ ...base("PostToolUse", { effort: true, ...opt }), tool_name: tool, tool_input: input, tool_use_id: id, tool_response: response });

const TEST_IN = { command: "npm test", description: "Run the test suite", timeout: 120000, run_in_background: false };
const PLAIN_IN = { command: "ls -la src", description: "List the source files", timeout: 120000, run_in_background: false };
const PASS_OUT = "\n> alpha@1.0.0 test\n> jest\n\nPASS src/app.test.js\nTests:       12 passed, 12 total\nTime:        1.84 s\nQA_SENTINEL_OUTPUT\n";
const FAIL_OUT = "\n> alpha@1.0.0 test\n> jest\n\nFAIL src/app.test.js\n  adds > rejects negatives\n\nTests:       2 failed, 10 passed, 12 total\nQA_SENTINEL_OUTPUT\n";
const UNKNOWN_OUT = "\n> alpha@1.0.0 test\n> node scripts/check.js\n\nTest run finished in 1.2 s.\nQA_SENTINEL_OUTPUT\n";
const AGENT_A_IN = { description: "Explore the renderer", prompt: "QA_SENTINEL_PROMPT Find where the sprite rows are loaded.", subagent_type: "Explore" };
const AGENT_B_IN = { description: "Review the hooks", prompt: "QA_SENTINEL_PROMPT Check the hook fields for privacy.", subagent_type: "general-purpose" };

const F = {}; // name → [payload, expected]
// expected: event, status (the legacy status notify sends), fields (new §4.6 tags; "" = empty, null = null/absent/""),
//           message (regex on the legacy message), messageChanged (Stop / UserPromptSubmit strings change in edit #2)
const E = (event, status, fields, extra = {}) => ({ event, status, fields, ...extra });

F.pre_read_1 = [pre("Read", { file_path: `${CWD_A}\\src\\app.js` }, "toolu_qa_read_1"),
  E("PreToolUse", "running", { tool: "Read", kind: "read", cmd: "", mode: "default", toolUseId: "toolu_qa_read_1" }, { message: "^Read: " })];
F.pre_read_2 = [pre("Grep", { pattern: "applyState", path: `${CWD_A}\\src`, output_mode: "content" }, "toolu_qa_read_2"),
  E("PreToolUse", "running", { tool: "Grep", kind: "read", cmd: "", toolUseId: "toolu_qa_read_2" }, { message: "^Grep: applyState" })];
F.pre_read_3 = [pre("Glob", { pattern: "**/*.js" }, "toolu_qa_read_3"),
  E("PreToolUse", "running", { tool: "Glob", kind: "read", cmd: "", toolUseId: "toolu_qa_read_3" }, { message: "^Glob: " })];
F.pre_edit = [pre("Edit", { file_path: `${CWD_A}\\src\\app.js`, old_string: "a + b", new_string: "a - b", replace_all: false }, "toolu_qa_edit_1"),
  E("PreToolUse", "running", { tool: "Edit", kind: "edit", cmd: "", toolUseId: "toolu_qa_edit_1" }, { message: "^Edit: " })];
F.pre_bash_plain = [pre("Bash", PLAIN_IN, "toolu_qa_bash_1"),
  E("PreToolUse", "running", { tool: "Bash", kind: "shell", cmd: "", toolUseId: "toolu_qa_bash_1" }, { message: "^Bash: ls -la src$" })];
F.post_bash_plain = [post("Bash", PLAIN_IN, "toolu_qa_bash_1", "total 8\n-rw-r--r-- 1 qa qa 120 app.js\nQA_SENTINEL_OUTPUT\n"),
  E("PostToolUse", "running", { tool: "Bash", kind: "shell", cmd: "", ok: true, verdict: "", toolUseId: "toolu_qa_bash_1" })];
F.pre_bash_test = [pre("Bash", TEST_IN, "toolu_qa_test_1"),
  E("PreToolUse", "running", { tool: "Bash", kind: "shell", cmd: "test", toolUseId: "toolu_qa_test_1" }, { message: "^Bash: npm test$" })];
F.post_bash_test_pass = [post("Bash", TEST_IN, "toolu_qa_test_1", PASS_OUT),
  E("PostToolUse", "running", { kind: "shell", cmd: "test", ok: true, verdict: "pass", toolUseId: "toolu_qa_test_1" })];
F.post_bash_test_pass_obj = [post("Bash", TEST_IN, "toolu_qa_test_1", { stdout: PASS_OUT, stderr: "", interrupted: false, isImage: false }),
  E("PostToolUse", "running", { kind: "shell", cmd: "test", ok: true, verdict: "pass", toolUseId: "toolu_qa_test_1" }, { note: "tool_response object form (§4.6), not the documented string" })];
F.post_bash_test_failtext = [post("Bash", TEST_IN, "toolu_qa_test_1", FAIL_OUT),
  E("PostToolUse", "running", { kind: "shell", cmd: "test", ok: true, verdict: "fail", toolUseId: "toolu_qa_test_1" })];
F.post_bash_test_unknown = [post("Bash", TEST_IN, "toolu_qa_test_1", UNKNOWN_OUT),
  E("PostToolUse", "running", { kind: "shell", cmd: "test", ok: true, verdict: "", toolUseId: "toolu_qa_test_1" })];
F.pre_agent_a = [pre("Agent", AGENT_A_IN, "toolu_qa_agent_a"),
  E("PreToolUse", "running", { tool: "Agent", kind: "agent", cmd: "", toolUseId: "toolu_qa_agent_a" })];
F.pre_agent_b = [pre("Agent", AGENT_B_IN, "toolu_qa_agent_b"),
  E("PreToolUse", "running", { tool: "Agent", kind: "agent", cmd: "", toolUseId: "toolu_qa_agent_b" })];
F.post_agent_a = [post("Agent", AGENT_A_IN, "toolu_qa_agent_a", "The sprite rows load in renderer/pet.js. QA_SENTINEL_OUTPUT"),
  E("PostToolUse", "running", { tool: "Agent", kind: "agent", ok: true, verdict: "", toolUseId: "toolu_qa_agent_a" })];
F.post_agent_b = [post("Agent", AGENT_B_IN, "toolu_qa_agent_b", "The new fields are tags only. QA_SENTINEL_OUTPUT"),
  E("PostToolUse", "running", { tool: "Agent", kind: "agent", ok: true, verdict: "", toolUseId: "toolu_qa_agent_b" })];
// a subagent's own tool call: the parent's session_id plus agent_id / agent_type (it must not fake a test failure)
F.pre_read_subagent = [{ ...pre("Read", { file_path: `${CWD_A}\\renderer\\pet.js` }, "toolu_qa_sub_read_1"), agent_id: "a9e00000-0000-4000-8000-0000000000a1", agent_type: "Explore" },
  E("PreToolUse", "running", { tool: "Read", kind: "read", toolUseId: "toolu_qa_sub_read_1" })];
F.pre_git_commit = [pre("Bash", { command: 'git commit -m "qa: fixture commit"', description: "Commit the change", timeout: 120000, run_in_background: false }, "toolu_qa_git_1"),
  E("PreToolUse", "running", { kind: "shell", cmd: "git-commit", toolUseId: "toolu_qa_git_1" })];
F.pre_git_push = [pre("Bash", { command: "git push origin more-animations", description: "Push the branch", timeout: 120000, run_in_background: false }, "toolu_qa_git_2"),
  E("PreToolUse", "running", { kind: "shell", cmd: "git-push", toolUseId: "toolu_qa_git_2" })];
F.pre_plan_mode = [pre("Read", { file_path: `${CWD_A}\\README.md` }, "toolu_qa_plan_1", { mode: "plan" }),
  E("PreToolUse", "running", { tool: "Read", kind: "read", mode: "plan", toolUseId: "toolu_qa_plan_1" })];

const sessionStart = (reason, b = false) => ({ ...base("SessionStart", { b, prompt: false }), start_reason: reason, source: reason, model: "claude-opus-5-5" });
F.session_start_compact = [sessionStart("compact"), E("SessionStart", "idle", { source: "compact", ok: null })];
F.session_start_clear = [sessionStart("clear"), E("SessionStart", "idle", { source: "clear", ok: null })];
F.session_start_resume = [sessionStart("resume"), E("SessionStart", "idle", { source: "resume", ok: null })];
F.session_start_startup = [sessionStart("startup"), E("SessionStart", "idle", { source: "startup", ok: null })];
F.session_start_startup_b = [sessionStart("startup", true), E("SessionStart", "idle", { source: "startup", ok: null }, { sessionId: SID_B })];
const sessionEnd = (b = false) => ({ ...base("SessionEnd", { b }), end_reason: "other", reason: "other" });
F.session_end = [sessionEnd(), E("SessionEnd", "idle", { ok: null })];
F.session_end_b = [sessionEnd(true), E("SessionEnd", "idle", { ok: null }, { sessionId: SID_B })];

const notification = (type, title, msg) => ({ ...base("Notification", { prompt: false }), notification_type: type, notification_title: title, notification_message: msg, title, message: msg });
F.notification_permission = [notification("permission_prompt", "Claude Code", "Claude needs your permission to use Bash"),
  E("Notification", "waiting", { ntype: "permission_prompt", limit: false, ok: null }, { message: "permission" })];
F.notification_idle = [notification("idle_prompt", "Claude Code", "Claude is waiting for your input"),
  E("Notification", "waiting", { ntype: "idle_prompt", limit: false, ok: null }, { message: "waiting for your input" })];
// H19 stays disabled (LIMIT_ENABLED = false): the `limit` tag is sent, no row may react to it
F.notification_limit = [notification("quota_auto_resume_disabled", "Claude Code", "Usage limit reached. Auto-continue is off until the reset."),
  E("Notification", "waiting", { ntype: "quota_auto_resume_disabled", limit: true, ok: null })];

F.user_prompt_submit = [{ ...base("UserPromptSubmit"), user_input: "QA_SENTINEL_PROMPT please make the tests pass", prompt: "QA_SENTINEL_PROMPT please make the tests pass" },
  E("UserPromptSubmit", "running", { ok: null }, { message: "^Thinking\\.\\.\\.$", messageChanged: true })];
F.user_prompt_submit_b = [{ ...base("UserPromptSubmit", { b: true }), user_input: "QA_SENTINEL_PROMPT tidy the docs", prompt: "QA_SENTINEL_PROMPT tidy the docs" },
  E("UserPromptSubmit", "running", { ok: null }, { message: "^Thinking\\.\\.\\.$", messageChanged: true, sessionId: SID_B })];
F.stop = [{ ...base("Stop", { effort: true }), last_assistant_message: "QA_SENTINEL_OUTPUT All 12 tests pass now.", stop_hook_active: false },
  E("Stop", "completed", { ok: null }, { message: "^alpha is ready for you$", messageChanged: true })];
F.stop_b = [{ ...base("Stop", { b: true, effort: true }), last_assistant_message: "QA_SENTINEL_OUTPUT The docs are tidy.", stop_hook_active: false },
  E("Stop", "completed", { ok: null }, { message: "^beta is ready for you$", messageChanged: true, sessionId: SID_B })];

// not replayed: PostToolUseFailure is not registered on this machine (hand-off consent question)
const FUTURE = {
  post_tool_use_failure_bash_test: { ...base("PostToolUseFailure", { effort: true }), tool_name: "Bash", tool_input: TEST_IN, tool_use_id: "toolu_qa_test_1", tool_response: "Error: Exit code 1\nTests: 2 failed, 10 passed\nQA_SENTINEL_OUTPUT" },
};

fs.mkdirSync(path.join(OUT, "future"), { recursive: true });
const expected = { _about: "written by make_fixtures.js; read by check_notify.js", sessions: { A: SID_A, B: SID_B }, fixtures: {} };
for (const [name, [payload, exp]] of Object.entries(F)) {
  fs.writeFileSync(path.join(OUT, name + ".json"), JSON.stringify(payload, null, 2) + "\n");
  expected.fixtures[name] = { sessionId: SID_A, ...exp };
}
for (const [name, payload] of Object.entries(FUTURE)) fs.writeFileSync(path.join(OUT, "future", name + ".json"), JSON.stringify(payload, null, 2) + "\n");
fs.writeFileSync(path.join(OUT, "expected.json"), JSON.stringify(expected, null, 2) + "\n");

// Sequences for replay.sh --seq: one token per line, a fixture name or +<ms> (a pause)
const SEQ = {
  seq_test_pass: ["pre_bash_test", "+1500", "post_bash_test_pass"],
  seq_test_fail_text: ["pre_bash_test", "+1500", "post_bash_test_failtext"],
  seq_test_unknown: ["pre_bash_test", "+1500", "post_bash_test_unknown"],
  seq_test_fail_inferred_pre: ["pre_bash_test", "+900", "pre_read_1"],
  seq_test_fail_inferred_stop: ["pre_bash_test", "+900", "stop"],
  seq_agents_parallel: ["pre_agent_a", "+150", "pre_agent_b", "+1500", "post_agent_a", "+1500", "post_agent_b"],
  seq_agent_inferred_stop: ["pre_agent_a", "+1500", "stop"],
  seq_burst_read_edit: ["pre_read_1", "pre_edit", "pre_read_2", "pre_edit", "pre_read_3", "pre_edit", "pre_read_1", "pre_edit", "pre_read_2", "pre_edit"],
};
for (const [name, lines] of Object.entries(SEQ)) fs.writeFileSync(path.join(OUT, name + ".txt"), lines.join("\n") + "\n");
console.log(`wrote ${Object.keys(F).length} fixtures, ${Object.keys(FUTURE).length} future, ${Object.keys(SEQ).length} sequences, expected.json → ${OUT}`);
