#!/usr/bin/env node
// watch.js - one long-lived sampler of the DEV pet's GET /debug/state (QA only).
//
// lib.sh's st() costs a curl plus a node start per read (~0.45 s), so events shorter than that (a
// 130 ms blink, a 400 ms dangle-scared) were caught by luck. This polls over one keep-alive
// connection every --every ms (default 25) inside a single process.
//
//   node watch.js --port 31127 --expr 'o.anim' --ms 2500                 seq: distinct values joined by '>'
//   node watch.js --port 31127 --expr 'o.anim' --ms 1500 --until '^dizzy$'
//        wait: prints the first value matching the regex and exits 0; else the last value, exit 1
//   --log <file>   also append "<t s>\t<value>" for every change (debugging)
//
// Values follow lib.sh jv(): null / undefined -> '' and objects -> JSON. Never talks to 31126.
"use strict";
const http = require("http");
const fs = require("fs");

const args = { port: 31127, expr: "o.anim", ms: 3000, until: null, every: 25, log: null };
const av = process.argv.slice(2);
for (let i = 0; i < av.length; i += 2) {
  const k = av[i].replace(/^--/, "");
  if (!(k in args)) {
    console.error("watch.js: unknown option " + av[i]);
    process.exit(2);
  }
  args[k] = av[i + 1];
}
const port = Number(args.port);
if (port === 31126) {
  console.error("watch.js: 31126 is the live pet. Refusing.");
  process.exit(2);
}
const ms = Number(args.ms) || 0;
const every = Math.max(5, Number(args.every) || 25);
const re = args.until != null ? new RegExp(args.until) : null;
// eslint-disable-next-line no-new-func
const pick = new Function("o", "try { return (" + args.expr + "); } catch (e) { return undefined; }");
const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });

function state() {
  return new Promise((resolve) => {
    const r = http.request(
      { host: "127.0.0.1", port, path: "/debug/state", headers: { "X-Clawd-Debug": "1" }, agent, timeout: 3000 },
      (res) => {
        let b = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(b));
          } catch (e) {
            resolve(null);
          }
        });
      }
    );
    r.on("timeout", () => r.destroy());
    r.on("error", () => resolve(null));
    r.end();
  });
}
const fmt = (v) => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const sleep = (t) => new Promise((r) => setTimeout(r, t));

(async () => {
  const t0 = Date.now();
  let last = null;
  const seen = [];
  for (;;) {
    const o = await state();
    if (o) {
      const v = fmt(pick(o));
      if (v !== last) {
        last = v;
        seen.push(v);
        if (args.log) fs.appendFileSync(args.log, ((Date.now() - t0) / 1000).toFixed(3) + "\t" + v + "\n");
        if (re && re.test(v)) {
          process.stdout.write(v);
          agent.destroy();
          process.exit(0);
        }
      }
    }
    if (Date.now() - t0 >= ms) break;
    await sleep(every);
  }
  agent.destroy();
  if (re) {
    process.stdout.write(last == null ? "" : last);
    process.exit(1);
  }
  process.stdout.write(seen.join(">"));
  // seq mode: no /debug/state answer at all is a sampler failure, not an empty sequence (an empty
  // sequence would make every "never shows X" check pass without testing anything)
  if (!seen.length) {
    console.error("watch.js: no /debug/state sample in " + ms + " ms (port " + port + ")");
    process.exit(3);
  }
})();
