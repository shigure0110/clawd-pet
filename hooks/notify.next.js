// CCPet Claude Code Hook 通知脚本
// 参考 clawd-on-desk 的状态映射 + 气泡内容格式化
//
// notify.next.js is the next version of hooks/notify.js. It is never run by Claude Code until the
// user activates it with `node scripts/activate-notify.js` (an atomic swap that keeps
// hooks/notify.prev.js as a backup). On top of today's notify.js it adds:
//   edit #1: CLAWD_PORT (a dev instance on another port) and the flag-file key-name logger;
//   edit #2: short reaction tags in the POST body (tool, kind, cmd, ok, verdict, source, ntype,
//            mode, toolUseId, limit) and English bubble strings.
// The tags are never free text: no command, prompt, path or output is ever put into them.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// CLAWD_PORT points a test run at a dev instance (31127/31128); the live pet listens on 31126.
// Unset or empty → 31126. Anything else must be an integer port in 1024..65535 (as main.js
// accepts); a junk value is 0 = post nothing, so a typo never lands a QA fixture on the live pet.
const LIVE_PORT = 31126;
const PORT = (() => {
  const raw = process.env.CLAWD_PORT;
  if (raw == null || raw === "") return LIVE_PORT;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : 0;
})();

// ── Key-name logger (off unless ClaudeCodePet/tmp/hook_dump.on exists) ──
// One line per hook in tmp/hook_keys.log: the event, every top-level key with its JS type, the
// keys/types one level into tool_input and tool_response, and the values of a few enum-like
// fields only. No other value (commands, prompts, paths, output) is ever written.
const DUMP_DIR = path.join(__dirname, "..", "tmp");
const DUMP_ENUM_FIELDS = ["hook_event_name", "tool_name", "notification_type", "permission_mode", "source", "reason", "stop_hook_active"];
const DUMP_MAX_BYTES = 2 * 1024 * 1024;

function typeTag(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

// Enum-like values only: a boolean, a number, or a short tag string. Anything else (free text, an
// object, a long string) is written as its type, never its content.
const DUMP_TAG_RE = /^[A-Za-z0-9_.:-]{0,40}$/;
function tagValue(v) {
  if (typeof v === "boolean" || v === null) return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : "number:redacted";
  if (typeof v === "string" && DUMP_TAG_RE.test(v)) return v;
  return typeTag(v) + ":redacted";
}

function keyTypes(obj) {
  const out = {};
  for (const k of Object.keys(obj)) out[k] = typeTag(obj[k]);
  return out;
}

function dumpHookKeys(event, payload) {
  try {
    if (!fs.existsSync(path.join(DUMP_DIR, "hook_dump.on"))) return;
    const logFile = path.join(DUMP_DIR, "hook_keys.log");
    try {
      if (fs.statSync(logFile).size > DUMP_MAX_BYTES) return;
    } catch (e) {
      /* no log yet */
    }
    const p = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
    const line = { t: Date.now(), event, keys: keyTypes(p), values: {} };
    for (const k of ["tool_input", "tool_response"]) {
      if (!(k in p)) continue;
      const v = p[k];
      line[k] = v && typeof v === "object" && !Array.isArray(v) ? keyTypes(v) : typeTag(v);
    }
    for (const k of DUMP_ENUM_FIELDS) if (k in p) line.values[k] = tagValue(p[k]);
    const tr = p.tool_response;
    if (tr && typeof tr === "object" && !Array.isArray(tr)) {
      if ("interrupted" in tr) line.values["tool_response.interrupted"] = tagValue(tr.interrupted);
      if ("is_error" in tr) line.values["tool_response.is_error"] = tagValue(tr.is_error);
    }
    fs.appendFileSync(logFile, JSON.stringify(line) + "\n", "utf8");
  } catch (e) {
    /* the logger must never change what the hook does */
  }
}

// ── Reaction tags (spec §4.6): short tags only, never free text ──
// Field names follow the documented hook input schema (code.claude.com/docs/en/hooks):
// tool_name, tool_input.command, tool_response, tool_use_id, permission_mode,
// notification_type, and SessionStart's source (the fetched schema calls it start_reason; both
// are read). Every tag is optional for the pet: a missing one just switches that reaction off.

const TOOL_KIND = {
  Bash: "shell",
  BashOutput: "shell",
  KillShell: "shell",
  KillBash: "shell",
  PowerShell: "shell",
  Read: "read",
  Grep: "read",
  Glob: "read",
  LS: "read",
  NotebookRead: "read",
  Edit: "edit",
  MultiEdit: "edit",
  Write: "edit",
  NotebookEdit: "edit",
  WebSearch: "web",
  WebFetch: "web",
  Agent: "agent",
  Task: "agent",
  TodoWrite: "todo",
};

function toolKind(name) {
  if (!name) return "";
  if (Object.prototype.hasOwnProperty.call(TOOL_KIND, name)) return TOOL_KIND[name];
  if (name.startsWith("mcp__")) return "mcp";
  return "other";
}

// cmd (shell only): the first 300 characters of the command, lowercased; only the tag leaves
const GIT_PUSH_RE = /\bgit\s+push\b|\bgh\s+pr\s+create\b/;
const GIT_COMMIT_RE = /\bgit\s+commit\b/;
const TEST_RE = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bpytest\b|\b(jest|vitest|mocha)\b|\bcargo\s+test\b|\bgo\s+test\b|\bdotnet\s+test\b|--qa\b|validate\.js\b/;

function shellCmd(input) {
  const raw = input && typeof input === "object" && typeof input.command === "string" ? input.command : "";
  if (!raw) return "";
  const c = raw.slice(0, 300).toLowerCase();
  if (GIT_PUSH_RE.test(c)) return "git-push";
  if (GIT_COMMIT_RE.test(c)) return "git-commit";
  if (TEST_RE.test(c)) return "test";
  return "";
}

// verdict (a test's Post only): the last 4 KB of stdout + stderr. "0 failed" is not a failure
// (the spec's fail pattern read \d+; [1-9]\d* keeps its own pass pattern "0 failed" reachable).
const FAIL_RE = /\b[1-9]\d* (?:failed|failing)\b|\bFAIL(?:ED)?\b|AssertionError|\bError:|✗/;
const PASS_RE = /\b\d+ passed\b|\ball tests pass|\bOK \(|\b0 failed\b|✓/;
const VERDICT_TAIL = 4096;

function outputTail(r) {
  const tail = (s) => (typeof s === "string" ? (s.length > VERDICT_TAIL ? s.slice(-VERDICT_TAIL) : s) : "");
  if (typeof r === "string") return tail(r);
  if (!r || typeof r !== "object") return "";
  const out = tail(r.stdout);
  const err = tail(r.stderr);
  return tail(out && err ? out + "\n" + err : out || err);
}

function testVerdict(r) {
  const text = outputTail(r);
  if (!text) return "";
  if (FAIL_RE.test(text)) return "fail";
  if (PASS_RE.test(text)) return "pass";
  return "";
}

// ok: false when the tool call failed or was interrupted; null outside a tool's Post
function toolOk(event, r) {
  if (event === "PostToolUseFailure") return false;
  if (event !== "PostToolUse") return null;
  if (r && typeof r === "object" && (r.interrupted === true || r.is_error === true)) return false;
  if (typeof r === "string" && r.startsWith("Error")) return false;
  return true;
}

const TAG_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
function tag(v) {
  return typeof v === "string" && TAG_RE.test(v) ? v : "";
}

const LIMIT_RE = /(usage|rate)[ -]?limit|limit reached|quota|overloaded/i;

function notificationText(p) {
  const m = p.message || p.notification_message || "";
  return typeof m === "string" ? m : "";
}

function reactionTags(event, p) {
  const toolName = typeof p.tool_name === "string" ? p.tool_name : "";
  const kind = toolKind(toolName);
  const isToolEvent = event === "PreToolUse" || event === "PostToolUse" || event === "PostToolUseFailure";
  const cmd = kind === "shell" && isToolEvent ? shellCmd(p.tool_input) : "";
  const isPost = event === "PostToolUse" || event === "PostToolUseFailure";
  return {
    tool: isToolEvent ? tag(toolName.slice(0, 40)) : "", // a plain cut, checked like main.js does
    kind: isToolEvent ? kind : "",
    cmd,
    ok: toolOk(event, p.tool_response),
    verdict: isPost && cmd === "test" ? testVerdict(p.tool_response) : "",
    source: event === "SessionStart" ? tag(p.source) || tag(p.start_reason) : "",
    ntype: event === "Notification" ? tag(p.notification_type) : "",
    mode: tag(p.permission_mode),
    toolUseId: isToolEvent ? tag(p.tool_use_id) : "",
    limit: event === "Notification" ? LIMIT_RE.test(notificationText(p)) : false,
  };
}

// ── 事件 → 状态映射 ──
// A failed tool call (PostToolUseFailure, not registered today) does not end the turn: it is
// "running" like PostToolUse, with ok:false for the pet, not an "error" with a system notification.
// (Today's notify.js maps it to "error". Recorded as a deviation from §4.6's "existing fields
// unchanged"; it only matters if the user agrees to register PostToolUseFailure.)
const EVENT_TO_STATUS = {
  SessionStart: "idle",
  SessionEnd: "idle",
  UserPromptSubmit: "running",
  PreToolUse: "running",
  PostToolUse: "running",
  PostToolUseFailure: "running",
  Stop: "waiting",
  StopFailure: "error",
  Notification: "waiting",
  Elicitation: "waiting",
  SubagentStart: "running",
  SubagentStop: "running",
  PreCompact: "running",
  PostCompact: "running",
};

// ── 工具详情格式化（参考 clawd-on-desk bubble-format.js） ──
function formatToolDetail(toolName, toolInput) {
  if (!toolName || !toolInput) return "";

  const name = toolName;

  if (name === "Bash" && toolInput.command) {
    return truncate(toolInput.command, 80);
  }
  if ((name === "Edit" || name === "Write" || name === "Read") && toolInput.file_path) {
    return truncate(toolInput.file_path, 80);
  }
  if ((name === "Glob" || name === "Grep") && toolInput.pattern) {
    return truncate(toolInput.pattern, 80);
  }
  if (name === "WebFetch" && toolInput.url) {
    return truncate(toolInput.url, 80);
  }
  if (name === "WebSearch" && toolInput.query) {
    return truncate(toolInput.query, 80);
  }
  if (name === "Agent" && toolInput.prompt) {
    return truncate(toolInput.prompt, 80);
  }
  if (typeof toolInput.description === "string" && toolInput.description.trim()) {
    return truncate(toolInput.description.trim(), 80);
  }
  return "";
}

function truncate(s, max) {
  if (typeof s !== "string") return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// 旧格式兼容
const LEGACY_STATUS = new Set(["idle", "running", "waiting", "completed", "error"]);

let done = false;
let inputData = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (inputData += chunk));
process.stdin.on("end", () => {
  if (done) return;
  done = true;
  processEvent();
});

// unref：stdin 正常结束时不让这个兜底计时器把进程多拖 2 秒（每次工具调用都要等 hook 退出）
setTimeout(() => {
  if (done) return;
  done = true;
  process.stdin.destroy(); // stdin 一直不关的话，别让它把进程挂到 hook 超时
  processEvent();
}, 2000).unref();

let CUR_PAYLOAD = {};
let CUR_EVENT = "";
let CUR_TAGS = {};

function processEvent() {
  const argv2 = process.argv[2] || "";

  let payload = {};
  try {
    payload = JSON.parse(inputData);
  } catch (e) {}
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) payload = {};
  CUR_PAYLOAD = payload;
  CUR_EVENT = argv2 || payload.hook_event_name || "";
  dumpHookKeys(CUR_EVENT, payload);
  try {
    CUR_TAGS = reactionTags(CUR_EVENT, payload);
  } catch (e) {
    CUR_TAGS = {}; // the tags must never stop the status from going out
  }

  // 旧格式兼容
  if (LEGACY_STATUS.has(argv2)) {
    const message = process.argv[3] || "";
    sendStatus(argv2, message);
    return;
  }

  let event = argv2;
  if (!event) {
    event = payload.type || payload.hook_event_type || "";
  }

  const baseStatus = EVENT_TO_STATUS[event];
  if (!baseStatus) {
    sendStatus("running", "");
    return;
  }

  // ── Stop 事件 ──
  if (event === "Stop") {
    const bgCount = Array.isArray(payload.background_tasks) ? payload.background_tasks.length : 0;
    const cronCount = Array.isArray(payload.session_crons) ? payload.session_crons.length : 0;
    if (bgCount > 0 || cronCount > 0) {
      sendStatus("running", "");
      return;
    }
    // The project name tells which conversation can move on
    let proj = "";
    const cwd = payload.cwd || payload.workspace_dir || "";
    if (typeof cwd === "string" && cwd) {
      const parts = cwd.split(/[\\/]/).filter(Boolean);
      proj = parts[parts.length - 1] || "";
    }
    sendStatus("completed", proj ? `${truncate(proj, 24)} is ready for you` : "");
    return;
  }

  // ── PostToolUse：显示工具详情 ──
  if (event === "PostToolUse" || event === "PreToolUse" || event === "PostToolUseFailure") {
    const toolName = payload.tool_name || "";
    const detail = formatToolDetail(toolName, payload.tool_input || {});
    const message = detail ? `${toolName}: ${detail}` : toolName;
    sendStatus("running", message);
    return;
  }

  // ── Notification：有消息才发 waiting（需要确认），无消息忽略 ──
  if (event === "Notification") {
    const msg = notificationText(payload);
    if (msg) {
      sendStatus("waiting", msg);
    }
    return;
  }

  // ── UserPromptSubmit ──
  if (event === "UserPromptSubmit") {
    sendStatus("running", "Thinking...");
    return;
  }

  // ── 其他事件 ──
  sendStatus(baseStatus, "");
}

function sendStatus(status, message) {
  if (!PORT) return; // CLAWD_PORT was junk: post nothing (exit 0)
  // session id + cwd let the pet count concurrent sessions and tag bubbles by project; the
  // reaction tags follow (the pet treats every one of them as optional)
  const data = JSON.stringify({
    status,
    message,
    sessionId: CUR_PAYLOAD.session_id || "",
    cwd: CUR_PAYLOAD.cwd || "",
    event: CUR_EVENT,
    ...CUR_TAGS,
  });

  try {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: "/status",
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(data, "utf8"),
          Connection: "close",
        },
      },
      // 必须把响应读完：不读的话 socket 会挂到服务端 keep-alive 超时（5 秒）才关，
      // 这个 hook 进程也就跟着活 6 秒——PreToolUse + PostToolUse，每次工具调用白等 12 秒
      (res) => res.resume(),
    );

    req.setTimeout(1500, () => req.destroy()); // 桌宠卡死时别把 Claude 也拖住
    req.on("error", (e) => {
      if (e && e.code === "ECONNREFUSED") revivePet();
    });
    req.write(data, "utf8");
    req.end();
  } catch (e) {
    /* a hook must never crash Claude Code's turn */
  }
}

// ── 看门狗：桌宠没在监听 → 把它拉起来 ──
// 桌宠启动时把 exe 路径和「用户是否从菜单 Quit」写进 exe 旁边的 logs\watchdog.json；
// Quit 过就不拉，最多每 2 分钟试一次。不读 %APPDATA%：Claude 桌面版是 MSIX 应用，
// 从它里面跑的 hook 看到的是容器里一份过期的虚拟化副本。
// 经 explorer.exe 启动：由外壳进程拉起，等同双击 Clawd.exe——不进 Claude 的 MSIX 容器
// （否则桌宠写的注册表 / AppData 也会被虚拟化），也不继承 hook 进程的 CLAUDE_* 环境变量。
const REVIVE_EVERY_MS = 2 * 60 * 1000;

function findWatchdogState() {
  const dirs = [
    path.join(__dirname, "..", "dist", "Clawd-win32-x64", "logs"), // hooks 指向仓库
    path.join(__dirname, "..", "..", "..", "logs"), // hooks 指向打包版自带的 resources\app\hooks
    path.join(process.env.APPDATA || "", "clawd-pet", "logs"), // exe 目录不可写时的退路
  ];
  // 取最新写入的那份：别处还留着旧 exe 的 watchdog.json 时，不能让它盖过刚才的 Quit
  let best = null;
  for (const dir of dirs) {
    try {
      const file = path.join(dir, "watchdog.json");
      const mtime = fs.statSync(file).mtimeMs;
      if (best && best.mtime >= mtime) continue;
      best = { dir, mtime, state: JSON.parse(fs.readFileSync(file, "utf8")) };
    } catch (e) {
      /* 这个目录没有 */
    }
  }
  return best;
}

function revivePet() {
  if (process.platform !== "win32" || process.env.CLAWD_NO_REVIVE === "1") return;
  if (PORT !== LIVE_PORT) return; // a dev-port run never launches the live Clawd.exe
  try {
    const found = findWatchdogState();
    if (!found) return;
    const { exePath, quitByUser } = found.state;
    if (quitByUser || !exePath || !fs.existsSync(exePath)) return;
    // 节流戳和日志都放在 watchdog.json 旁边，和桌宠自己的 clawd.log 在一起
    const logDir = found.dir;
    const stampFile = path.join(logDir, "revive.stamp");
    try {
      if (Date.now() - fs.statSync(stampFile).mtimeMs < REVIVE_EVERY_MS) return;
    } catch (e) {
      /* 还没拉过 */
    }
    fs.writeFileSync(stampFile, String(Date.now())); // 写不进去就抛出 → 不拉，免得每个 hook 都拉一次
    fs.appendFileSync(
      path.join(logDir, "clawd.log"),
      `${stamp()} [hook ${process.pid}] WARN pet not listening (${CUR_EVENT || "hook"}), launching ${exePath}\r\n`,
    );
    spawn("explorer.exe", [exePath], { detached: true, stdio: "ignore" })
      .on("error", () => {})
      .unref();
  } catch (e) {
    /* 看门狗出错也不能影响 hook */
  }
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
