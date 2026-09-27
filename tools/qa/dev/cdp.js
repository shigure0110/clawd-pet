#!/usr/bin/env node
// cdp.js - drive the DEV pet's renderer over the Chrome DevTools Protocol (QA only).
// The dev instance must have been started by start_dev.ps1 (it passes --remote-debugging-port, default 9231).
// Never point this at the live pet: it has no debugging port, and this script refuses port 31126 targets.
//
//   node tools/qa/dev/cdp.js [--port 9231] <command> [args]
//
// Commands (mouse input is synthesised as DOM events on #pet-hitbox / document with controlled
// screenX/screenY, so it never moves the real cursor; file drags use Input.dispatchDragEvent so
// the renderer sees real file paths):
//   eval "<js expression>"          print the JSON value
//   down                            mousedown on the hitbox centre (starts a drag / D1)
//   move <dx> <dy> <ms> [steps]     mousemove from the last point by (dx,dy) screen px over ms
//   up                              mouseup at the last point
//   drag <dx> <dy> <ms> [holdMs]    down, hold, move, up  (fast = D2 / fling, slow = D3)
//   click | dblclick                a plain click (must not flash dangle) / a double click
//   hover                           mouseenter on the hitbox (petting starts after 1.2 s; D8 after 6 s)
//   leave                           mouseleave
//   tickle <toggles> <ms>           alternating enter/leave with a 60 px mouse path (D9)
//   filedrag <enter|over|drop|leave> <abs path> [...]   OS-style file drag via Input.dispatchDragEvent (D18 / F6)
//   filedrag hold <ms> <abs path>   dragEnter + a dragOver every 100 ms for <ms> (the chomp-open hold
//                                   ends 350 ms after the last dragover, as with a real drag)
//   synthdrag <enter|over|drop|leave> [name] [bytes]  fallback: synthetic DragEvent with an in-page File (no disk path)
//   synthdrag hold <ms> [name] [bytes]                same keep-alive as filedrag hold
//   place park | onscreen | <x> <y> move the DEV window via pet.js setPos (park = x -320, off-screen)
// Note: in headless Chrome, Input.dispatchDragEvent returned OK but no DOM drag event fired (tested 2026-09-27);
// scenarios.sh therefore checks for the chomp-open hold and falls back to synthdrag.
"use strict";

const http = require("http");

let port = 9231;
const argv = process.argv.slice(2);
if (argv[0] === "--port") {
  port = Number(argv[1]);
  argv.splice(0, 2);
}
if (port === 31126 || port === 31127) {
  console.error("cdp.js: " + port + " is a pet HTTP port, not a DevTools port");
  process.exit(2);
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        try { resolve(JSON.parse(b)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  let list;
  try {
    list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  } catch (e) {
    console.error(`cdp.js: no DevTools endpoint on 127.0.0.1:${port} (start the dev pet with tools/qa/dev/start_dev.ps1)`);
    process.exit(3);
  }
  const page = list.find((t) => t.type === "page" && /renderer\/index\.html/.test(t.url)) ||
               list.find((t) => t.type === "page" && !/trail\.html/.test(t.url));
  if (!page) {
    console.error("cdp.js: pet page not found among targets: " + list.map((t) => t.url).join(", "));
    process.exit(3);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { ws, send };
}

async function evaluate(send, expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + JSON.stringify(r.exceptionDetails.exception || {}));
  return r.result.value;
}

// In-page helper: synthesised DOM mouse events with explicit screen coordinates.
const HELPER = `
(function(){
  if (window.__qaMouse) return true;
  const hb = () => document.getElementById("pet-hitbox");
  const centre = () => { const r = hb().getBoundingClientRect(); return { cx: r.left + r.width/2, cy: r.top + r.height/2 }; };
  function fire(target, type, sx, sy, extra) {
    const c = centre();
    const ev = new MouseEvent(type, Object.assign({ bubbles: type !== "mouseenter" && type !== "mouseleave", cancelable: true,
      screenX: sx, screenY: sy, clientX: c.cx + (sx - window.__qaMouse.sx0), clientY: c.cy + (sy - window.__qaMouse.sy0),
      button: 0, buttons: type === "mouseup" ? 0 : 1, view: window }, extra || {}));
    target.dispatchEvent(ev);
  }
  window.__qaMouse = { sx: 0, sy: 0, sx0: 0, sy0: 0, fire, hb, centre };
  window.__qaMouse.home = function () {
    const c = centre();
    this.sx0 = this.sx = Math.round(window.screenX + c.cx);
    this.sy0 = this.sy = Math.round(window.screenY + c.cy);
  };
  return true;
})()`;

async function main() {
  const [cmd, ...a] = argv;
  if (!cmd) {
    console.error("usage: see the header of tools/qa/dev/cdp.js");
    process.exit(1);
  }
  const { ws, send } = await connect();
  await evaluate(send, HELPER);
  const js = (s) => evaluate(send, s);
  const M = "window.__qaMouse";
  try {
    switch (cmd) {
      case "eval":
        console.log(JSON.stringify(await js(a.join(" "))));
        break;
      case "down":
        await js(`${M}.home(); ${M}.fire(${M}.hb(), "mousedown", ${M}.sx, ${M}.sy); true`);
        break;
      case "move": {
        const [dx, dy, ms, steps = 12] = a.map(Number);
        const n = Math.max(1, steps);
        const x0 = await js(`${M}.sx`), y0 = await js(`${M}.sy`);
        for (let i = 1; i <= n; i++) {
          const x = Math.round(x0 + (dx * i) / n), y = Math.round(y0 + (dy * i) / n);
          await js(`${M}.sx=${x}; ${M}.sy=${y}; ${M}.fire(document, "mousemove", ${x}, ${y}); true`);
          await sleep(ms / n);
        }
        break;
      }
      case "up":
        await js(`${M}.fire(document, "mouseup", ${M}.sx, ${M}.sy); true`);
        break;
      case "drag": {
        const [dx, dy, ms, hold = 200] = a.map(Number);
        await js(`${M}.home(); ${M}.fire(${M}.hb(), "mousedown", ${M}.sx, ${M}.sy); true`);
        await sleep(hold);
        const n = Math.max(4, Math.round(ms / 16));
        const x0 = await js(`${M}.sx`), y0 = await js(`${M}.sy`);
        for (let i = 1; i <= n; i++) {
          const x = Math.round(x0 + (dx * i) / n), y = Math.round(y0 + (dy * i) / n);
          await js(`${M}.sx=${x}; ${M}.sy=${y}; ${M}.fire(document, "mousemove", ${x}, ${y}); true`);
          await sleep(ms / n);
        }
        await js(`${M}.fire(document, "mouseup", ${M}.sx, ${M}.sy); true`);
        break;
      }
      // Runtime.evaluate runs at global scope, so a top-level `const` would survive into the next
      // cdp.js call and throw "Identifier 'h' has already been declared": declarations stay inside an IIFE
      case "click":
        await js(`(() => { ${M}.home(); const h=${M}.hb(); ${M}.fire(h,"mousedown",${M}.sx,${M}.sy); ${M}.fire(h,"mouseup",${M}.sx,${M}.sy,{buttons:0}); ${M}.fire(h,"click",${M}.sx,${M}.sy,{buttons:0,detail:1}); return true; })()`);
        break;
      case "dblclick":
        await js(`(() => { ${M}.home(); const h=${M}.hb(); for (const d of [1,2]) { ${M}.fire(h,"mousedown",${M}.sx,${M}.sy); ${M}.fire(h,"mouseup",${M}.sx,${M}.sy,{buttons:0}); ${M}.fire(h,"click",${M}.sx,${M}.sy,{buttons:0,detail:d}); } ${M}.fire(h,"dblclick",${M}.sx,${M}.sy,{buttons:0,detail:2}); return true; })()`);
        break;
      case "place": {
        // Moves the DEV window through pet.js's own setPos (keeps its position cache in step).
        //   place park       → x -320 on the ground (where main.js starts the dev pet: off-screen)
        //   place onscreen   → 240 px in from the left of the work area, on the ground (scared-edge free)
        //   place <x> <y>    → absolute
        const [where, ya] = a;
        const r = await js(`(async () => {
          const wa = await window.ccPet.getWorkArea();
          const g = typeof groundYOf === "function" ? groundYOf(wa) : wa.y + wa.height - 280;
          const w = ${JSON.stringify(where || "park")};
          let x, y;
          if (w === "park") { x = -320; y = g; }
          else if (w === "onscreen") { x = wa.x + 240; y = g; }
          else { x = Number(w); y = Number(${JSON.stringify(ya == null ? "" : ya)}); }
          if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: "bad position" };
          if (typeof cancelStroll === "function") cancelStroll(false);
          if (typeof setPos === "function") setPos(x, y);
          else window.ccPet.setWindowPosition(Math.round(x), Math.round(y));
          await new Promise((r) => setTimeout(r, 120));
          const p = await window.ccPet.getWindowPosition();
          return { ok: true, x: p[0], y: p[1], wa };
        })()`);
        console.log(JSON.stringify(r));
        break;
      }
      case "hover":
        await js(`${M}.home(); ${M}.fire(${M}.hb(), "mouseenter", ${M}.sx, ${M}.sy, {buttons:0}); ${M}.fire(${M}.hb(), "mousemove", ${M}.sx, ${M}.sy, {buttons:0}); true`);
        break;
      case "leave":
        await js(`${M}.fire(${M}.hb(), "mouseleave", ${M}.sx + 80, ${M}.sy, {buttons:0}); true`);
        break;
      case "tickle": {
        const [toggles = 6, ms = 1200] = a.map(Number);
        await js(`${M}.home(); true`);
        for (let i = 0; i < toggles; i++) {
          const inside = i % 2 === 0;
          const x = inside ? 0 : (i % 4 === 1 ? 60 : -60);
          await js(`${M}.sx=${M}.sx0+${x}; ${M}.fire(${inside ? `${M}.hb()` : "document"}, "mousemove", ${M}.sx, ${M}.sy, {buttons:0});
                    ${M}.fire(${M}.hb(), "${inside ? "mouseenter" : "mouseleave"}", ${M}.sx, ${M}.sy, {buttons:0}); true`);
          await sleep(ms / toggles);
        }
        await js(`${M}.fire(${M}.hb(), "mouseleave", ${M}.sx0 + 80, ${M}.sy, {buttons:0}); true`);
        break;
      }
      case "filedrag": {
        // `hold <ms> <path>`: dragEnter, then dragOver every 100 ms for <ms> (pet.js ends the chomp-open
        // hold 350 ms after the last dragover, like a real OS drag that went away), then returns
        // without leaving; follow with `filedrag leave` or `filedrag drop`.
        let [phase, ...files] = a;
        let holdMs = 0;
        if (phase === "hold") holdMs = Number(files.shift()) || 0;
        const c = await js(`(()=>{const r=document.getElementById("pet-hitbox").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
        const type = { enter: "dragEnter", over: "dragOver", hold: "dragEnter", drop: "drop", leave: "dragCancel" }[phase];
        if (!type) throw new Error("filedrag phase must be enter|over|hold|drop|leave");
        const uris = files.map((f) => "file:///" + f.split(String.fromCharCode(92)).join("/")).join("\r\n");
        const data = { items: [{ mimeType: "text/uri-list", data: uris }], files, dragOperationsMask: 1 };
        if (phase === "hold") {
          await send("Input.dispatchDragEvent", { type: "dragEnter", x: c.x, y: c.y, data });
          for (const t0 = Date.now(); Date.now() - t0 < holdMs; ) {
            await sleep(100);
            await send("Input.dispatchDragEvent", { type: "dragOver", x: c.x, y: c.y, data });
          }
          break;
        }
        if (phase === "drop") {
          await send("Input.dispatchDragEvent", { type: "dragEnter", x: c.x, y: c.y, data });
          await send("Input.dispatchDragEvent", { type: "dragOver", x: c.x, y: c.y, data });
        }
        await send("Input.dispatchDragEvent", { type, x: c.x, y: c.y, data });
        break;
      }
      case "synthdrag": {
        // Fallback when Input.dispatchDragEvent does not reach the page: synthetic DragEvents carrying an
        // in-page File (dataTransfer.types includes "Files"). The File has NO disk path, so
        // webUtils.getPathForFile() returns "" - good for the chomp-open hold / leave, not for the F6 report.
        // `hold <ms> [name] [bytes]`: dragenter, then dragover every 100 ms for <ms> (see filedrag hold).
        let [phase, ...rest] = a;
        let holdMs = 0;
        if (phase === "hold") holdMs = Number(rest.shift()) || 0;
        const [name = "qa.js", size = "1024"] = rest;
        const type = { enter: "dragenter", over: "dragover", hold: "dragenter", drop: "drop", leave: "dragleave" }[phase];
        if (!type) throw new Error("synthdrag phase must be enter|over|hold|drop|leave");
        const fire = (seq) => js(`(()=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(${Number(size)})], ${JSON.stringify(name)}));
          const h=document.getElementById("pet-hitbox");const b=h.getBoundingClientRect();const o={bubbles:true,cancelable:true,dataTransfer:dt,clientX:b.left+b.width/2,clientY:b.top+b.height/2};
          const seq=${JSON.stringify(seq)};
          let prevented=[];for(const t of seq){const ev=new DragEvent(t,o);h.dispatchEvent(ev);prevented.push(t+":"+ev.defaultPrevented);}return prevented.join(" ");})()`);
        let r;
        if (phase === "hold") {
          r = await fire(["dragenter", "dragover"]);
          let n = 1;
          for (const t0 = Date.now(); Date.now() - t0 < holdMs; n++) {
            await sleep(100);
            await fire(["dragover"]);
          }
          r += " (+" + n + " dragover)";
        } else {
          r = await fire(phase === "drop" ? ["dragenter", "dragover", "drop"] : [type]);
        }
        console.log(JSON.stringify(r));
        break;
      }
      default:
        console.error("unknown command " + cmd);
        process.exitCode = 1;
    }
  } catch (e) {
    console.error("cdp.js " + cmd + " failed: " + e.message);
    process.exitCode = 1;
  } finally {
    ws.close();
  }
}

main();
