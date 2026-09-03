// ─── Environment guard ───────────────────────────────────
// If ELECTRON_RUN_AS_NODE=1 is set, Electron runs as plain Node; clear it and relaunch.
if (process.env.ELECTRON_RUN_AS_NODE === "1") {
  delete process.env.ELECTRON_RUN_AS_NODE;
  const { spawn } = require("child_process");
  const child = spawn(process.execPath, [__dirname], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
  child.on("exit", (code) => process.exit(code));
  setInterval(() => {}, 1000);
} else {
  startApp();
}

function startApp() {
  const {
    app,
    BrowserWindow,
    screen,
    ipcMain,
    Notification,
    dialog,
    Tray,
    Menu,
    nativeImage,
    powerMonitor,
  } = require("electron");
  const http = require("http");
  const path = require("path");
  const fs = require("fs");
  const os = require("os");
  const { spawn } = require("child_process");
  const AdmZip = require("adm-zip");

  // Only one Claw'd at a time (matters with auto-start)
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  let mainWindow = null;
  let httpServer = null;
  let tray = null;
  let fsWatcher = null;
  let fullscreenActive = false;
  let quitting = false;
  const PORT = 31126;

  const STATUS = {
    IDLE: "idle",
    RUNNING: "running",
    WAITING: "waiting",
    COMPLETED: "completed",
    ERROR: "error",
  };

  let currentStatus = STATUS.IDLE;
  let statusMessage = "";
  let prevStatus = STATUS.IDLE;
  let completedTimer = null;
  let runningSince = 0; // when we entered "running" — short chatty turns don't notify

  // ─── Config (userData/pet-config.json) ───────────────
  function configPath() {
    return path.join(app.getPath("userData"), "pet-config.json");
  }
  function loadConfig() {
    try {
      return JSON.parse(fs.readFileSync(configPath(), "utf8"));
    } catch (e) {
      return {};
    }
  }
  function saveConfig(patch) {
    const cfg = { ...loadConfig(), ...patch };
    try {
      fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
    } catch (e) {
      /* ignore */
    }
    return cfg;
  }

  function getPetsDir() {
    const dir = path.join(app.getPath("userData"), "pets");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  function getCurrentPetId() {
    return loadConfig().currentPetId || "";
  }
  function setCurrentPetId(petId) {
    saveConfig({ currentPetId: petId });
  }

  const WIN_W = 300;
  const WIN_H = 280;

  // ─── Pet window ──────────────────────────────────────
  function createWindow() {
    const { width: screenWidth, height: screenHeight } =
      screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
      width: WIN_W,
      height: WIN_H,
      minWidth: WIN_W,
      maxWidth: WIN_W,
      minHeight: WIN_H,
      maxHeight: WIN_H,
      x: Math.round(screenWidth - WIN_W),
      y: Math.round(screenHeight - WIN_H),

      title: " ",
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      skipTaskbar: true,
      hasShadow: false,

      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        zoomFactor: 1,
      },
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.setTitle(" ");
    mainWindow.setAlwaysOnTop(true, "screen-saver");
    mainWindow.setBackgroundColor("#00000000");
    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
    mainWindow.webContents.on("did-finish-load", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setTitle(" ");
        // Pin 1 CSS px = 1 window px. On a scaled display the renderer would
        // otherwise zoom (e.g. 1.25x), pushing the pet off-centre and clipping bubbles.
        mainWindow.webContents.setZoomFactor(1);
        if (fullscreenActive) mainWindow.webContents.send("fullscreen-change", true);
      }
    });
    mainWindow.setIgnoreMouseEvents(false);
    // Surface renderer console output in the terminal (handy when running `npm start`)
    mainWindow.webContents.on("console-message", (event, level, message) => {
      if (message && message.startsWith("[pet]")) console.log(message);
    });
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  }

  function sendToRenderer(channel, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  }

  // ─── Status pipeline ─────────────────────────────────
  function pushStatus(status, message = "") {
    if (status === currentStatus && message === statusMessage) return;

    prevStatus = currentStatus;
    currentStatus = status;
    statusMessage = message;

    if (completedTimer) {
      clearTimeout(completedTimer);
      completedTimer = null;
    }

    sendToRenderer("status-update", { status, message });

    if (status === STATUS.RUNNING && prevStatus !== STATUS.RUNNING) {
      runningSince = Date.now();
    }

    // waiting + message = Claude needs a decision (Notification hook) → notify, stays until next event
    // waiting + no message = turn ended but may continue → back to idle after 15s
    if (status === STATUS.WAITING && message && prevStatus !== STATUS.WAITING) {
      sendNotification("🦀 Claude is waiting for you", message);
    }
    if (status === STATUS.WAITING && !message) {
      completedTimer = setTimeout(() => {
        if (currentStatus === STATUS.WAITING && !statusMessage) {
          pushStatus(STATUS.IDLE, "");
        }
      }, 15000);
    }

    if (status === STATUS.COMPLETED && prevStatus !== STATUS.COMPLETED) {
      // Only runs longer than 15s get a system notification — quick chat turns stay quiet
      if (runningSince && Date.now() - runningSince > 15000) {
        sendNotification("🦀 Ready to move on", message || "Claude finished this turn — go take a look");
      }
      completedTimer = setTimeout(() => {
        if (currentStatus === STATUS.COMPLETED) {
          pushStatus(STATUS.IDLE, "");
        }
      }, 10000);
    }
    if (status === STATUS.ERROR && prevStatus !== STATUS.ERROR) {
      sendNotification("🦀 Claude hit an error", message || "Something went wrong");
      completedTimer = setTimeout(() => {
        if (currentStatus === STATUS.ERROR) {
          pushStatus(STATUS.IDLE, "");
        }
      }, 10000);
    }
  }

  function sendNotification(title, body) {
    try {
      if (Notification.isSupported()) {
        new Notification({ title, body }).show();
      }
    } catch (e) {
      /* ignore */
    }
  }

  // ─── Legacy auto hook config (off by default; use scripts/setup-hooks.js instead) ──
  function autoConfigHooks() {
    const claudeDir = path.join(os.homedir(), ".claude");
    const settingsPath = path.join(claudeDir, "settings.json");
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch (e) {
      settings = {};
    }
    if (!settings.hooks) settings.hooks = {};
    const notifyScript = path.join(__dirname, "hooks", "notify.js");
    const marker = notifyScript.replace(/\\/g, "/").toLowerCase();
    const events = ["SessionStart", "SessionEnd", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "Notification"];
    let changed = false;
    for (const event of events) {
      if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
      const exists = settings.hooks[event].some(
        (entry) => entry.hooks && entry.hooks.some((h) => h.command && h.command.replace(/\\/g, "/").toLowerCase().includes(marker)),
      );
      if (!exists) {
        const entry = { hooks: [{ type: "command", command: `node "${notifyScript}" ${event}`, timeout: 10 }] };
        if (event === "PreToolUse" || event === "PostToolUse") entry.matcher = "";
        settings.hooks[event].push(entry);
        changed = true;
      }
    }
    if (changed) {
      try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
        console.log("[CCPet] Claude Code hooks configured");
      } catch (e) {
        console.error("[CCPet] hook config failed:", e.message);
      }
    }
  }

  // ─── Concurrent Claude Code sessions (from hook payloads) ──
  const sessions = new Map(); // session_id → { cwd, name, lastSeen }

  function sessionSummary() {
    return {
      count: sessions.size,
      names: Array.from(sessions.values())
        .map((s) => s.name)
        .filter(Boolean),
    };
  }
  function broadcastSessions() {
    sendToRenderer("sessions-update", sessionSummary());
  }
  function touchSession(id, cwd, event) {
    if (!id) return;
    if (event === "SessionEnd") {
      if (sessions.delete(id)) broadcastSessions();
      return;
    }
    const prev = sessions.get(id) || {};
    const before = sessions.size;
    sessions.set(id, {
      cwd: cwd || prev.cwd || "",
      name: cwd ? path.basename(cwd) : prev.name || "",
      lastSeen: Date.now(),
    });
    if (sessions.size !== before) broadcastSessions();
  }
  // Sessions that died without a SessionEnd hook fall off after 3h of silence
  setInterval(() => {
    const cutoff = Date.now() - 3 * 3600 * 1000;
    let changed = false;
    for (const [id, s] of sessions) {
      if (s.lastSeen < cutoff) {
        sessions.delete(id);
        changed = true;
      }
    }
    if (changed) broadcastSessions();
  }, 60000);

  // ─── Native context menu (not clipped by the tiny pet window) ──
  function menuAction(action) {
    sendToRenderer("menu-action", action);
  }
  ipcMain.on("show-menu", (event, state) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const s = state || {};
    const template = [
      { label: "💬 Open Claude", click: () => menuAction("open-claude") },
      { label: "📊 Today's usage", click: () => menuAction("usage") },
      { label: `🚶 Roam: ${s.roam ? "On" : "Off"}`, click: () => menuAction("toggle-roam") },
      { label: s.hidden ? "👋 Bring back from edge" : "🙈 Hide at screen edge", click: () => menuAction("toggle-hide") },
      { label: `😈 Mischief: ${s.mischief === false ? "Off" : "On"}`, click: () => menuAction("toggle-mischief") },
      {
        label: "🚀 Start with Windows",
        type: "checkbox",
        enabled: autoStartSupported(),
        checked: autoStartEnabled(),
        click: () => menuAction("toggle-autostart"),
      },
      { type: "separator" },
      {
        label: "🎭 Tricks",
        submenu: [
          { label: "👋 Wave", click: () => menuAction("wave") },
          { label: "⬆️ Jump", click: () => menuAction("jump") },
          { label: "🤸 Backflip", click: () => menuAction("backflip") },
          { label: "🤔 Think", click: () => menuAction("think") },
          { label: "🌸 Flower", click: () => menuAction("flower") },
          { label: "🍟 Snack time", click: () => menuAction("snack") },
          { label: "😴 Nap", click: () => menuAction("nap") },
          { type: "separator" },
          { label: "🤾 Fling me", click: () => menuAction("fling") },
          { label: "🐦 Perch on a window", click: () => menuAction("perch") },
          { label: "🎣 Steal the cursor", click: () => menuAction("steal-cursor") },
        ],
      },
      { type: "separator" },
      { label: "📥 Import pet…", click: () => menuAction("import-pet") },
      { label: "📌 Always on top", type: "checkbox", checked: !!s.onTop, click: () => menuAction("toggle-top") },
      { type: "separator" },
      { label: "🔄 Restart", click: () => restartApp() },
      { label: "🚪 Quit", click: () => menuAction("quit") },
    ];
    Menu.buildFromTemplate(template).popup({
      window: mainWindow,
      callback: () => sendToRenderer("menu-closed"),
    });
  });

  // ─── HTTP status server ──────────────────────────────
  function startHttpServer() {
    httpServer = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }
      if (req.method === "GET" && req.url === "/status") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            status: currentStatus,
            message: statusMessage,
            fullscreen: fullscreenActive,
            sessions: sessionSummary(),
            windows: lastWindows,
          }),
        );
        return;
      }
      if (req.method === "POST" && req.url === "/status") {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const { status, sessionId, cwd, event } = JSON.parse(body);
            let { message } = JSON.parse(body);
            touchSession(sessionId, cwd, event);
            // With several sessions running, tag live bubbles with the project name
            if (sessions.size >= 2 && cwd && message && (status === "running" || status === "waiting")) {
              message = `[${path.basename(cwd)}] ${message}`;
            }
            if (Object.values(STATUS).includes(status)) {
              pushStatus(status, message || "");
              res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ ok: true }));
            } else {
              res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ error: "Invalid status" }));
            }
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
        });
        return;
      }
      // Debug helpers (localhost only): usage/cost readout, simulate fullscreen on/off
      if (req.method === "GET" && req.url === "/usage") {
        getUsage().then((data) => {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(data));
        });
        return;
      }
      if (req.method === "POST" && req.url === "/windows") {
        // Inject window geometry (DIP rects) for testing the perch behaviour
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const data = JSON.parse(body);
            lastWindows = { fg: data.fg || null, claude: data.claude || null };
            sendToRenderer("windows-update", lastWindows);
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
        });
        return;
      }
      if (req.method === "POST" && req.url === "/action") {
        // Trigger any context-menu action remotely (testing / screenshots)
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          let action = "";
          try {
            action = String(JSON.parse(body).action || "");
          } catch (e) {
            /* ignore */
          }
          if (action && action !== "quit" && action !== "restart") {
            sendToRenderer("menu-action", action);
          }
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: true, action }));
        });
        return;
      }
      if (req.method === "POST" && req.url === "/restart") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true }));
        setTimeout(restartApp, 200);
        return;
      }
      if (req.method === "POST" && req.url === "/idle") {
        // Simulate system idle seconds for 90s (testing doze/sleep)
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          let seconds = 0;
          try {
            seconds = Number(JSON.parse(body).seconds) || 0;
          } catch (e) {
            /* ignore */
          }
          idleOverride = { seconds, until: Date.now() + 90000 };
          sendToRenderer("system-idle", seconds);
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: true, seconds }));
        });
        return;
      }
      if (req.method === "POST" && req.url === "/fullscreen") {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          let active = false;
          try {
            active = !!JSON.parse(body).active;
          } catch (e) {
            /* ignore */
          }
          fullscreenActive = active;
          sendToRenderer("fullscreen-change", active);
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: true, fullscreen: active }));
        });
        return;
      }
      res.writeHead(404);
      res.end("Not Found");
    });

    httpServer.on("error", (e) => {
      console.error("[CCPet] status server error:", e.message);
    });
    httpServer.listen(PORT, "127.0.0.1", () => {
      console.log(`[CCPet] status server: http://127.0.0.1:${PORT}`);
    });
  }

  // ─── System idle (no mouse/keyboard anywhere) → renderer dozes / sleeps ──
  let idleOverride = null;
  function startIdleMonitor() {
    setInterval(() => {
      let seconds;
      if (idleOverride && Date.now() < idleOverride.until) {
        seconds = idleOverride.seconds;
      } else {
        idleOverride = null;
        try {
          seconds = powerMonitor.getSystemIdleTime();
        } catch (e) {
          return;
        }
      }
      sendToRenderer("system-idle", seconds);
    }, 10000);
  }

  // ─── Fullscreen watcher (PowerShell helper, prints FS:0/FS:1 on change) ──
  function startFullscreenWatcher() {
    if (process.platform !== "win32" || quitting) return;
    const script = path.join(__dirname, "scripts", "fullscreen-watch.ps1");
    if (!fs.existsSync(script)) return;
    let child;
    try {
      child = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-SelfPid", String(process.pid), "-Interval", "1.5"],
        { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
      );
    } catch (e) {
      console.error("[CCPet] fullscreen watcher failed:", e.message);
      return;
    }
    fsWatcher = child;
    let buf = "";
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line.startsWith("WIN:")) {
          handleWindowsLine(line.slice(4));
          continue;
        }
        if (!line.startsWith("FS:")) continue;
        const active = line === "FS:1";
        if (trailWindow && !trailWindow.isDestroyed()) {
          if (active) trailWindow.hide();
        }
        if (active !== fullscreenActive) {
          fullscreenActive = active;
          console.log(`[CCPet] fullscreen app ${active ? "detected" : "gone"}`);
          sendToRenderer("fullscreen-change", active);
        }
      }
    });
    child.on("exit", () => {
      fsWatcher = null;
      if (!quitting) setTimeout(startFullscreenWatcher, 10000);
    });
  }

  function stopFullscreenWatcher() {
    if (fsWatcher) {
      try {
        fsWatcher.kill();
      } catch (e) {
        /* ignore */
      }
      fsWatcher = null;
    }
  }

  // ─── Usage + cost (ccusage, offline pricing) ─────────
  const CCUSAGE_CLI = path.join(__dirname, "node_modules", "ccusage", "src", "cli.js");
  const USAGE_TTL_MS = 5 * 60 * 1000;
  let usageCache = { at: 0, data: null };
  let usageInFlight = null;

  // Prefer the system node: a console-subsystem exe honours windowsHide, whereas
  // Electron-as-node allocates a console of its own → the black window flash.
  let nodeExeCache;
  function findNodeExe() {
    if (nodeExeCache !== undefined) return nodeExeCache;
    nodeExeCache = null;
    try {
      const { spawnSync } = require("child_process");
      const r = spawnSync(process.platform === "win32" ? "where" : "which", ["node"], { windowsHide: true });
      const first = String(r.stdout || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && fs.existsSync(l));
      if (first) nodeExeCache = first;
    } catch (e) {
      /* ignore */
    }
    return nodeExeCache;
  }

  function todayYmd() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  }

  function runCcusageToday() {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(CCUSAGE_CLI)) {
        reject(new Error("ccusage not installed"));
        return;
      }
      const ymd = todayYmd();
      const args = [CCUSAGE_CLI, "daily", "--json", "--offline", "--since", ymd, "--until", ymd];
      let child;
      try {
        const nodeExe = findNodeExe();
        child = nodeExe
          ? spawn(nodeExe, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
          : spawn(process.execPath, args, {
              // Fallback: Electron's bundled Node (may flash a console briefly)
              env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
              windowsHide: true,
              stdio: ["ignore", "pipe", "pipe"],
            });
      } catch (e) {
        reject(e);
        return;
      }
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("ccusage timed out"));
      }, 25000);
      child.stdout.on("data", (c) => (out += c));
      child.stderr.on("data", (c) => (err += c));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", () => {
        clearTimeout(timer);
        try {
          const json = JSON.parse(out);
          const t = json.totals || {};
          const day = (json.daily && json.daily[0]) || {};
          resolve({
            source: "ccusage",
            totalCost: t.totalCost || 0,
            inputTokens: t.inputTokens || 0,
            outputTokens: t.outputTokens || 0,
            cacheReadTokens: t.cacheReadTokens || 0,
            cacheCreationTokens: t.cacheCreationTokens || 0,
            models: day.modelsUsed || [],
          });
        } catch (e) {
          reject(new Error("ccusage parse failed: " + (err || e.message).slice(0, 200)));
        }
      });
    });
  }

  // Fallback: parse ~/.claude/projects JSONL ourselves (tokens only, no cost)
  function collectUsageToday() {
    const projectsDir = path.join(os.homedir(), ".claude", "projects");
    const sums = { source: "local", totalCost: null, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, models: [] };
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    let dirs;
    try {
      dirs = fs.readdirSync(projectsDir, { withFileTypes: true });
    } catch (e) {
      return { ...sums, error: "no-projects-dir" };
    }
    const seen = new Set();
    const models = new Set();
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const dpath = path.join(projectsDir, dir.name);
      let files;
      try {
        files = fs.readdirSync(dpath);
      } catch (e) {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".jsonl")) continue;
        const fpath = path.join(dpath, f);
        let st;
        try {
          st = fs.statSync(fpath);
        } catch (e) {
          continue;
        }
        if (st.mtimeMs < dayStart.getTime() || st.size > 200 * 1024 * 1024) continue;
        let text;
        try {
          text = fs.readFileSync(fpath, "utf8");
        } catch (e) {
          continue;
        }
        for (const line of text.split("\n")) {
          if (!line || line.indexOf('"usage"') === -1) continue;
          let obj;
          try {
            obj = JSON.parse(line);
          } catch (e) {
            continue;
          }
          const msg = obj.message;
          const usage = msg && msg.usage;
          if (!usage) continue;
          if (obj.timestamp) {
            const t = new Date(obj.timestamp);
            if (!isNaN(t.getTime()) && t < dayStart) continue;
          }
          if (msg.id) {
            const key = msg.id + ":" + (obj.requestId || "");
            if (seen.has(key)) continue;
            seen.add(key);
          }
          sums.inputTokens += usage.input_tokens || 0;
          sums.outputTokens += usage.output_tokens || 0;
          sums.cacheReadTokens += usage.cache_read_input_tokens || 0;
          sums.cacheCreationTokens += usage.cache_creation_input_tokens || 0;
          if (msg.model) models.add(msg.model);
        }
      }
    }
    sums.models = Array.from(models);
    return sums;
  }

  async function refreshUsage() {
    if (usageInFlight) return usageInFlight;
    usageInFlight = (async () => {
      let data;
      try {
        data = await runCcusageToday();
      } catch (e) {
        console.warn("[CCPet] ccusage unavailable, falling back:", e.message);
        try {
          data = collectUsageToday();
          data.fallbackReason = e.message;
        } catch (e2) {
          data = { error: e2.message };
        }
      }
      usageCache = { at: Date.now(), data };
      usageInFlight = null;
      return data;
    })();
    return usageInFlight;
  }

  // Clicks are served from the cache (warmed at startup, refreshed in the background)
  async function getUsage() {
    if (usageCache.data && Date.now() - usageCache.at < USAGE_TTL_MS) return usageCache.data;
    if (usageCache.data) {
      refreshUsage(); // stale: return what we have, refresh quietly
      return usageCache.data;
    }
    return refreshUsage();
  }

  function startUsagePrefetch() {
    setTimeout(() => refreshUsage(), 4000);
    setInterval(() => refreshUsage(), USAGE_TTL_MS);
  }

  ipcMain.handle("get-usage", () => getUsage());

  // ─── Start with Windows ──────────────────────────────
  function autoStartSupported() {
    return app.isPackaged && process.platform === "win32";
  }
  function applyAutoStart(enabled) {
    if (!autoStartSupported()) return false;
    try {
      app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath, args: [] });
      return true;
    } catch (e) {
      console.error("[CCPet] setLoginItemSettings failed:", e.message);
      return false;
    }
  }
  function autoStartEnabled() {
    if (!autoStartSupported()) return false;
    try {
      return !!app.getLoginItemSettings({ path: process.execPath }).openAtLogin;
    } catch (e) {
      return false;
    }
  }
  ipcMain.handle("get-autostart", () => ({ supported: autoStartSupported(), enabled: autoStartEnabled() }));
  ipcMain.handle("set-autostart", (event, enabled) => {
    const ok = applyAutoStart(enabled);
    if (ok) saveConfig({ autoStart: !!enabled });
    return { supported: autoStartSupported(), enabled: autoStartEnabled() };
  });

  // ─── Tray ────────────────────────────────────────────
  function createTray() {
    const iconPath = path.join(__dirname, "assets", "tray.png");
    if (!fs.existsSync(iconPath)) return;
    try {
      tray = new Tray(nativeImage.createFromPath(iconPath));
    } catch (e) {
      console.error("[CCPet] tray failed:", e.message);
      return;
    }
    tray.setToolTip("Claw'd — Claude Code pet");
    const rebuild = () => {
      const menu = Menu.buildFromTemplate([
        { label: "💬 Open Claude", click: () => openClaudeApp() },
        { label: "📊 Today's usage", click: () => sendToRenderer("tray-command", "usage") },
        { label: "🚶 Toggle roaming", click: () => sendToRenderer("tray-command", "toggle-roam") },
        { label: "🙈 Hide at screen edge / bring back", click: () => sendToRenderer("tray-command", "toggle-hide") },
        { type: "separator" },
        {
          label: "🚀 Start with Windows",
          type: "checkbox",
          enabled: autoStartSupported(),
          checked: autoStartEnabled(),
          click: (item) => {
            applyAutoStart(item.checked);
            saveConfig({ autoStart: item.checked });
          },
        },
        { type: "separator" },
        { label: "🔄 Restart", click: () => restartApp() },
        { label: "🚪 Quit", click: () => quitApp() },
      ]);
      tray.setContextMenu(menu);
    };
    rebuild();
    tray.on("click", () => sendToRenderer("tray-command", "usage"));
    tray.on("right-click", rebuild);
  }

  function quitApp() {
    quitting = true;
    stopFullscreenWatcher();
    stopCursorHelper();
    if (trailWindow && !trailWindow.isDestroyed()) trailWindow.destroy();
    if (httpServer) httpServer.close();
    if (completedTimer) clearTimeout(completedTimer);
    if (tray) {
      tray.destroy();
      tray = null;
    }
    app.quit();
  }

  function restartApp() {
    quitting = true;
    stopFullscreenWatcher();
    if (httpServer) httpServer.close();
    if (tray) {
      tray.destroy();
      tray = null;
    }
    app.relaunch(); // spawns a fresh instance once this one exits (lock is released by then)
    app.exit(0);
  }

  // ─── IPC: window control ─────────────────────────────
  ipcMain.on("set-ignore-mouse", (event, ignore) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(!!ignore, { forward: true });
    }
  });
  ipcMain.handle("get-window-position", () => {
    if (mainWindow && !mainWindow.isDestroyed()) return mainWindow.getPosition();
    return [0, 0];
  });
  ipcMain.on("set-window-position", (event, { x, y }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBounds({ x: Math.round(x), y: Math.round(y), width: WIN_W, height: WIN_H }, false);
    }
  });
  ipcMain.on("toggle-always-on-top", (event, flag) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(flag, "screen-saver");
  });
  ipcMain.handle("get-work-area", () => {
    let cx = 0;
    let cy = 0;
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      cx = b.x + Math.round(b.width / 2);
      cy = b.y + Math.round(b.height / 2);
    }
    return screen.getDisplayNearestPoint({ x: cx, y: cy }).workArea;
  });
  ipcMain.on("quit-app", () => quitApp());
  ipcMain.on("restart-app", () => restartApp());

  // ─── Open / focus the Claude desktop app ─────────────
  function openClaudeApp() {
    const script = path.join(__dirname, "scripts", "focus-claude.ps1");
    if (process.platform !== "win32" || !fs.existsSync(script)) return;
    try {
      spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
        { windowsHide: true, stdio: "ignore" },
      );
    } catch (e) {
      console.error("[CCPet] open Claude failed:", e.message);
    }
  }
  ipcMain.on("open-claude", () => openClaudeApp());

  // ─── Window geometry from the watcher (physical px → DIP) ──
  let lastWindows = { fg: null, claude: null };
  function rectToDip(w) {
    if (!w || typeof w.l !== "number") return null;
    if (w.l <= -30000 || w.r - w.l <= 0 || w.b - w.t <= 0) return null; // minimized / bogus
    const tl = screen.screenToDipPoint({ x: w.l, y: w.t });
    const br = screen.screenToDipPoint({ x: w.r, y: w.b });
    return {
      hwnd: w.hwnd,
      x: Math.round(tl.x),
      y: Math.round(tl.y),
      w: Math.round(br.x - tl.x),
      h: Math.round(br.y - tl.y),
      title: w.title || "",
      cls: w.cls || "",
      pid: w.pid || 0,
      maximized: !!w.maximized,
      fullscreen: !!w.fullscreen,
    };
  }
  function handleWindowsLine(json) {
    let data;
    try {
      data = JSON.parse(json);
    } catch (e) {
      return;
    }
    lastWindows = { fg: rectToDip(data.fg), claude: rectToDip(data.claude) };
    sendToRenderer("windows-update", lastWindows);
  }
  ipcMain.handle("get-windows", () => lastWindows);

  // ─── Muddy footprints: click-through overlay over the pet's work area ──
  let trailWindow = null;
  let trailBounds = null;
  function createTrailWindow() {
    if (trailWindow && !trailWindow.isDestroyed()) return trailWindow;
    let cx = 0;
    let cy = 0;
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds();
      cx = b.x + Math.round(b.width / 2);
      cy = b.y + Math.round(b.height / 2);
    }
    trailBounds = screen.getDisplayNearestPoint({ x: cx, y: cy }).workArea;
    trailWindow = new BrowserWindow({
      x: trailBounds.x,
      y: trailBounds.y,
      width: trailBounds.width,
      height: trailBounds.height,
      title: " ",
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      movable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "renderer", "trail-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        zoomFactor: 1,
      },
    });
    trailWindow.setIgnoreMouseEvents(true, { forward: true });
    trailWindow.setAlwaysOnTop(true, "floating"); // below the pet ("screen-saver" level)
    trailWindow.loadFile(path.join(__dirname, "renderer", "trail.html"));
    trailWindow.on("closed", () => {
      trailWindow = null;
    });
    return trailWindow;
  }
  ipcMain.on("footprint", (event, fp) => {
    if (fullscreenActive || !fp) return;
    const win = createTrailWindow();
    if (!win || !trailBounds) return;
    const local = { x: fp.x - trailBounds.x, y: fp.y - trailBounds.y, dir: fp.dir, tone: fp.tone };
    if (local.x < 0 || local.y < 0 || local.x > trailBounds.width || local.y > trailBounds.height) return;
    if (!win.isVisible()) win.showInactive();
    win.webContents.send("footprint", local);
  });
  ipcMain.on("trail-clear", () => {
    if (trailWindow && !trailWindow.isDestroyed()) trailWindow.webContents.send("trail-clear");
  });
  ipcMain.on("trail-idle", () => {
    if (trailWindow && !trailWindow.isDestroyed()) trailWindow.hide(); // nothing left to show
  });

  // ─── Cursor stealing: lazy PowerShell helper that moves the mouse ──
  let cursorHelper = null;
  function ensureCursorHelper() {
    if (cursorHelper) return cursorHelper;
    const script = path.join(__dirname, "scripts", "cursor-helper.ps1");
    if (process.platform !== "win32" || !fs.existsSync(script)) return null;
    try {
      cursorHelper = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script],
        { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] },
      );
      cursorHelper.on("exit", () => {
        cursorHelper = null;
      });
    } catch (e) {
      cursorHelper = null;
    }
    return cursorHelper;
  }
  function stopCursorHelper() {
    if (cursorHelper) {
      try {
        cursorHelper.stdin.write("QUIT\n");
        cursorHelper.kill();
      } catch (e) {
        /* ignore */
      }
      cursorHelper = null;
    }
  }
  ipcMain.handle("get-cursor", () => screen.getCursorScreenPoint());
  ipcMain.on("set-cursor", (event, { x, y }) => {
    const h = ensureCursorHelper();
    if (!h || !h.stdin || !h.stdin.writable) return;
    const p = screen.dipToScreenPoint({ x: Math.round(x), y: Math.round(y) });
    h.stdin.write(`SET ${Math.round(p.x)} ${Math.round(p.y)}\n`);
  });

  // ─── Pet import / management ─────────────────────────
  ipcMain.handle("import-pet-zip", async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Import pet pack",
      filters: [{ name: "Pet pack", extensions: ["zip"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const zipPath = result.filePaths[0];
    const zip = new AdmZip(zipPath);
    let petJsonEntry = zip.getEntry("pet.json");
    const entries = zip.getEntries();
    if (!petJsonEntry) {
      for (const entry of entries) {
        if (entry.entryName.endsWith("pet.json") && !entry.entryName.startsWith("__MACOSX")) {
          petJsonEntry = entry;
          break;
        }
      }
    }
    if (!petJsonEntry) throw new Error("pet.json not found in zip");
    const manifest = JSON.parse(petJsonEntry.getData().toString("utf8"));
    const destDir = path.join(getPetsDir(), manifest.id);
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of entries) {
      if (entry.isDirectory || entry.entryName.startsWith("__MACOSX")) continue;
      const name = entry.entryName;
      const slashIdx = name.indexOf("/");
      const relative = slashIdx >= 0 ? name.substring(slashIdx + 1) : name;
      if (!relative) continue;
      const outPath = path.join(destDir, relative);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, entry.getData());
    }
    setCurrentPetId(manifest.id);
    console.log(`[CCPet] imported pet: ${manifest.displayName} (${manifest.id})`);
    return manifest;
  });

  ipcMain.handle("list-pets", () => {
    try {
      const dir = getPetsDir();
      const pets = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const petJson = path.join(dir, entry.name, "pet.json");
        if (fs.existsSync(petJson)) {
          try {
            pets.push(JSON.parse(fs.readFileSync(petJson, "utf8")));
          } catch (e) {
            console.warn(`[CCPet] skipping invalid pet: ${entry.name}`);
          }
        }
      }
      return pets;
    } catch (e) {
      return [];
    }
  });
  ipcMain.handle("get-pet-dir", (event, petId) => {
    const dir = path.join(getPetsDir(), petId);
    if (!fs.existsSync(dir)) throw new Error(`pet not found: ${petId}`);
    return dir;
  });
  ipcMain.handle("get-current-pet-id", () => getCurrentPetId());
  ipcMain.on("set-current-pet-id", (event, petId) => setCurrentPetId(petId));

  // ─── App lifecycle ───────────────────────────────────
  app.commandLine.appendSwitch("disable-gpu");
  app.disableHardwareAcceleration();

  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  app.whenReady().then(() => {
    createWindow();
    startHttpServer();
    createTray();
    startFullscreenWatcher();
    startIdleMonitor();
    createTrailWindow(); // pre-create so the first footprint isn't lost while it loads
    startUsagePrefetch();

    // Start with Windows: default ON for the packaged app, remembered in config
    if (autoStartSupported()) {
      const cfg = loadConfig();
      const want = cfg.autoStart !== false;
      applyAutoStart(want);
      if (cfg.autoStart === undefined) saveConfig({ autoStart: want });
    }

    // Writing ~/.claude/settings.json is a global change — opt-in only (CCPET_AUTOCONFIG=1)
    if (process.env.CCPET_AUTOCONFIG === "1") {
      autoConfigHooks();
    } else {
      console.log("[CCPet] hooks auto-config skipped (set CCPET_AUTOCONFIG=1 or run scripts/setup-hooks.js)");
    }
  });

  app.on("window-all-closed", () => {
    quitApp();
  });

  app.on("before-quit", () => {
    quitting = true;
    stopFullscreenWatcher();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
