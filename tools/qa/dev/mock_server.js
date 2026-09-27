#!/usr/bin/env node
// mock_server.js - SELF-TEST ONLY: a fake of the dev pet's HTTP API (spec F7 shapes) so the plumbing of
// scenarios.sh / lib.sh (header gate, JSON parsing, captures, montage) can be exercised without Electron.
// It never touches the real pets. Default port 31199 (refuses 31126/31127).
//   node tools/qa/dev/mock_server.js [port]      then   CLAWD_QA_PORT=31199 bash tools/qa/dev/scenarios.sh f7 anim alias
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const port = Number(process.argv[2] || 31199);
// --bad-host: act as if a proxy rewrote every Host header (self-tests the scenarios.sh preflight message)
const forceBadHost = process.argv.includes("--bad-host");
if (port === 31126 || port === 31127) { console.error("mock_server: refusing a real pet port"); process.exit(2); }
const repo = path.resolve(__dirname, "..", "..", "..");
const contract = require(path.join(repo, "tools", "qa", "contract.json"));
const qaDir = path.join(repo, "tmp", "c", "mock_qa");
fs.mkdirSync(qaDir, { recursive: true });
const sample = path.join(repo, "tools", "qa", "out", "rows_new.png");
const state = { anim: "idle", frame: 0, flip: false, peek: null, prio: null, token: 0, queued: null, moveKind: null,
  hat: null, emote: null, flags: 7, rowsAvailable: 43, skin: "built-in", sleepStage: 0, hiddenMode: false, climbSide: null,
  perched: null, focusSession: null, hookEvents: { injected: 0, real: 0 }, cooldowns: {}, reactions: true, mischief: false,
  roam: false, cursorPolls: 0, cpu: 0.4, memMB: 120, win: { x: -320, y: 800 }, mockHideWalks: 0 };
const statuses = []; // POST /status bodies, in arrival order
const frames = (n) => (contract.rows[n] ? contract.rows[n].frames : contract.aliases[n] ? contract.aliases[n].frameIndices.length : 6);
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = (code, o) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url.startsWith("/debug/")) {
      // same order and rules as main.js handleDebugRequest: OPTIONS, then the Host guard (DNS rebinding),
      // then the X-Clawd-Debug header
      if (req.method === "OPTIONS") { res.writeHead(403); return res.end(); }
      if (forceBadHost || !/^(127\.0\.0\.1|localhost):\d+$/.test(String(req.headers.host || ""))) return json(403, { ok: false, error: "bad Host" });
      if (req.headers["x-clawd-debug"] !== "1") return json(403, { ok: false, error: "X-Clawd-Debug: 1 required" });
      let b = {};
      try { b = body ? JSON.parse(body) : {}; } catch (e) { b = {}; }
      switch (req.url) {
        case "/debug/state": return json(200, state);
        case "/debug/anim":
          // {climb, hidden}: the debug pose sets the flags in place, the window never moves (as pet.js)
          if (b.climb != null) state.climbSide = b.climb === "left" || b.climb === "right" ? b.climb : null;
          if (b.hidden != null) state.hiddenMode = !!b.hidden;
          if (!b.name) return json(200, { ok: true, climbSide: state.climbSide, hiddenMode: state.hiddenMode });
          Object.assign(state, { anim: b.name, frame: b.frame || 0, flip: !!b.flip });
          return json(200, { ok: true, row: (contract.rows[b.name] || {}).row || 0, frames: frames(b.name), fallbackUsed: false });
        case "/debug/emote": state.emote = b ? b.name : null; return json(200, { ok: true });
        case "/debug/hat": state.hat = b ? b.id : null; return json(200, { ok: true });
        case "/debug/capture": {
          if (!/^[a-z0-9_-]{1,64}$/.test(b.name || "")) return json(400, { error: "bad name" });
          const p = path.join(qaDir, b.name + ".png");
          fs.copyFileSync(sample, p);
          return json(200, { ok: true, path: p });
        }
        case "/debug/skin": return /^spritesheet[\w-]*\.webp$/.test(b.file || "") || b.reset ? json(200, { ok: true }) : json(400, { error: "bad file" });
        default: return json(200, { ok: true });
      }
    }
    if (req.url === "/usage") return json(200, {});
    // Gate 3 plumbing: POST /status (what notify / replay.sh send) is recorded and counted as a real
    // hook event, like main.js; GET /mock/statuses returns what arrived (self-test of replay.sh)
    if (req.url === "/status" && req.method === "POST") {
      let b = {};
      try { b = JSON.parse(body || "{}"); } catch (e) { b = { _bad: body.slice(0, 80) }; }
      statuses.push(b);
      state.hookEvents.real++;
      if (b.status) state.status = b.status;
      state.bubble = b.message ? { text: b.message, prio: 3, kind: "status", sessionId: b.sessionId || "" } : null;
      return json(200, { ok: true });
    }
    if (req.url === "/mock/statuses") return json(200, statuses);
    // /action toggles like the real pet (so set_flag / the exit trap can be self-tested)
    if (req.url === "/action" && req.method === "POST") {
      let b = {};
      try { b = JSON.parse(body || "{}"); } catch (e) { b = {}; }
      const t = { "toggle-roam": "roam", "toggle-mischief": "mischief", "toggle-hide": "hiddenMode", "toggle-reactions": "reactions" }[b.action];
      if (t) {
        state[t] = !state[t];
        if (t === "hiddenMode") {
          // like enterHide / exitHide: both walk the window to the right edge of the work area (a
          // 1920-wide screen here), even when hiddenMode was only a debug pose on a parked window
          state.climbSide = state.hiddenMode ? "right" : null;
          state.win = { x: state.hiddenMode ? 1656 : 1610, y: 800 };
          state.mockHideWalks = (state.mockHideWalks || 0) + 1;
        }
      }
      return json(200, { ok: true });
    }
    // self-test hook: a 130 ms blink (peek look/7) for watch.js
    if (req.url === "/mock/blink") {
      state.peek = "look/7";
      setTimeout(() => (state.peek = null), 130);
      return json(200, { ok: true });
    }
    json(200, { ok: true });
  });
}).listen(port, "127.0.0.1", () => console.log("mock dev API on " + port));
