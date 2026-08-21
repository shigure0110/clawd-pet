// CCPet Claude Code Hook 通知脚本
// 参考 clawd-on-desk 的状态映射 + 气泡内容格式化

const http = require("http");

const PORT = 31126;

// ── 事件 → 状态映射 ──
const EVENT_TO_STATUS = {
  SessionStart: "idle",
  SessionEnd: "idle",
  UserPromptSubmit: "running",
  PreToolUse: "running",
  PostToolUse: "running",
  PostToolUseFailure: "error",
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

setTimeout(() => {
  if (done) return;
  done = true;
  processEvent();
}, 2000);

let CUR_PAYLOAD = {};
let CUR_EVENT = "";

function processEvent() {
  const argv2 = process.argv[2] || "";

  let payload = {};
  try {
    payload = JSON.parse(inputData);
  } catch (e) {}
  CUR_PAYLOAD = payload;
  CUR_EVENT = argv2 || payload.hook_event_name || "";

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
    // 带上项目名, 提醒哪个话题可以推进了
    let proj = "";
    const cwd = payload.cwd || payload.workspace_dir || "";
    if (typeof cwd === "string" && cwd) {
      const parts = cwd.split(/[\\/]/).filter(Boolean);
      proj = parts[parts.length - 1] || "";
    }
    sendStatus("completed", proj ? `「${truncate(proj, 24)}」可以推进了` : "");
    return;
  }

  // ── PostToolUse：显示工具详情 ──
  if (event === "PostToolUse" || event === "PreToolUse") {
    const toolName = payload.tool_name || "";
    const detail = formatToolDetail(toolName, payload.tool_input || {});
    const message = detail ? `${toolName}: ${detail}` : toolName;
    sendStatus("running", message);
    return;
  }

  // ── Notification：有消息才发 waiting（需要确认），无消息忽略 ──
  if (event === "Notification") {
    const msg = payload.message || "";
    if (msg) {
      sendStatus("waiting", msg);
    }
    return;
  }

  // ── UserPromptSubmit ──
  if (event === "UserPromptSubmit") {
    sendStatus("running", "思考中...");
    return;
  }

  // ── 其他事件 ──
  sendStatus(baseStatus, "");
}

function sendStatus(status, message) {
  // session id + cwd let the pet count concurrent sessions and tag bubbles by project
  const data = JSON.stringify({
    status,
    message,
    sessionId: CUR_PAYLOAD.session_id || "",
    cwd: CUR_PAYLOAD.cwd || "",
    event: CUR_EVENT,
  });

  const req = http.request(
    {
      hostname: "127.0.0.1",
      port: PORT,
      path: "/status",
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(data, "utf8"),
      },
    },
    () => {},
  );

  req.on("error", () => {});
  req.write(data, "utf8");
  req.end();
}
