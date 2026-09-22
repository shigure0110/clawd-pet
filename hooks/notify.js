// CCPet Claude Code Hook 通知脚本
// 参考 clawd-on-desk 的状态映射 + 气泡内容格式化

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

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

// unref：stdin 正常结束时不让这个兜底计时器把进程多拖 2 秒（每次工具调用都要等 hook 退出）
setTimeout(() => {
  if (done) return;
  done = true;
  process.stdin.destroy(); // stdin 一直不关的话，别让它把进程挂到 hook 超时
  processEvent();
}, 2000).unref();

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
