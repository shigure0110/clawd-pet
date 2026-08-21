#!/usr/bin/env node
// CCPet hooks 安装/卸载脚本
//   node scripts/setup-hooks.js install    安装(先清掉旧的再写入)
//   node scripts/setup-hooks.js uninstall  卸载
//   node scripts/setup-hooks.js status     查看当前状态
// 只注册宠物需要的 7 个事件, 修改前自动备份 settings.json → settings.json.ccpet-bak

const fs = require("fs");
const path = require("path");
const os = require("os");

const NOTIFY = path.join(__dirname, "..", "hooks", "notify.js");
const EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "Notification",
];
const TOOL_EVENTS = new Set(["PreToolUse", "PostToolUse"]);
const settingsPath = path.join(os.homedir(), ".claude", "settings.json");

function isOurs(h) {
  return (
    h &&
    typeof h.command === "string" &&
    h.command.replace(/\\/g, "/").toLowerCase().includes("claudecodepet/hooks/notify.js")
  );
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (e) {
    return {};
  }
}

function stripOurs(settings) {
  if (!settings.hooks) return 0;
  let removed = 0;
  for (const ev of Object.keys(settings.hooks)) {
    const arr = settings.hooks[ev];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (entry && Array.isArray(entry.hooks)) {
        const before = entry.hooks.length;
        entry.hooks = entry.hooks.filter((h) => !isOurs(h));
        removed += before - entry.hooks.length;
      }
    }
    settings.hooks[ev] = arr.filter(
      (entry) => entry && Array.isArray(entry.hooks) && entry.hooks.length > 0,
    );
    if (settings.hooks[ev].length === 0) delete settings.hooks[ev];
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
  return removed;
}

function countOurs(settings) {
  let n = 0;
  for (const ev of Object.keys(settings.hooks || {})) {
    for (const entry of settings.hooks[ev] || []) {
      for (const h of entry.hooks || []) {
        if (isOurs(h)) n++;
      }
    }
  }
  return n;
}

function save(settings) {
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, settingsPath + ".ccpet-bak");
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

const mode = process.argv[2] || "status";
const settings = loadSettings();

if (mode === "status") {
  console.log(`[CCPet] settings: ${settingsPath}`);
  console.log(`[CCPet] 已注册的 CCPet hook 数: ${countOurs(settings)}`);
} else if (mode === "uninstall") {
  const removed = stripOurs(settings);
  save(settings);
  console.log(`[CCPet] 已移除 ${removed} 个 hook (备份: settings.json.ccpet-bak)`);
} else if (mode === "install") {
  const removed = stripOurs(settings);
  if (!settings.hooks) settings.hooks = {};
  for (const ev of EVENTS) {
    if (!Array.isArray(settings.hooks[ev])) settings.hooks[ev] = [];
    const entry = {
      hooks: [
        {
          type: "command",
          command: `node "${NOTIFY}" ${ev}`,
          timeout: 10,
        },
      ],
    };
    if (TOOL_EVENTS.has(ev)) entry.matcher = "";
    settings.hooks[ev].push(entry);
  }
  save(settings);
  console.log(
    `[CCPet] 已安装 ${EVENTS.length} 个 hook` +
      (removed ? ` (清理旧条目 ${removed} 个)` : "") +
      ` (备份: settings.json.ccpet-bak)`,
  );
  console.log("[CCPet] 对新启动的 Claude Code 会话生效");
} else {
  console.error(`未知命令: ${mode} (可用: install / uninstall / status)`);
  process.exit(1);
}
