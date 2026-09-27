// ── Claw'd desktop pet engine ────────────────────────────────
// Codex Pet Standard sprite sheet (8 cols × 192×208 cells), rows 0–8 standard,
// rows 9–21 are our extensions (laptop, flower, snacks, gaming, backflip, sleep…),
// rows 22+ and their aliases come from window.CLAWD_META (renderer/clawd_meta.js, written by
// assets/make_clawd_sprites.py). Without that file every new name still plays: it falls back
// to one of the rows above.

// ── Sprite atlas ──

const LEGACY_ROWS = 22; // rows 0-21: listed here, pixels frozen
const BUILTIN_SHEET = "spritesheet.webp";
const IS_DEV = !!(window.ccPet && window.ccPet.isDev); // dev instance (CLAWD_PORT set)

const CODEX_ATLAS = {
  columns: 8,
  rows: 22,
  cellWidth: 192,
  cellHeight: 208,
  // Optional per entry: loop (default true), loopStart/loopEnd, next ("@status" or a name),
  // fallback/fallbackFlip (used when a sheet has too few rows), frameIndices + of (aliases)
  animations: {
    idle: { row: 0, frames: 6, frameDurations: [280, 110, 110, 140, 140, 320] },
    "running-right": { row: 1, frames: 8, frameDurations: [120, 120, 120, 120, 120, 120, 120, 220] },
    "running-left": { row: 2, frames: 8, frameDurations: [120, 120, 120, 120, 120, 120, 120, 220] },
    waving: { row: 3, frames: 4, frameDurations: [140, 140, 140, 280] },
    jumping: { row: 4, frames: 5, frameDurations: [140, 140, 140, 140, 280] },
    failed: { row: 5, frames: 8, frameDurations: [140, 140, 140, 140, 140, 140, 140, 240] },
    waiting: { row: 6, frames: 6, frameDurations: [150, 150, 150, 150, 150, 260] },
    running: { row: 7, frames: 6, frameDurations: [120, 120, 120, 120, 120, 220] },
    review: { row: 8, frames: 6, frameDurations: [150, 150, 150, 150, 150, 280] },
    typing: { row: 9, frames: 6, frameDurations: [130, 130, 130, 130, 130, 200], fallback: "running" },
    flower: { row: 10, frames: 6, frameDurations: [260, 260, 260, 260, 180, 260], fallback: "review" },
    coffee: { row: 11, frames: 6, frameDurations: [320, 320, 420, 420, 300, 320], fallback: "idle" },
    water: { row: 12, frames: 6, frameDurations: [320, 320, 420, 420, 300, 320], fallback: "idle" },
    fries: { row: 13, frames: 6, frameDurations: [300, 260, 320, 300, 260, 320], fallback: "idle" },
    sausage: { row: 14, frames: 6, frameDurations: [320, 300, 340, 300, 340, 400], fallback: "idle" },
    gaming: { row: 15, frames: 6, frameDurations: [140, 140, 160, 140, 160, 140], fallback: "idle" },
    backflip: { row: 16, frames: 8, frameDurations: [160, 90, 90, 90, 90, 90, 90, 260], fallback: "jumping" },
    doze: { row: 17, frames: 6, frameDurations: [600, 500, 500, 700, 500, 600], fallback: "idle" },
    sleep: { row: 18, frames: 6, frameDurations: [400, 400, 400, 400, 400, 400], fallback: "idle" },
    stretch: { row: 19, frames: 6, frameDurations: [260, 260, 420, 420, 260, 300], fallback: "waving" },
    phone: { row: 20, frames: 6, frameDurations: [300, 300, 300, 300, 200, 300], fallback: "review" },
    petted: { row: 21, frames: 6, frameDurations: [220, 220, 220, 220, 220, 220], fallback: "waving" },
  },
};

// Stand-ins used only for names that clawd_meta.js does not (yet) define: [fallback, loops,
// fallback when flipped]. They make a missing meta file degrade to the old rows instead of idle.
// The real entries, fallbacks included, come from meta.
const NO_META_FALLBACK = {
  look: ["idle", true],
  hop: ["jumping", false],
  dangle: ["running-right", true],
  dizzy: ["failed", true],
  surprised: ["jumping", false],
  plotting: ["review", true],
  yawn: ["idle", false],
  love: ["waving", true],
  laugh: ["waving", true],
  nervous: ["waiting", true],
  "fingers-crossed": ["waiting", true],
  sad: ["failed", true],
  summon: ["jumping", false],
  chomp: ["idle", false],
  furious: ["failed", true],
  "work-read": ["running", true],
  "work-shell": ["running", true],
  dance: ["jumping", true],
  cool: ["jumping", false],
  trot: ["running-right", true, "running-left"],
  fall: ["jumping", true],
  "hop-land": ["jumping", false],
  "dangle-scared": ["running-right", true],
  startle: ["jumping", false],
  busted: ["jumping", false],
  "summon-return": ["jumping", false],
  "chomp-open": ["idle", true],
  "trot-stop": ["running-right", false, "running-left"],
  squint: ["idle", false],
};

// Rows 22+ and aliases from window.CLAWD_META (never replacing rows 0-21), then stand-ins for
// anything still missing. Returns the other meta tables the engine uses.
function mergeClawdMeta(atlas) {
  const raw = window.CLAWD_META;
  const meta = raw && typeof raw === "object" ? raw : null;
  const info = { meta, expr: new Set(), shakeFrames: {}, anchors: null };
  const A = atlas.animations;
  if (meta) {
    for (const [name, e] of Object.entries(meta.rows || {})) {
      if (A[name] && A[name].row < LEGACY_ROWS) continue;
      if (!e || typeof e.row !== "number" || !(e.frames > 0) || !Array.isArray(e.frameDurations)) continue;
      A[name] = { ...e };
    }
    for (const [name, a] of Object.entries(meta.aliases || {})) {
      if (A[name] || !a || !A[a.of] || !Array.isArray(a.frameIndices) || !Array.isArray(a.frameDurations)) continue;
      A[name] = { ...a };
    }
    if (meta.sheet && meta.sheet.rows > atlas.rows) atlas.rows = meta.sheet.rows;
    info.expr = new Set(Array.isArray(meta.expr) ? meta.expr : []);
    info.shakeFrames = meta.shakeFrames && typeof meta.shakeFrames === "object" ? meta.shakeFrames : {};
    info.anchors = meta.anchors && typeof meta.anchors === "object" ? meta.anchors : null;
  }
  for (const [name, [fallback, loop, fallbackFlip]] of Object.entries(NO_META_FALLBACK)) {
    if (!A[name]) A[name] = { row: Infinity, frames: 0, frameDurations: [], loop, fallback, fallbackFlip, stub: true };
  }
  return info;
}

const META = mergeClawdMeta(CODEX_ATLAS);

const STATUS_MESSAGES = {
  idle: "Idle…",
  running: "Working…",
  waiting: "Waiting for you",
  completed: "Ready to move on! 🦀",
  error: "Oops, an error 😵",
};

// Snack choice by time of day (office rhythm)
function pickSnack(hour) {
  const r = Math.random();
  if (hour >= 6 && hour < 11) return r < 0.7 ? "coffee" : "water";
  if (hour >= 11 && hour < 14) return r < 0.45 ? "fries" : r < 0.8 ? "sausage" : "water";
  if (hour >= 14 && hour < 17) return r < 0.5 ? "coffee" : r < 0.8 ? "water" : "fries";
  if (hour >= 17 && hour < 21) return r < 0.4 ? "sausage" : r < 0.7 ? "fries" : r < 0.85 ? "coffee" : "water";
  return r < 0.5 ? "water" : r < 0.8 ? "coffee" : "fries";
}

// Short time-of-day greetings (Claude-app style). Hours 23–5 wrap past midnight.
const GREETINGS = [
  { from: 5, to: 8, msgs: ["Early bird 🐦", "Rise and shine ☀️", "Up before the sun?"] },
  { from: 8, to: 11, msgs: ["Good morning ☀️", "Coffee time? ☕", "Claude or coffee first?"] },
  { from: 11, to: 14, msgs: ["Lunch soon? 🍟", "Midday check-in 👋", "Hungry yet?"] },
  { from: 14, to: 17, msgs: ["Good afternoon 🌤️", "Post-lunch slump? ☕", "Afternoon tea? 🍵"] },
  { from: 17, to: 20, msgs: ["Good evening 🌇", "Wrapping up for today?", "Dinner time? 🌭"] },
  { from: 20, to: 23, msgs: ["Evening session 🌙", "One more push?", "Remember to rest 💤"] },
  { from: 23, to: 29, msgs: ["Night owl 🦉", "Still up? 🌙", "Sleep soon, okay? 💤"] },
];

function greeting() {
  const h = new Date().getHours();
  const hh = h < 5 ? h + 24 : h;
  const band = GREETINGS.find((b) => hh >= b.from && hh < b.to) || GREETINGS[1];
  return band.msgs[Math.floor(Math.random() * band.msgs.length)];
}

const DOZE_AFTER_S = 180; // 3 min without any input → doze
const SLEEP_AFTER_S = 480; // 8 min → nightcap
const COFFEE_EVERY_MS = 25 * 60 * 1000; // sip while Claude runs long
const LONG_RUN_MS = 30 * 60 * 1000; // stretch after a long run
const SIT_REMIND_MS = 50 * 60 * 1000; // you've been active this long → stretch break
const BREAK_IDLE_S = 300; // 5 min of no input counts as a break
const DBLCLICK_MS = 280; // second click within this window = double click
const HIDE_PEEK_PX = 36; // when hiding at the edge, this much of the crab slides off-screen
const HIDE_CLIMB_PX = 120; // and it clings this far up the wall
const FEET_OFFSET = 11; // crab feet sit this far above the window bottom (208*0.55 cell, 5/52 margin)
const FLING_MIN_SPEED = 550; // px/s of mouse motion at release → thrown instead of dropped
const STEAL_COOLDOWN_MS = 20 * 60 * 1000; // auto cursor-steal at most this often
const STEAL_REACH_PX = 170; // cursor must be within this height above the ground line
const PERCH_MIN_TOP = 140; // a window needs this much room above it to stand on
const TROT_MIN_PX = Infinity; // side-on trot is off: a crab walks sideways (the row stays for /debug/anim)
const DANGLE_AFTER_MS = 150; // a press held this long (or moved 4 px) is a drag, not a click
const DANGLE_MOVE_PX = 4;
const SCARED_SPEED = 1400; // px/s over the last 120 ms of a drag → dangle-scared
const SCARED_EDGE_PX = 40; // …or the window this close to a side / the top of the screen
const SCARED_CALM_MS = 400;
const FLING_WINDOW_MS = 120000; // the 3rd fling inside this makes it furious; more drag flings are refused
const LOVE_AFTER_MS = 6000; // petting this much longer → love
const TICKLE_TOGGLES = 4; // hover enter/leave toggles…
const TICKLE_WINDOW_MS = 1500; // …within this…
const TICKLE_PATH_PX = 40; // …over at least this much cursor travel
const TICKLE_COOLDOWN_MS = 20000;
const YAWN_AT_S = 150; // system idle this long (doze comes at 180) → one yawn
const YAWN_COOLDOWN_MS = 10 * 60 * 1000;
const P2_GAP_MS = 8000; // milestone one-shots at least this far apart (resolving ones exempt)

// ── Mischief state ──
// The dev instance (CLAWD_PORT) starts with mischief and roaming off: it must never steal the
// real cursor, leave footprints or wander over the user's windows unless a scenario asks.
let mischiefEnabled = !IS_DEV;
let muddyStroll = false; // this stroll leaves footprints
let muddyUntil = 0; // …and for a while after tumbling / stealing
let footprintAcc = 0;
let footprintTone = 0;
let windowsInfo = { fg: null, claude: null };
let perched = null; // { hwnd, source: "claude"|"fg", win, until }
let stealing = false;
let lastStealAt = 0;
let dragSamples = [];

function openClaude(engine) {
  closeUsageCard();
  director.playOneShot("waving", { prio: 0, ms: 1600, restart: true, source: "click" });
  showSpeech("Opening Claude 💬", 1500);
  if (window.ccPet && window.ccPet.openClaude) window.ccPet.openClaude();
}

// ── PetEngine ──────────────────────────────────────────────
// currentState / currentFrame / currentFlip always describe the LOGICAL animation. Display-only
// overrides (peek, the squint bridge) never change them, so every `currentState === X` guard
// keeps working while the crab glances around.

function isBuiltInSheet(url) {
  try {
    return new URL(url, location.href).href === new URL(BUILTIN_SHEET, location.href).href;
  } catch (e) {
    return false;
  }
}

class PetEngine {
  constructor(spriteEl, atlas) {
    this.spriteEl = spriteEl;
    this.bodyEl = document.getElementById("pet-body") || spriteEl; // the look-hold breath moves this
    this.atlas = atlas;
    this.currentState = "idle";
    this.currentFrame = 0;
    this.currentFlip = false;
    this.cur = null; // resolved play list of the logical animation
    this.pos = 0; // index into cur.indices
    this.held = false; // hold(): frozen on one frame
    this.ended = false; // a one-shot that played through (its last frame stays)
    this.timerHandle = null;
    this.bridgeTimer = null;
    this.frameDueAt = 0;
    this.paused = null; // ms left on the logical frame while a peek covers it
    this.peekInfo = null; // { name, frame, bridge? }
    this.breathTimer = null;
    this.onEnd = null;
    this.onFrame = null; // (displayName, baseName, frameIndex, flip, row) for what is on screen
    this.resolveNext = null; // "@status" → a row name
    this.shownFlip = false;
    // Until the sheet is measured, only the frozen rows 0-21 count as present
    this.rowsAvailable = LEGACY_ROWS;
    this.colsAvailable = atlas.columns;
    this.builtIn = true;
    this.skinUrl = BUILTIN_SHEET;
    this.applyState("idle");
    this.measureSheet(BUILTIN_SHEET).then((m) => {
      if (m && this.builtIn) this.useSheet(m, BUILTIN_SHEET, false);
    });
  }

  // Resolve a name (alias → base row, then the fallback chain until the row exists in the sheet)
  // into the frames to play. null for an unknown name.
  resolve(name, flip = false) {
    const A = this.atlas.animations;
    const req = A[name];
    if (!req) return null;
    const range = (n) => Array.from({ length: Math.max(0, n | 0) }, (_, i) => i);
    const listOf = (entry, base) =>
      entry.of
        ? { indices: [...entry.frameIndices], durations: [...entry.frameDurations], loopStart: entry.loopStart || 0, loopEnd: entry.loopEnd }
        : { indices: range(base.frames), durations: [...(base.frameDurations || [])], loopStart: base.loopStart || 0, loopEnd: base.loopEnd };
    let base = req.of ? A[req.of] : req;
    if (!base) return null;
    let baseName = req.of || name;
    let list = listOf(req, base);
    let useFlip = !!flip;
    let fallbackUsed = null;
    for (let steps = 0; !(base.row < this.rowsAvailable) && steps < 12; steps++) {
      const flipTarget = useFlip && base.fallbackFlip;
      const nextName = flipTarget ? base.fallbackFlip : base.fallback;
      const next = nextName && A[nextName];
      if (!next) break;
      if (flipTarget) useFlip = false; // that row is already drawn facing the other way
      base = next.of ? A[next.of] : next;
      if (!base) return null;
      baseName = next.of || nextName;
      list = listOf(next, base);
      fallbackUsed = nextName;
    }
    // Frames past the sheet's width are dropped; durations are never 0 (no flicker)
    let pairs = list.indices.map((f, i) => [f, list.durations[i]]).filter(([f]) => f >= 0 && f < this.colsAvailable);
    if (!pairs.length) pairs = [[0, list.durations[0]]];
    const indices = pairs.map((p) => p[0]);
    const durations = pairs.map((p) => Math.max(16, Number(p[1]) || 120));
    const loopEnd = Math.min(list.loopEnd == null ? indices.length - 1 : list.loopEnd, indices.length - 1);
    const loopStart = Math.min(list.loopStart, loopEnd);
    return {
      name,
      baseName,
      row: base.row,
      indices,
      durations,
      loop: req.loop !== false,
      loopStart,
      loopEnd,
      next: req.next || null,
      flip: useFlip,
      fallbackUsed,
    };
  }

  // The row is really in the current sheet (no fallback needed)
  has(name) {
    const r = this.resolve(name);
    return !!r && !r.fallbackUsed && r.row < this.rowsAvailable;
  }

  // How long a play lasts: a one-shot once through; a loop its intro plus `loops` passes
  durationOf(name, loops = 1, flip = false) {
    const r = this.resolve(name, flip);
    if (!r) return 0;
    const sum = (a, b) => r.durations.slice(a, b).reduce((s, d) => s + d, 0);
    if (!r.loop) return sum(0, r.durations.length);
    return sum(0, r.loopStart) + Math.max(1, loops) * sum(r.loopStart, r.loopEnd + 1);
  }

  // Same name + flip on a LOOPING entry without `restart` does nothing (status re-applies keep
  // the frame); a one-shot always restarts. Returns true when something (re)started.
  applyState(state, opts) {
    const { flip = false, restart = false, onEnd = null } = opts || {};
    if (!this.atlas.animations[state]) {
      console.warn(`Unknown state: ${state}, falling back to idle`);
      return state !== "idle" ? this.applyState("idle") : false;
    }
    if (!restart && state === this.currentState && !!flip === this.currentFlip && this.cur && this.cur.loop && !this.held) {
      return false;
    }
    const r = this.resolve(state, flip);
    const prev = this.currentState;
    this.stop();
    this._endPeek();
    this.currentState = state;
    this.currentFlip = !!flip;
    this.cur = r;
    this.onEnd = onEnd;
    this.held = false;
    this.ended = false;
    this.plays = (this.plays || 0) + 1; // (re)starts, for /debug/state
    if (prev !== state && META.expr.has(prev) && META.expr.has(state) && this.builtIn && this.has("squint")) {
      // Squint bridge: the new row is already the logical state; 100 ms of closed eyes cover the swap
      const s = this.resolve("squint");
      this.pos = -1;
      this.currentFrame = -1;
      this.peekInfo = { name: "look", frame: 7, bridge: true };
      this._display(s.row, s.indices[0], r.flip, "squint", s.baseName);
      this.bridgeMs = s.durations[0]; // frame 0 of the new row starts this much later
      this.bridgeTimer = setTimeout(() => {
        this.bridgeTimer = null;
        this.peekInfo = null;
        this._startAt(0);
      }, s.durations[0]);
      return true;
    }
    this._startAt(0);
    return true;
  }

  // Freeze the logical state on one frame (chomp-open while a file hovers; /debug/anim frame)
  hold(state, frameIndex = 0, opts) {
    const { flip = false } = opts || {};
    if (!this.atlas.animations[state]) return false;
    const r = this.resolve(state, flip);
    this.stop();
    this._endPeek();
    this.currentState = state;
    this.currentFlip = !!flip;
    this.cur = r;
    this.onEnd = null;
    this.held = true;
    this.ended = false;
    this.pos = Math.max(0, Math.min(r.indices.length - 1, frameIndex | 0));
    this._showLogical(true);
    return true;
  }

  // Display-only: show one frame of another row, pausing the logical timer. With breathe, the
  // body bobs 1 logical px (4 cell px) every 560 ms while the peek lasts. `owner` tags the peek so
  // unpeek(owner) only ends a peek its caller made (cursor-watch vs a stroll's glance).
  peek(name, frameIndex = 0, opts) {
    const { flip = false, breathe = false, owner = null } = opts || {};
    if (this.bridgeTimer) return false;
    const r = this.resolve(name, flip);
    if (!r) return false;
    if (!this.peekInfo && this.timerHandle !== null) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
      this.paused = Math.max(0, this.frameDueAt - Date.now());
    }
    const i = Math.max(0, Math.min(r.indices.length - 1, frameIndex | 0));
    this.peekInfo = { name, frame: i, owner };
    this._display(r.row, r.indices[i], r.flip, name, r.baseName);
    this._breathe(breathe);
    return true;
  }

  unpeek(owner) {
    if (!this.peekInfo || this.peekInfo.bridge) return;
    if (owner && this.peekInfo.owner !== owner) return;
    this.peekInfo = null;
    this._breathe(false);
    if (!this.cur) return;
    this._showLogical(false);
    if (this.paused !== null) {
      const ms = this.paused;
      this.paused = null;
      this._schedule(Math.max(30, ms));
    }
  }

  _endPeek() {
    this.peekInfo = null;
    this._breathe(false);
  }

  _breathe(on) {
    if (on && !this.breathTimer) {
      let up = true;
      this.bodyEl.style.translate = "0 -4px";
      this.breathTimer = setInterval(() => {
        up = !up;
        this.bodyEl.style.translate = up ? "0 -4px" : "";
      }, 560);
    } else if (!on && this.breathTimer) {
      clearInterval(this.breathTimer);
      this.breathTimer = null;
      this.bodyEl.style.translate = "";
    }
  }

  _startAt(pos) {
    this.pos = pos;
    this._showLogical(true);
    this._schedule(this.cur.durations[pos]);
  }

  _schedule(ms) {
    this.frameDueAt = Date.now() + ms;
    this.timerHandle = setTimeout(() => this._advance(), ms);
  }

  // Intro frames 0..loopStart-1 play once, then loopStart..loopEnd repeat. A one-shot plays
  // through, keeps its last frame, and calls onEnd (else follows `next`).
  _advance() {
    this.timerHandle = null;
    const r = this.cur;
    let p = this.pos + 1;
    if (r.loop) {
      if (p > r.loopEnd) p = r.loopStart;
    } else if (p >= r.indices.length) {
      this.ended = true;
      const cb = this.onEnd;
      this.onEnd = null;
      if (cb) cb();
      else if (r.next) this.applyState(r.next === "@status" && this.resolveNext ? this.resolveNext() : r.next);
      return;
    }
    this._startAt(p);
  }

  _showLogical(fresh) {
    const r = this.cur;
    if (!r || this.pos < 0) return;
    const frame = r.indices[this.pos];
    this.currentFrame = this.pos;
    this._display(r.row, frame, r.flip, this.currentState, r.baseName);
    if (fresh && !r.fallbackUsed && this.builtIn) {
      const sf = META.shakeFrames[r.baseName];
      if (Array.isArray(sf) && sf.includes(frame)) shake();
    }
  }

  _display(row, frame, flip, displayName, baseName) {
    const x = frame * this.atlas.cellWidth;
    const y = row * this.atlas.cellHeight;
    this.spriteEl.style.backgroundPosition = `-${x}px -${y}px`;
    if (this.shownFlip !== !!flip) {
      this.shownFlip = !!flip;
      this.spriteEl.classList.toggle("flip", this.shownFlip);
    }
    this.shown = { name: displayName, base: baseName, row, frame, flip: !!flip };
    if (this.onFrame) {
      try {
        this.onFrame(displayName, baseName, frame, !!flip, row);
      } catch (e) {
        console.warn("[CCPet] onFrame failed:", e);
      }
    }
  }

  stop() {
    if (this.timerHandle !== null) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
    if (this.bridgeTimer !== null) {
      clearTimeout(this.bridgeTimer);
      this.bridgeTimer = null;
    }
    this.paused = null;
  }

  // Rows / columns a sheet really has, or null if it doesn't load
  measureSheet(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () =>
        resolve({
          rows: Math.floor(img.naturalHeight / this.atlas.cellHeight),
          cols: Math.floor(img.naturalWidth / this.atlas.cellWidth),
        });
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  useSheet(m, url, reapply = true) {
    this.rowsAvailable = Math.max(1, m.rows);
    this.colsAvailable = Math.max(1, Math.min(this.atlas.columns, m.cols));
    this.builtIn = isBuiltInSheet(url);
    this.skinUrl = url;
    this.spriteEl.style.backgroundImage = `url("${url}")`;
    // Re-resolve what is playing against the new sheet (a skin with 9 rows falls back)
    if (reapply || !this.cur || this.cur.fallbackUsed || !(this.cur.row < this.rowsAvailable)) {
      this.applyState(this.currentState, { flip: this.currentFlip, restart: true });
    }
  }

  // Loads the image first; a sheet that fails to load leaves the current one in place
  async setSpritesheet(url) {
    const m = await this.measureSheet(url);
    if (!m) {
      console.warn(`[CCPet] sprite sheet failed to load, keeping the current one: ${url}`);
      return false;
    }
    this.useSheet(m, url, true);
    return true;
  }

  debugInfo() {
    const r = this.cur;
    return {
      anim: this.currentState,
      frame: r && this.pos >= 0 ? r.indices[this.pos] : -1,
      pos: this.pos,
      frames: r ? r.indices.length : 0,
      flip: this.currentFlip,
      row: r ? r.row : null,
      base: r ? r.baseName : null,
      fallbackUsed: r ? r.fallbackUsed : null,
      held: this.held,
      ended: this.ended,
      plays: this.plays || 0,
      peek: this.peekInfo ? `${this.peekInfo.name}/${this.peekInfo.frame}${this.peekInfo.bridge ? " (bridge)" : ""}` : null,
      breathing: !!this.breathTimer,
      shown: this.shown || null,
    };
  }
}

// A short horizontal shudder of the whole stage (furious stomps, fling landings). It moves
// #pet-stage with the independent `translate` property, so it never fights moveWindow.
let shakeTimer = null;
let shakeCount = 0; // for /debug/state
function shake(pattern = [3, -2, 2, -1, 1, 0], stepMs = 50) {
  const stage = document.getElementById("pet-stage");
  if (!stage) return;
  shakeCount++;
  if (shakeTimer) clearInterval(shakeTimer);
  let i = 0;
  const step = () => {
    if (i >= pattern.length) {
      clearInterval(shakeTimer);
      shakeTimer = null;
      stage.style.translate = "";
      return;
    }
    stage.style.translate = pattern[i] ? `${pattern[i]}px 0` : "";
    i++;
  };
  step();
  shakeTimer = setInterval(step, stepMs);
}

// ── Particles ──────────────────────────────────────────────

const PARTICLE_SVGS = [
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' fill='%23EE6363'/%3E%3C/svg%3E",
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='%23FFD93D'/%3E%3Ccircle cx='8' cy='10' r='1.5' fill='%23333'/%3E%3Ccircle cx='16' cy='10' r='1.5' fill='%23333'/%3E%3Cpath d='M8 14s1.5 3 4 3 4-3 4-3' stroke='%23333' stroke-width='1.5' stroke-linecap='round' fill='none'/%3E%3C/svg%3E",
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z' fill='%23FFD93D' stroke='%23F9A825' stroke-width='0.5'/%3E%3C/svg%3E",
];

function spawnParticles(clientX, clientY, onlyIndex) {
  const count = Math.floor(Math.random() * 3) + 2;
  for (let i = 0; i < count; i++) {
    const particle = document.createElement("div");
    particle.className = "particle";
    particle.style.left = clientX + (Math.random() - 0.5) * 40 + "px";
    particle.style.top = clientY + (Math.random() - 0.5) * 20 + "px";
    const idx = onlyIndex != null ? onlyIndex : Math.floor(Math.random() * PARTICLE_SVGS.length);
    particle.style.backgroundImage = `url("${PARTICLE_SVGS[idx]}")`;
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 700);
  }
}

// ── Speech bubble ──────────────────────────────────────────

let speechTimer = null;
// Every bubble entry: { text } | { typing: true }, plus until, prio, kind, sessionId.
let liveSpeech = null; // the bubble on screen now
// Bubble priorities (§4.2, lower number wins): a bubble never replaces a live one of higher
// priority, except that a status bubble always replaces a status bubble of its own session (the
// prompting session moving on clears its own P1). `statusBubble` is the status bubble that belongs
// on screen when nothing covers it: it comes back when a reaction / other bubble over it ends.
// `pendingStatusBubble` is the newest status bubble refused by a higher status bubble (another
// session's P1 prompt); it shows once that one ends, and any newer accepted status bubble drops it.
let statusBubble = null;
let pendingStatusBubble = null;

function bubbleWins(prio, kind, sessionId, incumbent) {
  if (!incumbent || incumbent.until <= Date.now()) return true;
  if (kind === "status" && incumbent.kind === "status" && (sessionId || "") === (incumbent.sessionId || "")) return true;
  return prio <= incumbent.prio;
}

// Record a new status bubble. false = refused by a higher status bubble (kept as pending).
function noteStatusBubble(entry) {
  if (bubbleWins(entry.prio, "status", entry.sessionId, statusBubble)) {
    statusBubble = entry;
    pendingStatusBubble = null; // older than this one
    syncWaitingBlink();
    return true;
  }
  pendingStatusBubble = entry; // newest wins
  return false;
}

// A waiting-with-message bubble (a P1 prompt from any session, or the idle reminder) is the status
// bubble: the crab blinks until that session moves on or another bubble replaces it
function syncWaitingBlink() {
  const c = document.getElementById("pet-container");
  if (!c) return;
  const open = !!statusBubble && (statusBubble.prio === 1 || statusBubble.blink) && statusBubble.until > Date.now();
  c.classList.toggle("waiting-blink", open);
}

function restoreStatusBubble() {
  const now = Date.now();
  if ((!statusBubble || statusBubble.until <= now) && pendingStatusBubble) {
    statusBubble = pendingStatusBubble;
    pendingStatusBubble = null;
  }
  syncWaitingBlink();
  const s = statusBubble;
  if (!s || s.until <= now || hiddenMode || usageCard) return;
  const o = { prio: s.prio, kind: "status", sessionId: s.sessionId, blink: s.blink, restoring: true };
  if (s.typing) showTyping(s.until - now, o);
  else showSpeech(s.text, s.until - now, o);
}

// The bubble on screen ran out: a status bubble that ended is over (a pending one may follow);
// one that covered the status bubble hands the screen back to it
function bubbleEnded(ended) {
  if (!ended) return;
  if (ended.kind === "status" && statusBubble && statusBubble.until <= ended.until) statusBubble = null;
  restoreStatusBubble();
}

// Status bubbles of sessions that are gone (SessionEnd, or main dropped them) are cleared
function dropSessionBubbles(alive) {
  const dead = (e) => !!e && e.kind === "status" && !!e.sessionId && !alive.has(e.sessionId);
  if (dead(pendingStatusBubble)) pendingStatusBubble = null;
  if (dead(statusBubble)) statusBubble = null;
  if (dead(deferredSpeech)) deferredSpeech = null;
  if (dead(liveSpeech)) {
    showSpeech("", 0);
    restoreStatusBubble();
  }
  syncWaitingBlink();
}

// opts: { prio=0, kind="other" | "status" | "reaction", sessionId, restoring }
function showSpeech(text, durationMs, opts) {
  const prio = opts && opts.prio != null ? opts.prio : 0;
  const kind = (opts && opts.kind) || "other";
  const sessionId = (opts && opts.sessionId) || "";
  const until = Date.now() + durationMs;
  const blink = !!(opts && opts.blink);
  if (text && kind === "status" && !(opts && opts.restoring) && !noteStatusBubble({ text, until, prio, kind, sessionId, blink })) return;
  // The usage card the user asked for stays on top: the bubble that would be on screen waits in
  // deferredSpeech (same priority rules) and shows once the card closes
  const incumbent = usageCard ? deferredSpeech : liveSpeech;
  if (text && !bubbleWins(prio, kind, sessionId, incumbent)) return; // a status bubble waits in statusBubble
  if (usageCard) {
    deferredSpeech = text ? { text, until, prio, kind, sessionId } : null;
    return;
  }
  const bubble = document.getElementById("pet-speech-bubble");
  const bubbleText = bubble ? bubble.querySelector(".bubble-text") : null;
  if (!bubble || !bubbleText) return;
  if (speechTimer) {
    clearTimeout(speechTimer);
    speechTimer = null;
  }
  const typing = bubble.querySelector(".bubble-typing");
  if (typing) typing.remove();

  if (!text || hiddenMode) {
    bubble.classList.remove("show-bubble");
    liveSpeech = null;
    return;
  }
  bubbleText.textContent = text;
  bubble.classList.add("show-bubble");
  liveSpeech = { text, until, prio, kind, sessionId };
  if (window.__petDebug) {
    const r = bubble.getBoundingClientRect();
    const cs = getComputedStyle(bubble);
    console.log(
      `[pet] bubble box=${bubble.offsetWidth}x${bubble.offsetHeight} scroll=${bubble.scrollWidth}x${bubble.scrollHeight} ` +
        `rect=${Math.round(r.left)}..${Math.round(r.right)} maxW=${cs.maxWidth} w=${cs.width} bs=${cs.boxSizing} ws=${cs.whiteSpace} stage=${document.getElementById("pet-stage").offsetWidth}`,
    );
  }
  speechTimer = setTimeout(() => {
    bubble.classList.remove("show-bubble");
    speechTimer = null;
    const ended = liveSpeech;
    liveSpeech = null;
    bubbleEnded(ended);
  }, durationMs);
}

// opts as showSpeech, but prio defaults to 3 and kind to "status"
function showTyping(durationMs, opts) {
  const prio = opts && opts.prio != null ? opts.prio : 3;
  const kind = (opts && opts.kind) || "status";
  const sessionId = (opts && opts.sessionId) || "";
  const until = Date.now() + durationMs;
  if (kind === "status" && !(opts && opts.restoring) && !noteStatusBubble({ typing: true, until, prio, kind, sessionId })) return;
  const incumbent = usageCard ? deferredSpeech : liveSpeech;
  if (!bubbleWins(prio, kind, sessionId, incumbent)) return;
  if (usageCard) {
    deferredSpeech = { typing: true, until, prio, kind, sessionId };
    return;
  }
  const bubble = document.getElementById("pet-speech-bubble");
  const bubbleText = bubble ? bubble.querySelector(".bubble-text") : null;
  if (!bubble) return;
  if (speechTimer) {
    clearTimeout(speechTimer);
    speechTimer = null;
  }
  if (hiddenMode) {
    bubble.classList.remove("show-bubble");
    liveSpeech = null;
    return;
  }
  if (bubbleText) bubbleText.textContent = "";
  if (!bubble.querySelector(".bubble-typing")) {
    const typing = document.createElement("span");
    typing.className = "bubble-typing";
    typing.innerHTML = "<span></span><span></span><span></span>";
    bubble.appendChild(typing);
  }
  bubble.classList.add("show-bubble");
  liveSpeech = { typing: true, until, prio, kind, sessionId };
  speechTimer = setTimeout(() => {
    bubble.classList.remove("show-bubble");
    const t = bubble.querySelector(".bubble-typing");
    if (t) t.remove();
    speechTimer = null;
    const ended = liveSpeech;
    liveSpeech = null;
    bubbleEnded(ended);
  }, durationMs);
}

// ── Window position cache ──────────────────────────────────

let windowPosX = 0;
let windowPosY = 0;

async function initWindowPos() {
  try {
    if (window.ccPet) {
      const pos = await window.ccPet.getWindowPosition();
      windowPosX = pos[0];
      windowPosY = pos[1];
    }
  } catch (e) {
    /* ignore */
  }
}

function setPos(x, y) {
  windowPosX = x;
  windowPosY = y;
  if (window.ccPet) window.ccPet.setWindowPosition(Math.round(x), Math.round(y));
}

// ── Shared interaction state ───────────────────────────────

let menuOpen = false;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let winStartX = 0;
let winStartY = 0;
let lastDragX = 0;
let currentCCStatus = "idle";
let waitingBlinkTimer = null;
let isAlwaysOnTop = true;
let sleepStage = 0; // 0 awake · 1 dozing · 2 asleep (nightcap)
// A menu Nap: the user just used the mouse, so the idle-driven wake must not fire for a while.
// A click, a gesture or work still wakes the crab at once (they clear sleepStage themselves).
const NAP_MIN_MS = 5 * 60 * 1000;
let napUntil = 0;
let petting = false;
let sessionCount = 0; // concurrent Claude Code sessions (from main's sessions-update)

// The row for the current Claude Code status (the director decides; see statusRow)
function stateForStatus() {
  return director.statusRow();
}

function idleRow() {
  if (sleepStage === 2) return "sleep";
  if (sleepStage === 1) return "doze";
  if (hiddenMode) return "gaming"; // tucked away during a fullscreen app → headphones + gamepad
  return "idle";
}

// ── Usage: today's tokens + API-equivalent cost ───────────

// 1.5M, 2B (never "2.0B")
function formatTokens(n) {
  if (!n) return "0";
  const short = (v, unit) => v.toFixed(1).replace(/\.0$/, "") + unit;
  if (n >= 1e9) return short(n / 1e9, "B");
  if (n >= 1e6) return short(n / 1e6, "M");
  if (n >= 1e3) return short(n / 1e3, "K");
  return String(n);
}

const USAGE_LOADING = "Checking the books… 🦀";

async function showUsage(engine) {
  director.playOneShot("waving", { prio: 0, ms: 2600, restart: true, source: "click" });
  // A sticky bubble on screen (a permission request, typing dots) comes back when the card closes
  const resume = !usageCard && liveSpeech && liveSpeech.until > Date.now() ? liveSpeech : null;
  // P3 reaction: it covers a live P3 status bubble (typing, the idle reminder), a newer status
  // bubble arriving while the numbers load replaces it, as before, and an open P1 prompt keeps
  // the screen (the card still opens; openUsageCard defers whatever is on screen)
  if (!usageCard) showSpeech(USAGE_LOADING, 999999, { prio: 3, kind: "reaction" });
  try {
    const u = await window.ccPet.getUsage();
    if (!u || u.error) {
      showSpeech("Couldn't read today's usage 🤔", 3000);
    } else if (u.week && Array.isArray(u.week.days) && u.week.days.length === 7) {
      openUsageCard(u, resume);
    } else {
      const inTok = (u.inputTokens || 0) + (u.cacheCreationTokens || 0);
      const all = (u.models || []).map((m) => m.replace(/^claude-/, ""));
      const models = all.length > 2 ? `${all.slice(0, 2).join(", ")} +${all.length - 2}` : all.join(", ");
      const cost = typeof u.totalCost === "number" ? `Today ≈ $${u.totalCost.toFixed(2)}` : "Today (pricing unavailable)";
      showSpeech(
        `${cost}\nout ${formatTokens(u.outputTokens)} · in ${formatTokens(inTok)} · cache ${formatTokens(u.cacheReadTokens)}` +
          (models ? `\n${models}` : ""),
        8000,
      );
    }
  } catch (e) {
    showSpeech("The books are locked 😵", 3000);
  }
}

// ── Usage card: this week's cost curve over tokens per day ──
// Two small charts on one Mon–Sun axis (never two y-scales on one plot). Only the week's peak
// is labelled; hovering a day puts its numbers in the header. Speech bubbles that arrive while
// the card is up wait (deferredSpeech) and show once it closes.

const SVG_NS = "http://www.w3.org/2000/svg";
const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const UC = {
  w: 264, // plot width; the card adds 2×8px padding + 2×2px border
  h: 98,
  costTop: 12,
  costBase: 52,
  tokTop: 64,
  tokBase: 84,
  labelY: 96,
  barW: 12,
  showMs: 12000,
  afterHoverMs: 4000,
};
let usageCard = null; // { el, hideTimer }
let deferredSpeech = null; // newest bubble that arrived while the card was up

function svgEl(tag, attrs, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text != null) el.textContent = text;
  return el;
}

// 1, 2, 2.5, 5 × 10^k at or above v: the one gridline sits on a round number
function niceCeil(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p * 1.0000001) return m * p;
  return 10 * p;
}

function formatMoney(v) {
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatMoneyShort(v) {
  if (v >= 1e4) return "$" + Math.round(v / 1e3) + "K";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  if (v >= 10) return "$" + Math.round(v);
  return "$" + v.toFixed(2);
}

function dayLabel(day, i) {
  return `${DAY_ABBR[i]} ${Number(day.date.slice(8))}`;
}

function renderUsageCard(el, u) {
  const days = u.week.days;
  const firstFuture = days.findIndex((d) => d.future);
  const todayIdx = firstFuture === -1 ? 6 : Math.max(0, firstFuture - 1);
  const slot = UC.w / 7;
  const cx = (i) => slot * (i + 0.5);
  const past = days.slice(0, todayIdx + 1);
  // Headroom: the peak stays under ~85% of the top, so its label always fits above the dot
  const costMax = niceCeil(Math.max(...past.map((d) => d.cost || 0)) / 0.85);
  const tokMax = niceCeil(Math.max(...past.map((d) => d.tokens || 0)));
  const yCost = (v) => UC.costBase - ((v || 0) / costMax) * (UC.costBase - UC.costTop);
  const peakIdx = past.reduce((best, d, i) => ((d.cost || 0) > (past[best].cost || 0) ? i : best), 0);

  el.textContent = "";
  const head = document.createElement("div");
  head.className = "uc-head";
  const week = document.createElement("div");
  week.className = "uc-week";
  const label = document.createElement("span");
  label.className = "uc-label";
  label.textContent = "This week";
  const total = document.createElement("span");
  total.className = "uc-total";
  total.textContent = formatMoney(u.week.totalCost || 0);
  week.append(label, total);
  const focus = document.createElement("div");
  focus.className = "uc-focus";
  head.append(week, focus);

  const svg = svgEl("svg", { width: UC.w, height: UC.h, viewBox: `0 0 ${UC.w} ${UC.h}`, class: "uc-chart" });
  // One recessive gridline per panel, labelled with its round top value; it moves to the left
  // edge when the peak sits on the right, so the two labels never meet
  const gridAnchorLeft = peakIdx >= 4;
  const gridLabelX = gridAnchorLeft ? 0 : UC.w;
  const anchor = gridAnchorLeft ? "start" : "end";
  svg.append(
    svgEl("line", { x1: 0, x2: UC.w, y1: UC.costTop, y2: UC.costTop, class: "uc-grid" }),
    svgEl("line", { x1: 0, x2: UC.w, y1: UC.costBase, y2: UC.costBase, class: "uc-axis" }),
    svgEl("line", { x1: 0, x2: UC.w, y1: UC.tokTop, y2: UC.tokTop, class: "uc-grid" }),
    svgEl("line", { x1: 0, x2: UC.w, y1: UC.tokBase, y2: UC.tokBase, class: "uc-axis" }),
  );

  // Crosshair for the hovered day (drawn under the marks)
  const cross = svgEl("line", { x1: 0, x2: 0, y1: UC.costTop, y2: UC.tokBase, class: "uc-cross", visibility: "hidden" });
  svg.append(cross);

  // Tokens: thin columns rounded at the top, square on the baseline; today in the full hue
  past.forEach((d, i) => {
    if (!d.tokens) return;
    const h = Math.max(1.5, (d.tokens / tokMax) * (UC.tokBase - UC.tokTop));
    const x = cx(i) - UC.barW / 2;
    const r = Math.min(3, h, UC.barW / 2);
    const top = UC.tokBase - h;
    svg.append(
      svgEl("path", {
        d: `M${x},${UC.tokBase} V${top + r} Q${x},${top} ${x + r},${top} H${x + UC.barW - r} Q${x + UC.barW},${top} ${x + UC.barW},${top + r} V${UC.tokBase} Z`,
        class: i === todayIdx ? "uc-bar uc-today" : "uc-bar",
      }),
    );
  });

  // Cost: a wash under a 2px line through Mon→today, one ringed dot per day
  const pts = past.map((d, i) => [cx(i), yCost(d.cost)]);
  if (pts.length > 1) {
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    svg.append(
      svgEl("path", { d: `${line} L${pts[pts.length - 1][0].toFixed(1)},${UC.costBase} L${pts[0][0].toFixed(1)},${UC.costBase} Z`, class: "uc-area" }),
      svgEl("path", { d: line, class: "uc-line" }),
    );
  }
  pts.forEach(([x, y], i) => svg.append(svgEl("circle", { cx: x, cy: y, r: i === todayIdx ? 5 : 4, class: "uc-dot" })));
  if ((past[peakIdx].cost || 0) > 0) {
    const [px, py] = pts[peakIdx];
    const x = Math.min(UC.w - 14, Math.max(14, px));
    svg.append(svgEl("text", { x, y: Math.max(10, py - 8), "text-anchor": "middle", class: "uc-value" }, formatMoneyShort(past[peakIdx].cost)));
  }

  // Scale labels last, haloed (CSS), so no dot or line can cover them; a panel with no data
  // gets none rather than an invented "$1/day"
  if (past.some((d) => d.cost > 0)) {
    svg.append(svgEl("text", { x: gridLabelX, y: UC.costTop - 3, "text-anchor": anchor, class: "uc-tick" }, `${formatMoneyShort(costMax)}/day`));
  }
  if (past.some((d) => d.tokens > 0)) {
    svg.append(svgEl("text", { x: gridLabelX, y: UC.tokTop - 3, "text-anchor": anchor, class: "uc-tick" }, `${formatTokens(tokMax)} tok`));
  }

  // Day labels: today strong, days still to come muted
  days.forEach((d, i) => {
    const cls = i === todayIdx ? "uc-day uc-day-today" : d.future ? "uc-day uc-day-future" : "uc-day";
    svg.append(svgEl("text", { x: cx(i), y: UC.labelY, "text-anchor": "middle", class: cls }, DAY_ABBR[i]));
  });

  // Hover: the whole day column is the target; the header shows that day, the crosshair marks it
  const showDay = (i) => {
    const d = days[i];
    focus.textContent = d.future
      ? `${dayLabel(d, i)} · not yet`
      : `${i === todayIdx ? "Today" : dayLabel(d, i)} · ${formatMoney(d.cost || 0)} · ${formatTokens(d.tokens || 0)} tok`;
    cross.setAttribute("x1", cx(i));
    cross.setAttribute("x2", cx(i));
  };
  days.forEach((d, i) => {
    const hit = svgEl("rect", { x: i * slot, y: 0, width: slot, height: UC.h, class: "uc-hit" });
    hit.addEventListener("pointerenter", () => {
      showDay(i);
      cross.setAttribute("visibility", "visible");
    });
    svg.append(hit);
  });
  svg.addEventListener("pointerleave", () => {
    showDay(todayIdx);
    cross.setAttribute("visibility", "hidden");
  });
  showDay(todayIdx);

  el.append(head, svg);
  if (Array.isArray(u.unpriced) && u.unpriced.length) {
    const note = document.createElement("div");
    note.className = "uc-note";
    // One line whatever the count (the card must stay inside the window); full list on hover
    const names = u.unpriced.map((m) => String(m).replace(/^claude-/, ""));
    note.textContent = `⚠ ${names.length} model${names.length > 1 ? "s" : ""} not priced, counted as $0: ${names.join(", ")}`;
    note.title = names.join(", ");
    el.append(note);
  }
  el.setAttribute(
    "aria-label",
    `This week ${formatMoney(u.week.totalCost || 0)}; ` +
      past.map((d, i) => `${DAY_ABBR[i]} ${formatMoney(d.cost || 0)}, ${formatTokens(d.tokens || 0)} tokens`).join("; "),
  );
}

function scheduleUsageCardHide(ms) {
  if (!usageCard) return;
  clearTimeout(usageCard.hideTimer);
  usageCard.hideTimer = setTimeout(closeUsageCard, ms);
}

function openUsageCard(u, resume) {
  if (hiddenMode) return; // tucked away at the edge: nowhere to show it
  if (!usageCard) {
    // A status bubble that replaced "Checking the books…" while loading is newer than `resume`
    const newer = liveSpeech && liveSpeech.text !== USAGE_LOADING && liveSpeech.until > Date.now() ? liveSpeech : null;
    showSpeech("", 0);
    deferredSpeech = newer || resume || null;
    const el = document.createElement("div");
    el.id = "usage-card";
    el.setAttribute("role", "img");
    el.addEventListener("pointerenter", () => usageCard && clearTimeout(usageCard.hideTimer));
    el.addEventListener("pointerleave", () => scheduleUsageCardHide(UC.afterHoverMs));
    el.addEventListener("click", () => closeUsageCard());
    document.getElementById("pet-stage").appendChild(el);
    usageCard = { el, hideTimer: null };
  }
  try {
    renderUsageCard(usageCard.el, u);
  } catch (e) {
    console.warn("[CCPet] usage card failed:", e);
    closeUsageCard();
    showSpeech(`This week ≈ ${formatMoney((u.week && u.week.totalCost) || 0)}`, 5000);
    return;
  }
  scheduleUsageCardHide(UC.showMs);
}

function closeUsageCard() {
  if (!usageCard) return;
  clearTimeout(usageCard.hideTimer);
  usageCard.el.remove();
  usageCard = null;
  const d = deferredSpeech;
  deferredSpeech = null;
  const now = Date.now();
  if (d && d.until > now && d.kind !== "status") {
    // A reaction / other bubble keeps its own priority; the status bubble comes back after it
    const o = { prio: d.prio != null ? d.prio : 0, kind: d.kind || "other", sessionId: d.sessionId };
    if (d.typing) showTyping(d.until - now, o);
    else showSpeech(d.text, d.until - now, o);
  } else {
    // A status bubble: statusBubble is the newest accepted one, with its priority and session
    restoreStatusBubble();
  }
}

// ── Roaming: walk the bottom edge, climb walls, fall, tuck away ──

const WIN_W = 300;
const WIN_H = 280;

let engineRef = null;
let roamEnabled = !IS_DEV; // the dev instance stays put unless a scenario turns roaming on
let strollTimer = null;
let moveTimer = null;
let moveResolve = null;
let restTimer = null;
let restResolve = null;
let climbSide = null; // "left" | "right" | null
let lastWorkArea = null;
let hiddenMode = false; // tucked half off-screen, click-through
let manualHide = false;

async function workArea() {
  try {
    lastWorkArea = await window.ccPet.getWorkArea();
  } catch (e) {
    /* keep last */
  }
  return lastWorkArea;
}

function groundYOf(wa) {
  return wa.y + wa.height - WIN_H;
}

function clearClimb() {
  if (!climbSide) return;
  const c = document.getElementById("pet-container");
  if (c) c.classList.remove("climb-left", "climb-right");
  climbSide = null;
  renderOverlays(); // emotes leave the top anchor / counter-rotation with the climb
}

// ── Movement kinds ──
// Every mover sets moveKind when it starts; it is cleared when the move ends. Cancellable moves
// give way to hooks and gestures (cancelStroll); must-finish moves (in the air) always land,
// and only a drag interrupts them (through the isDragging checks inside their loops).
const CANCELLABLE_MOVES = new Set(["stroll", "shuffle", "climb", "ride", "steal", "hide"]);
const MUST_FINISH_MOVES = new Set(["fling", "fall", "hop"]);
let moveKind = null;

function isMustFinish() {
  return MUST_FINISH_MOVES.has(moveKind);
}
function isCancellableMove() {
  return CANCELLABLE_MOVES.has(moveKind) && !!(moveTimer || restTimer);
}
// Walking rows (a trot counts): what an interrupted walk must not be left showing
function isWalkAnim(name) {
  return name === "running-right" || name === "running-left" || name === "trot" || name === "trot-stop";
}

// Stops any walk/climb/fall/rest in progress; pending promises resolve false.
function stopMovement() {
  moveKind = null;
  if (moveTimer) {
    clearInterval(moveTimer);
    moveTimer = null;
  }
  if (moveResolve) {
    const r = moveResolve;
    moveResolve = null;
    r(false);
  }
  if (restTimer) {
    clearTimeout(restTimer);
    restTimer = null;
  }
  if (restResolve) {
    const r = restResolve;
    restResolve = null;
    r(false);
  }
}

function moveWindow(targetX, targetY, speed, kind = "stroll") {
  return new Promise((resolve) => {
    stopMovement();
    moveKind = kind;
    moveResolve = resolve;
    moveTimer = setInterval(() => {
      if (isDragging || menuOpen) {
        stopMovement();
        return;
      }
      const dx = targetX - windowPosX;
      const dy = targetY - windowPosY;
      const dist = Math.hypot(dx, dy);
      if (dist <= speed) {
        setPos(targetX, targetY);
        clearInterval(moveTimer);
        moveTimer = null;
        moveResolve = null;
        moveKind = null;
        resolve(true);
        return;
      }
      setPos(windowPosX + (dx / dist) * speed, windowPosY + (dy / dist) * speed);
      trackFootprints((dx / dist) * speed);
    }, 33);
  });
}

// ── Muddy footprints while walking on the ground ──────────

function isMuddy() {
  return mischiefEnabled && (muddyStroll || Date.now() < muddyUntil);
}

function trackFootprints(stepX) {
  if (!isMuddy() || hiddenMode || climbSide || perched || !lastWorkArea) return;
  if (Math.abs(windowPosY - groundYOf(lastWorkArea)) > 3) return; // only on the floor
  if (engineRef && engineRef.currentState === "trot" && engineRef.has("trot")) return; // trot prints per step (trotFootprint)
  footprintAcc += Math.abs(stepX);
  if (footprintAcc < 26) return;
  footprintAcc = 0;
  dropFootprint(stepX >= 0 ? 1 : -1);
}

function dropFootprint(dir) {
  footprintTone = 1 - footprintTone;
  const footX = windowPosX + WIN_W / 2 - dir * 10 + (footprintTone ? 14 : -14);
  const footY = windowPosY + WIN_H - FEET_OFFSET;
  if (window.ccPet && window.ccPet.footprint) window.ccPet.footprint({ x: footX, y: footY, dir, tone: footprintTone });
}

// A trot plants a foot on loop frames 3 and 5 (220 ms apart), so its prints follow the
// 440 ms cycle instead of the distance walked
function trotFootprint(flip) {
  if (!moveTimer || moveKind !== "stroll" || !isMuddy() || hiddenMode || climbSide || perched || !lastWorkArea) return;
  if (Math.abs(windowPosY - groundYOf(lastWorkArea)) > 3) return;
  dropFootprint(flip ? -1 : 1);
}

// ── Throw physics: fling, bounce off the edges, tumble, land dizzy ──

// Flings inside FLING_WINDOW_MS, drag and menu alike. The 3rd makes the landing furious (D6);
// after it, more DRAG flings are refused until the window runs out (D7).
let flingTimes = [];
let flingThirdAt = 0;

function flingRefused() {
  return !!flingThirdAt && Date.now() - flingThirdAt < FLING_WINDOW_MS;
}

// Counts a fling; true when this one lands furious
function noteFling() {
  const now = Date.now();
  if (flingThirdAt && now - flingThirdAt >= FLING_WINDOW_MS) {
    flingThirdAt = 0;
    flingTimes = [];
  }
  if (flingThirdAt) return true; // a menu fling while drag flings are refused: still furious
  flingTimes = flingTimes.filter((t) => now - t < FLING_WINDOW_MS);
  flingTimes.push(now);
  if (flingTimes.length >= 3) {
    flingThirdAt = now;
    flingTimes = [];
    return true;
  }
  return false;
}

function fling(vx, vy) {
  return new Promise(async (resolve) => {
    const wa = await workArea();
    if (!wa) {
      resolve(false);
      return;
    }
    const groundY = groundYOf(wa);
    const minX = wa.x;
    const maxX = wa.x + wa.width - WIN_W;
    const minY = wa.y;
    stopMovement();
    clearClimb();
    perched = null;
    director.interrupt();
    moveKind = "fling"; // must-finish: only a drag stops it
    const furious = noteFling();
    muddyUntil = Date.now() + 60000; // tumbling gets you dirty
    engineRef.applyState("backflip", { restart: true });
    showSpeech("Wheee!", 900);

    let x = windowPosX;
    let y = windowPosY;
    const cap = 42; // px per frame
    let vX = Math.max(-cap, Math.min(cap, vx / 60));
    let vY = Math.max(-cap, Math.min(cap, vy / 60));
    const g = 0.9;
    let bounces = 0;
    moveResolve = resolve;
    moveTimer = setInterval(() => {
      if (isDragging) {
        stopMovement();
        return;
      }
      vY += g;
      x += vX;
      y += vY;
      if (x < minX) {
        x = minX;
        vX = -vX * 0.65;
      } else if (x > maxX) {
        x = maxX;
        vX = -vX * 0.65;
      }
      if (y < minY) {
        y = minY;
        vY = -vY * 0.5;
      }
      if (y >= groundY) {
        y = groundY;
        if (Math.abs(vY) > 3.5 && bounces < 3) {
          vY = -vY * 0.45;
          vX *= 0.75;
          bounces++;
        } else {
          vY = 0;
          vX *= 0.9; // roll to a stop
          if (Math.abs(vX) < 0.35) {
            setPos(x, y);
            clearInterval(moveTimer);
            moveTimer = null;
            moveResolve = null;
            moveKind = null;
            landDizzy(furious);
            resolve(true);
            return;
          }
        }
      }
      setPos(x, y);
      if (y === groundY) trackFootprints(vX);
    }, 16);
  });
}

// D5: dizzy for two loops; D6 (3rd fling in 2 min): dizzy once, then furious for two loops.
// Either way the stage shakes on touchdown and the status row (or a queued reaction) follows.
function landDizzy(furious) {
  shake();
  let ms;
  if (furious) {
    const dizzyMs = engineRef.durationOf("dizzy", 1);
    ms = dizzyMs + engineRef.durationOf("furious", 2);
    director.playOneShot("dizzy", {
      prio: 0,
      loops: 1,
      restart: true,
      source: "land",
      then: () =>
        director.playOneShot("furious", {
          prio: 0,
          loops: 2,
          restart: true,
          source: "land",
          shake: true,
          bubble: { text: "HEY! Enough!" },
        }),
    });
  } else {
    ms = engineRef.durationOf("dizzy", 2);
    director.playOneShot("dizzy", { prio: 0, loops: 2, restart: true, source: "land", bubble: { text: "Whoa… 😵", ms: 1800 } });
  }
  setTimeout(scheduleStroll, Math.max(1800, ms));
}

// ── Perching on a window's title bar ────────────────────────

function pickPerchTarget(wa) {
  const groundY = groundYOf(wa);
  const cands = [];
  if (windowsInfo.claude) cands.push({ win: windowsInfo.claude, source: "claude" });
  if (windowsInfo.fg && !windowsInfo.fg.fullscreen) cands.push({ win: windowsInfo.fg, source: "fg" });
  for (const c of cands) {
    const w = c.win;
    if (!w || w.w < 360 || w.h < 160) continue;
    if (w.y < wa.y + PERCH_MIN_TOP) continue; // no room to stand on top
    if (w.y > groundY) continue; // top edge below the floor line — nothing to climb
    if (w.x + w.w < wa.x + 80 || w.x > wa.x + wa.width - 80) continue;
    return c;
  }
  return null;
}

function perchTopY(win) {
  return win.y + FEET_OFFSET - WIN_H; // feet exactly on the top edge
}

async function perchOn(target, wa) {
  const w = target.win;
  const groundY = groundYOf(wa);
  const minX = wa.x;
  const maxX = wa.x + wa.width - WIN_W;
  // Climb the side that is nearer, if the pet window fits beside it
  const leftSideX = w.x - WIN_W;
  const rightSideX = w.x + w.w;
  const leftOk = leftSideX >= minX - WIN_W / 2;
  const rightOk = rightSideX <= maxX + WIN_W / 2;
  let side;
  if (leftOk && rightOk) side = Math.abs(leftSideX - windowPosX) <= Math.abs(rightSideX - windowPosX) ? "left" : "right";
  else if (leftOk) side = "left";
  else if (rightOk) side = "right";
  else return false;
  const sideX = Math.round(Math.min(maxX, Math.max(minX, side === "left" ? leftSideX : rightSideX)));

  engineRef.applyState(sideX > windowPosX ? "running-right" : "running-left");
  if (!(await moveWindow(sideX, groundY, 2.6, "stroll"))) return false;

  // Cling to the window's side and climb to its top corner
  const c = document.getElementById("pet-container");
  climbSide = side === "left" ? "right" : "left"; // feet face the window
  if (c) c.classList.add(climbSide === "right" ? "climb-right" : "climb-left");
  renderOverlays();
  engineRef.applyState("running-right");
  const cornerY = w.y - WIN_H + 90;
  if (!(await moveWindow(sideX, Math.max(wa.y, cornerY), 2.2, "climb"))) return false;

  // Hop onto the top edge (must-finish: nothing but a drag stops it mid-air)
  clearClimb();
  engineRef.applyState("jumping");
  const standX = Math.round(Math.min(maxX, Math.max(minX, side === "left" ? w.x + 24 : w.x + w.w - WIN_W - 24)));
  if (!(await moveWindow(standX, perchTopY(w), 7, "hop"))) return false;
  perched = { hwnd: w.hwnd, source: target.source, win: w, until: Date.now() + 20000 + Math.random() * 40000 };
  director.statusDirty = false;
  director.afterPlay(); // a reaction queued during the hop, else the status row
  showSpeech(target.source === "claude" ? "Nice view from up here 🦀" : "Mind if I sit here?", 2500, { prio: 4 });
  schedulePerchTick();
  return true;
}

let perchTimer = null;
function schedulePerchTick() {
  if (perchTimer) clearTimeout(perchTimer);
  perchTimer = setTimeout(perchTick, 4000 + Math.random() * 6000);
}

async function perchTick() {
  perchTimer = null;
  if (!perched) return;
  if (isDragging || menuOpen || hiddenMode) {
    schedulePerchTick();
    return;
  }
  if (Date.now() > perched.until) {
    await leavePerch();
    return;
  }
  // Shuffle along the title bar while idle
  if (currentCCStatus === "idle" && !moveTimer && Math.random() < 0.5) {
    const w = perched.win;
    const lo = w.x + 10;
    const hi = w.x + w.w - WIN_W - 10;
    if (hi > lo) {
      const tx = Math.round(lo + Math.random() * (hi - lo));
      engineRef.applyState(tx > windowPosX ? "running-right" : "running-left");
      await moveWindow(tx, perchTopY(w), 1.8, "shuffle");
      if (perched && isWalkAnim(engineRef.currentState)) director.requestStatusRow();
    }
  }
  schedulePerchTick();
}

async function leavePerch() {
  if (!perched) return;
  perched = null;
  if (perchTimer) {
    clearTimeout(perchTimer);
    perchTimer = null;
  }
  const wa = lastWorkArea || (await workArea());
  if (wa && windowPosY < groundYOf(wa) - 4) await fallToGround(groundYOf(wa));
  scheduleStroll();
}

function leavePerchSilently() {
  perched = null;
  if (perchTimer) {
    clearTimeout(perchTimer);
    perchTimer = null;
  }
}

// Keep riding the window if it moves; bail out if it vanishes or loses focus
function handleWindowsUpdate(data) {
  windowsInfo = data || { fg: null, claude: null };
  if (!perched) return;
  let w = null;
  if (windowsInfo.claude && windowsInfo.claude.hwnd === perched.hwnd) w = windowsInfo.claude;
  else if (windowsInfo.fg && windowsInfo.fg.hwnd === perched.hwnd) w = windowsInfo.fg;
  if (!w) {
    if (perched.source === "claude" || Date.now() - (perched.lastSeen || Date.now()) > 3000) leavePerch();
    else perched.lastSeen = perched.lastSeen || Date.now();
    return;
  }
  perched.lastSeen = Date.now();
  const moved = Math.abs(w.y - perched.win.y) > 2 || Math.abs(w.x - perched.win.x) > 2 || Math.abs(w.w - perched.win.w) > 2;
  perched.win = w;
  if (moved && !isDragging && !moveTimer) {
    const nx = Math.round(Math.min(w.x + w.w - WIN_W - 10, Math.max(w.x + 10, windowPosX)));
    moveWindow(nx, perchTopY(w), 9, "ride").then((ok) => {
      if (ok && perched) director.requestStatusRow();
    });
  }
}

// ── Stealing the cursor ─────────────────────────────────────

// D13: rub the claws for 1.5 s first; the cursor wandering more than 170 px away calls it off
async function plotSteal(cur0) {
  engineRef.applyState("plotting", { restart: true });
  showSpeech("Hehehe…", 1500, { prio: 4 });
  const t0 = Date.now();
  while (Date.now() - t0 < 1500) {
    if (!(await rest(250, "steal"))) return null; // a drag, the menu or a hook got in the way
    let now;
    try {
      now = await window.ccPet.getCursor();
    } catch (e) {
      continue;
    }
    if (Math.hypot(now.x - cur0.x, now.y - cur0.y) > STEAL_REACH_PX) {
      showEmote("note", { prio: 4 });
      showSpeech("…nothing.", 1800, { prio: 4 });
      return null;
    }
  }
  try {
    return await window.ccPet.getCursor();
  } catch (e) {
    return cur0;
  }
}

async function stealCursor(manual = false) {
  if (stealing || hiddenMode || isDragging || sleepStage) return false;
  if (IS_DEV && !mischiefEnabled) {
    // The dev instance never moves the real cursor unless a scenario switched mischief on
    if (manual) showSpeech("Mischief is off (dev)", 2000);
    return false;
  }
  const wa = await workArea();
  if (!wa) return false;
  let cur;
  try {
    cur = await window.ccPet.getCursor();
  } catch (e) {
    return false;
  }
  const groundY = groundYOf(wa);
  const clawY = groundY + WIN_H - FEET_OFFSET - 62; // roughly where a raised claw is
  const reachable = cur.y > clawY - STEAL_REACH_PX && cur.y < groundY + WIN_H && cur.x >= wa.x && cur.x <= wa.x + wa.width;
  if (!reachable) {
    if (manual) showSpeech("Can't reach it up there 🦀", 2200);
    return false;
  }
  stealing = true;
  lastStealAt = Date.now();
  perched = null;
  cancelStroll(false);
  clearClimb();
  director.interrupt();
  try {
    if (windowPosY < groundY - 4) await fallToGround(groundY);
    if (!stealing || isDragging) return false;
    cur = await plotSteal(cur);
    if (!cur) return false;
    const minX = wa.x;
    const maxX = wa.x + wa.width - WIN_W;
    const underX = Math.round(Math.min(maxX, Math.max(minX, cur.x - WIN_W / 2 - 12)));
    engineRef.applyState(underX > windowPosX ? "running-right" : "running-left");
    if (!(await moveWindow(underX, groundY, 3.2, "steal"))) return false;

    // Grab it
    engineRef.applyState("waving");
    showSpeech("Mine now 🦀", 1400, { prio: 4 });
    window.ccPet.setCursor(windowPosX + WIN_W / 2 + 12, clawY);
    if (!(await rest(700, "steal"))) return false;

    // Run off with it, dropping muddy prints
    muddyUntil = Date.now() + 15000;
    const dir = windowPosX - minX > maxX - windowPosX ? -1 : 1;
    const dist = 180 + Math.random() * 180;
    const tx = Math.round(Math.min(maxX, Math.max(minX, windowPosX + dir * dist)));
    engineRef.applyState(dir > 0 ? "running-right" : "running-left");
    let lastSet = null;
    let tick = 0;
    const ok = await new Promise((resolve) => {
      stopMovement();
      moveKind = "steal";
      moveResolve = resolve;
      moveTimer = setInterval(async () => {
        if (isDragging || menuOpen) {
          stopMovement();
          return;
        }
        const step = 2.6 * dir;
        const nx = dir > 0 ? Math.min(tx, windowPosX + step) : Math.max(tx, windowPosX + step);
        setPos(nx, groundY);
        trackFootprints(step);
        const cx = nx + WIN_W / 2 + 12;
        // Did the user grab the mouse back? Then let go immediately.
        if (lastSet && tick % 4 === 0) {
          try {
            const now = await window.ccPet.getCursor();
            if (Math.abs(now.x - lastSet.x) > 8 || Math.abs(now.y - lastSet.y) > 8) {
              stopMovement();
              return;
            }
          } catch (e) {
            /* ignore */
          }
        }
        lastSet = { x: Math.round(cx), y: Math.round(clawY) };
        window.ccPet.setCursor(cx, clawY);
        tick++;
        if (nx === tx) {
          clearInterval(moveTimer);
          moveTimer = null;
          moveResolve = null;
          moveKind = null;
          resolve(true);
        }
      }, 33);
    });
    if (ok) {
      engineRef.applyState("backflip");
      showSpeech("Hehe 😈", 1600, { prio: 4 });
      await rest(1100, "steal");
    } else if (!isDragging && !menuOpen) {
      // D14: caught (the user took the mouse back)
      director.playOneShot("busted", {
        prio: 0,
        restart: true,
        source: "steal",
        bubble: { text: "Heh… just borrowing it.", ms: 2200 },
      });
      await rest(Math.max(1100, engineRef.durationOf("busted")), "steal");
    }
    return ok;
  } finally {
    stealing = false;
    if (engineRef && ["backflip", "waiting", "busted", "plotting"].includes(engineRef.currentState)) {
      director.requestStatusRow();
    }
    director.flagCleared();
    scheduleStroll();
  }
}

function maybeStealCursor(engine, idleSeconds) {
  if (!mischiefEnabled || stealing || hiddenMode || sleepStage || currentCCStatus !== "idle") return;
  if (idleSeconds < 25 || idleSeconds > 120) return; // a short pause, not a full walk-away
  if (Date.now() - lastStealAt < STEAL_COOLDOWN_MS) return;
  if (moveTimer || climbSide || perched) return;
  if (Math.random() < 0.6) return; // don't do it at every opportunity
  lastStealAt = Date.now();
  stealCursor(false);
}

function rest(ms, kind = "stroll") {
  return new Promise((resolve) => {
    stopMovement();
    moveKind = kind;
    restResolve = resolve;
    restTimer = setTimeout(() => {
      restTimer = null;
      restResolve = null;
      moveKind = null;
      resolve(true);
    }, ms);
  });
}

// D4: `fall` while the window drops (the sprite itself has no vertical offset), `hop-land` on
// touchdown. The whole thing is a must-finish move; it resolves once the landing is over, then
// (unless the caller moves on at once) the director plays a queued reaction or the status row.
function fallToGround(groundY) {
  return new Promise((resolve) => {
    stopMovement();
    moveKind = "fall";
    engineRef.applyState("fall", { restart: true });
    moveResolve = resolve;
    let vy = 2;
    moveTimer = setInterval(() => {
      if (isDragging) {
        stopMovement();
        return;
      }
      vy = Math.min(vy + 1.3, 16);
      const ny = windowPosY + vy;
      if (ny >= groundY) {
        setPos(windowPosX, groundY);
        clearInterval(moveTimer);
        engineRef.applyState("hop-land", { restart: true });
        moveTimer = setTimeout(() => {
          moveTimer = null;
          moveResolve = null;
          moveKind = null;
          if (isDragging) {
            resolve(false); // grabbed again during the landing
            return;
          }
          resolve(true);
          // A caller that walks on right away owns the row; otherwise the landing hands over
          setTimeout(() => {
            if (!moveTimer && !restTimer && !isDragging) director.onLanded();
          }, 0);
        }, engineRef.durationOf("hop-land"));
        return;
      }
      setPos(windowPosX, ny);
    }, 25);
  });
}

// Stops a cancellable move (stroll, shuffle, climb, ride, steal, hide walk). In the air (fling,
// fall, perch hop) it only drops a pending stroll: the crab always lands first.
function cancelStroll(revertToIdle = true) {
  if (hiddenMode) return; // clinging to the edge is not a stroll — never interrupt it
  if (strollTimer) {
    clearTimeout(strollTimer);
    strollTimer = null;
  }
  if (isMustFinish()) return;
  const wasMoving = !!moveTimer;
  stopMovement();
  const wasClimbing = !!climbSide;
  clearClimb();
  if (wasClimbing && lastWorkArea && !isDragging) {
    fallToGround(groundYOf(lastWorkArea)); // lost grip → drop to the floor
    return;
  }
  if (revertToIdle && wasMoving && engineRef && isWalkAnim(engineRef.currentState)) {
    engineRef.applyState("idle");
  }
}

function isMuddyRoll() {
  return mischiefEnabled && Math.random() < 0.35;
}

function scheduleStroll(delay) {
  muddyStroll = false;
  footprintAcc = 0;
  if (!roamEnabled || hiddenMode || perched) return;
  if (strollTimer) clearTimeout(strollTimer);
  if (moveTimer || restTimer) return; // already busy
  strollTimer = setTimeout(attemptStroll, delay == null ? 6000 + Math.random() * 14000 : delay);
}

async function playFor(anim, ms, opts) {
  engineRef.applyState(anim, opts);
  const ok = await rest(ms, "stroll");
  if (ok && engineRef.currentState === anim) engineRef.applyState("idle");
  return ok;
}

async function climbWall(side, wa) {
  const c = document.getElementById("pet-container");
  climbSide = side;
  if (c) c.classList.add(side === "left" ? "climb-left" : "climb-right");
  renderOverlays();
  engineRef.applyState(side === "right" ? "running-right" : "running-left");

  const groundY = groundYOf(wa);
  const maxUp = Math.max(80, Math.min(groundY - wa.y - 20, 520));
  const targetY = groundY - (60 + Math.random() * (maxUp - 60));
  if (!(await moveWindow(windowPosX, targetY, 2, "climb"))) return;

  engineRef.applyState("idle"); // hang out on the wall for a bit
  if (!(await rest(3000 + Math.random() * 5000, "climb"))) return;

  engineRef.applyState(side === "right" ? "running-left" : "running-right");
  if (!(await moveWindow(windowPosX, groundY, 2.6, "climb"))) return;

  clearClimb();
  engineRef.applyState("idle");
}

// 23:30-04:00 by the local clock (or the /debug/date fake clock)
function isNight() {
  const d = nowDate();
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= 23 * 60 + 30 || m < 4 * 60;
}

async function attemptStroll() {
  strollTimer = null;
  if (!roamEnabled || hiddenMode || sleepStage || petting) return;
  // stay put under the card, and never walk off in the middle of a play (a menu trick, a yawn)
  const busy = isDragging || menuOpen || usageCard || currentCCStatus !== "idle" || director.liveActive();
  const stateOk = engineRef && (engineRef.currentState === "idle" || engineRef.currentState === "review");
  if (busy || !stateOk) {
    scheduleStroll(8000);
    return;
  }

  const wa = await workArea();
  if (!wa) {
    scheduleStroll(20000);
    return;
  }
  const groundY = groundYOf(wa);
  if (windowPosY < groundY - 4) {
    if (!(await fallToGround(groundY))) return;
  } else if (windowPosY !== groundY) {
    setPos(windowPosX, groundY);
  }

  // D17: late at night, some rolls are just a yawn
  if (isNight() && Math.random() < 0.1 && cooldownOk("yawn", YAWN_COOLDOWN_MS)) {
    markCooldown("yawn");
    await playFor("yawn", engineRef.durationOf("yawn"));
    scheduleStroll();
    return;
  }

  const roll = Math.random();
  if (roll < 0.1) {
    await playFor("flower", 4500); // smell the flowers
    scheduleStroll();
    return;
  }
  if (roll < 0.22) {
    await playFor(pickSnack(new Date().getHours()), 5200); // snack / drink
    scheduleStroll();
    return;
  }
  if (roll < 0.3) {
    await playFor("phone", 6000); // doomscrolling
    scheduleStroll();
    return;
  }
  if (roll < 0.35) {
    await playFor("backflip", 1100); // show-off
    scheduleStroll();
    return;
  }
  if (roll < 0.47) {
    const target = pickPerchTarget(wa); // climb up and sit on a window's title bar
    if (target) {
      muddyStroll = isMuddyRoll();
      const ok = await perchOn(target, wa);
      if (!ok) {
        clearClimb();
        if (windowPosY < groundY - 4) await fallToGround(groundY);
        if (isWalkAnim(engineRef.currentState) || engineRef.currentState === "jumping") director.requestStatusRow();
        scheduleStroll(8000);
      }
      return; // perchTick / leavePerch take it from here
    }
  }
  muddyStroll = isMuddyRoll();

  const minX = wa.x;
  const maxX = wa.x + wa.width - WIN_W;
  let climb = null;
  let targetX;
  if (roll < 0.55) {
    climb = windowPosX - minX < maxX - windowPosX ? "left" : "right";
    if (Math.random() < 0.3) climb = climb === "left" ? "right" : "left";
    targetX = climb === "left" ? minX : maxX;
  } else {
    targetX = minX + Math.random() * (maxX - minX);
    if (Math.abs(targetX - windowPosX) < 80) targetX = windowPosX + (targetX >= windowPosX ? 120 : -120);
    targetX = Math.round(Math.min(maxX, Math.max(minX, targetX)));
  }

  const dir = targetX > windowPosX ? 1 : -1;
  // D12: a long stroll that isn't heading for a wall trots side-on (flipped when going left)
  const trot = !climb && Math.abs(targetX - windowPosX) >= TROT_MIN_PX && engineRef.has("trot");
  if (!trot && engineRef.builtIn && engineRef.has("look")) {
    // D11: the eyes lead the walk by a beat
    engineRef.peek("look", dir > 0 ? 3 : 1);
    const looked = await rest(250, "stroll");
    engineRef.unpeek();
    if (!looked) {
      scheduleStroll(10000);
      return;
    }
  }
  if (trot) engineRef.applyState("trot", { flip: dir < 0 });
  else engineRef.applyState(dir > 0 ? "running-right" : "running-left");
  const ok = await moveWindow(targetX, groundY, 2.4, "stroll");
  if (!ok) {
    // Interrupted (right-click, drag, a hook): never leave it walking on the spot
    if (isWalkAnim(engineRef.currentState)) engineRef.applyState(stateForStatus());
    scheduleStroll(10000);
    return;
  }
  if (climb) {
    await climbWall(climb, wa);
    scheduleStroll();
    return;
  }
  if (trot && !(await playFor("trot-stop", engineRef.durationOf("trot-stop", 1, dir < 0), { flip: dir < 0 }))) {
    if (isWalkAnim(engineRef.currentState)) engineRef.applyState(stateForStatus());
    scheduleStroll(10000);
    return;
  }
  engineRef.applyState("idle");
  scheduleStroll();
}

// Tuck half off the right edge and become click-through (fullscreen apps / manual)
// Hide at the right edge: walk over, climb the wall a little, then slide the lower
// half of the body past the screen edge so only the head peeks in (click-through).
async function enterHide() {
  if (hiddenMode) return;
  const wa = await workArea();
  if (!wa) return;
  const wasClimbing = !!climbSide;
  cancelStroll(false); // still allowed to drop us here: hiddenMode isn't set yet
  closeUsageCard(); // a fullscreen app (slideshow, game) just came up: nothing stays on screen
  hiddenMode = true;
  renderOverlays(); // hats off, emotes on the top anchor
  director.interrupt();
  director.queue = null;
  showSpeech("", 0);
  const groundY = groundYOf(wa);
  const edgeX = wa.x + wa.width - WIN_W; // window flush with the right edge
  leavePerchSilently();
  if (windowPosY < groundY - 4) await fallToGround(groundY); // off a wall or a window? drop first
  if (!hiddenMode) return;

  engineRef.applyState(edgeX > windowPosX ? "running-right" : "running-left");
  await moveWindow(edgeX, groundY, 3, "hide");
  if (!hiddenMode) return;

  const c = document.getElementById("pet-container");
  climbSide = "right";
  if (c) c.classList.add("climb-right");
  renderOverlays();
  engineRef.applyState("running-right");
  await moveWindow(edgeX, groundY - HIDE_CLIMB_PX, 2, "hide"); // up the wall
  if (!hiddenMode) return;
  await moveWindow(edgeX + HIDE_PEEK_PX, groundY - HIDE_CLIMB_PX, 1.5, "hide"); // lower half off-screen
  if (!hiddenMode) return;
  engineRef.applyState(stateForStatus()); // gaming pose while idle
  window.ccPet.setIgnoreMouse(true);
}

async function exitHide() {
  if (!hiddenMode) return;
  hiddenMode = false;
  renderOverlays();
  window.ccPet.setIgnoreMouse(false);
  const wa = await workArea();
  if (!wa) return;
  const groundY = groundYOf(wa);
  const edgeX = wa.x + wa.width - WIN_W;
  if (climbSide) {
    engineRef.applyState("running-left");
    await moveWindow(edgeX, windowPosY, 1.5, "hide"); // slide back onto the screen
    await moveWindow(edgeX, groundY, 2.6, "hide"); // climb down
    clearClimb();
  }
  engineRef.applyState("running-left");
  await moveWindow(edgeX - 10, groundY, 3, "hide");
  director.requestStatusRow();
  scheduleStroll();
}

function toggleHide() {
  if (hiddenMode) {
    manualHide = false;
    exitHide();
  } else {
    manualHide = true;
    enterHide();
  }
}

function toggleRoam() {
  roamEnabled = !roamEnabled;
  if (!roamEnabled) {
    cancelStroll();
  } else {
    scheduleStroll(2000);
  }
  showSpeech(roamEnabled ? "Off for a stroll~" : "Staying put.", 2000);
}

function setupRoaming(engine) {
  engineRef = engine;
  scheduleStroll(5000);
}

// ── Drag / click / hover / context menu ────────────────────

// Speed of the pointer over the last 120 ms of a drag, px/s
function dragSpeed(now) {
  const recent = dragSamples.filter((s) => now - s.t < 120);
  if (recent.length < 2) return { vx: 0, vy: 0, speed: 0 };
  const a = recent[0];
  const b = recent[recent.length - 1];
  const dt = Math.max(16, b.t - a.t) / 1000;
  const vx = (b.x - a.x) / dt;
  const vy = (b.y - a.y) / dt;
  return { vx, vy, speed: Math.hypot(vx, vy) };
}

function setupDrag(engine) {
  const hitbox = document.getElementById("pet-hitbox");
  const container = document.getElementById("pet-container");
  if (!hitbox) return;

  // D1: a press only becomes a carried crab (dangle) after 4 px of movement or 150 ms held, so a
  // plain click never flashes it; until then the current row stays. D2: dangle-scared while
  // swung fast or held near a side / the top of the screen, back to dangle after 400 ms of calm.
  let dangleTimer = null;
  let dangling = false;
  let scared = false;
  let calmSince = 0;
  let scaredWatch = null;
  let movedFar = false;
  let suppressClick = false; // the click that ends a real drag is not a click

  const updateScared = () => {
    if (!isDragging || !dangling) return;
    const now = performance.now();
    const wa = lastWorkArea;
    const nearEdge =
      !!wa &&
      (windowPosX < wa.x + SCARED_EDGE_PX || windowPosX + WIN_W > wa.x + wa.width - SCARED_EDGE_PX || windowPosY < wa.y + SCARED_EDGE_PX);
    if (dragSpeed(now).speed > SCARED_SPEED || nearEdge) {
      calmSince = 0;
      if (!scared) {
        scared = true;
        engine.applyState("dangle-scared");
      }
    } else {
      if (!calmSince) calmSince = now;
      if (scared && now - calmSince >= SCARED_CALM_MS) {
        scared = false;
        engine.applyState("dangle");
      }
    }
  };

  const startDangle = () => {
    clearTimeout(dangleTimer);
    dangleTimer = null;
    if (!isDragging || dangling) return;
    dangling = true;
    scared = false;
    calmSince = 0;
    director.interrupt(); // nothing queued from before the grab may land on top of it
    engine.applyState("dangle", { restart: true });
    clearInterval(scaredWatch);
    scaredWatch = setInterval(updateScared, 100);
  };

  const endDangle = () => {
    clearTimeout(dangleTimer);
    dangleTimer = null;
    clearInterval(scaredWatch);
    scaredWatch = null;
    const was = dangling;
    dangling = false;
    scared = false;
    return was;
  };

  hitbox.addEventListener("mousedown", (e) => {
    if (e.button === 2) return;
    stopPetting(engine, true);
    isDragging = true; // set first so cancelStroll doesn't trigger a fall mid-grab
    leavePerchSilently();
    dragSamples = [];
    cancelStroll(false); // in the air (fling / fall) the loop itself sees isDragging and stops
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    lastDragX = e.screenX;
    winStartX = windowPosX;
    winStartY = windowPosY;
    movedFar = false;
    suppressClick = false;
    document.body.style.cursor = "grabbing";
    e.preventDefault();
    endDangle();
    dangleTimer = setTimeout(startDangle, DANGLE_AFTER_MS);
    workArea(); // fresh screen edges for D2
    if (container) {
      container.classList.remove("is-dropping");
      container.classList.add("is-lifting");
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const newX = winStartX + (e.screenX - dragStartX);
    const newY = winStartY + (e.screenY - dragStartY);
    setPos(newX, newY);
    dragSamples.push({ t: performance.now(), x: e.screenX, y: e.screenY });
    if (dragSamples.length > 10) dragSamples.shift();
    if (!movedFar && Math.hypot(e.screenX - dragStartX, e.screenY - dragStartY) >= DANGLE_MOVE_PX) movedFar = true;
    if (movedFar && !dangling) startDangle();
    else updateScared();
    lastDragX = e.screenX;
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    const wasDangling = endDangle();
    suppressClick = movedFar;
    document.body.style.cursor = "";
    if (container) {
      container.classList.remove("is-lifting");
      container.classList.add("is-dropping");
    }
    // Release velocity from the last ~120 ms of drag → throw, else just drop
    const { vx, vy, speed } = dragSpeed(performance.now());
    dragSamples = [];
    if (speed > FLING_MIN_SPEED) {
      if (flingRefused()) {
        // D7: a 4th drag fling inside the 2 minutes after the 3rd is just a drop
        showEmote("anger", { ms: 2000, prio: 0 });
        showSpeech("Nope.", 1600);
        dropAfterRelease(container, true);
        return;
      }
      if (container) container.classList.remove("is-dropping");
      fling(vx, vy);
      return;
    }
    dropAfterRelease(container, wasDangling);
  });

  // D3: released slowly. In the air: fall, then hop-land, then the status row (fallToGround).
  // On the ground: hop-land, then the status row. A plain click changes nothing here.
  async function dropAfterRelease(el, carried) {
    setTimeout(() => el && el.classList.remove("is-dropping"), 500);
    const wa = await workArea();
    if (isDragging) return; // grabbed again already
    if (wa && windowPosY < groundYOf(wa) - 4) {
      await fallToGround(groundYOf(wa));
    } else if (carried) {
      director.playOneShot("hop-land", { prio: 0, restart: true, source: "drop" });
    } else {
      director.flagCleared();
    }
    scheduleStroll();
  }

  // Click → particles + today's usage
  // Single click → today's usage; double click → bring the Claude app to the front.
  // The first click is held for DBLCLICK_MS so a second one can cancel it.
  let clickTimer = null;
  hitbox.addEventListener("click", (e) => {
    if (e.button !== 0 || isDragging) return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    spawnParticles(e.clientX, e.clientY);
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      cancelStroll();
      openClaude(engine);
      return;
    }
    clickTimer = setTimeout(() => {
      clickTimer = null;
      cancelStroll();
      showUsage(engine);
    }, DBLCLICK_MS);
  });

  // Hover 1.2s → petting (happy face, hearts); hovering on → love (D8)
  hitbox.addEventListener("mouseenter", (e) => {
    if (!noteTickle(e, true)) startPettingTimer(engine);
  });
  hitbox.addEventListener("mouseleave", (e) => {
    noteTickle(e, true);
    stopPetting(engine, false);
  });
  hitbox.addEventListener("mousemove", (e) => noteTickle(e, false));

  // Right-click → native OS menu (never clipped by the tiny window)
  hitbox.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (isDragging) return;
    stopPetting(engine, true);
    menuOpen = true;
    window.ccPet.showMenu({
      roam: roamEnabled,
      hidden: hiddenMode,
      onTop: isAlwaysOnTop,
      mischief: mischiefEnabled,
      reactions: reactionsOn,
      customSkin: !engine.builtIn,
      // Wardrobe: the saved choice, the hats the sheet has; greyed for an imported skin
      hat: hatChoice,
      hats: wardrobeIds(),
      wardrobe: engine.builtIn && !!hatMeta() && !!OVERLAY,
    });
  });
}

// ── Petting ────────────────────────────────────────────────

let hoverTimer = null;
let heartTimer = null;
let loveTimer = null;

function petHearts() {
  const hb = document.getElementById("pet-hitbox");
  if (!hb) return;
  const r = hb.getBoundingClientRect();
  spawnParticles(r.left + r.width / 2 + (Math.random() - 0.5) * 30, r.top + 10, 0);
}

function startPettingTimer(engine) {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    hoverTimer = null;
    if (isDragging || menuOpen || moveTimer || climbSide || sleepStage || hiddenMode) return;
    if (currentCCStatus !== "idle") return;
    if (director.liveActive() && director.live.prio === 0) return; // a trick / tickle is playing
    petting = true;
    cancelStroll(false);
    director.interrupt();
    engine.applyState("petted");
    petHearts();
    heartTimer = setInterval(petHearts, 700);
    // D8: still being petted 6 s later → love, for as long as the cursor stays
    clearTimeout(loveTimer);
    loveTimer = setTimeout(() => {
      loveTimer = null;
      if (!petting || engine.currentState !== "petted") return;
      engine.applyState("love");
      clearInterval(heartTimer);
      heartTimer = setInterval(petHearts, 2600); // the row has its own hearts now
    }, LOVE_AFTER_MS);
  }, 1200);
}

function stopPetting(engine, immediate) {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  if (heartTimer) {
    clearInterval(heartTimer);
    heartTimer = null;
  }
  if (loveTimer) {
    clearTimeout(loveTimer);
    loveTimer = null;
  }
  if (!petting) return;
  petting = false;
  const done = () => {
    if (engine.currentState === "petted" || engine.currentState === "love") director.requestStatusRow();
    scheduleStroll();
  };
  if (immediate) done();
  else if (engine.currentState === "love") {
    // D8: the cursor left a loved-up crab: a last 600 ms of petted, then the status row
    engine.applyState("petted");
    setTimeout(done, 600);
  } else setTimeout(done, 400);
}

// D9: tickle = the cursor darting in and out of the crab (≥4 hover toggles within 1.5 s over
// more than 40 px of travel, no button held), on the ground, while idle or running
const tickle = { toggles: [], path: [], last: null };

// Returns true when this event set off a tickle
function noteTickle(e, toggle) {
  const now = performance.now();
  if (tickle.last) tickle.path.push({ t: now, d: Math.hypot(e.screenX - tickle.last.x, e.screenY - tickle.last.y) });
  tickle.last = { x: e.screenX, y: e.screenY };
  tickle.path = tickle.path.filter((p) => now - p.t <= TICKLE_WINDOW_MS);
  if (!toggle) return false;
  tickle.toggles.push(now);
  tickle.toggles = tickle.toggles.filter((t) => now - t <= TICKLE_WINDOW_MS);
  if (tickle.toggles.length < TICKLE_TOGGLES) return false;
  if (tickle.path.reduce((s, p) => s + p.d, 0) <= TICKLE_PATH_PX) return false;
  if (e.buttons) return false;
  if (isDragging || menuOpen || hiddenMode || climbSide || perched || stealing || sleepStage) return false;
  if (!lastWorkArea || Math.abs(windowPosY - groundYOf(lastWorkArea)) > 4) return false;
  if (currentCCStatus !== "idle" && currentCCStatus !== "running") return false;
  if (!cooldownOk("tickle", TICKLE_COOLDOWN_MS)) return false;
  markCooldown("tickle");
  tickle.toggles = [];
  tickle.path = [];
  if (hoverTimer) {
    clearTimeout(hoverTimer); // the tickle cancels the petting timer
    hoverTimer = null;
  }
  if (petting) stopPetting(engineRef, true);
  director.playOneShot("laugh", {
    prio: 0,
    ms: 1600,
    restart: true,
    source: "tickle",
    then: () => director.playOneShot("waving", { prio: 0, ms: 560, restart: true, source: "tickle" }),
  });
  return true;
}

// ── Import pet pack ────────────────────────────────────────

async function openImportDialog(engine) {
  try {
    showSpeech("Importing pet…", 3000);
    const manifest = await window.ccPet.importPetZip();
    if (!manifest) return;
    const petDir = await window.ccPet.getPetDir(manifest.id);
    const fileUrl = "file:///" + (petDir + "/" + manifest.spritesheetPath).replace(/\\/g, "/");
    await engine.setSpritesheet(fileUrl);
    window.ccPet.setCurrentPetId(manifest.id);
    director.playOneShot("waving", { prio: 0, ms: 3000, restart: true, source: "menu" });
    showSpeech(`Switched to ${manifest.displayName} 🎉`, 3000);
  } catch (e) {
    console.error("Import failed:", e);
    showSpeech("Import failed 😩", 3000);
  }
}

// ── Menu actions (native context menu + tray) ──────────────

// Menu Tricks are P0 plays: they replay when picked again, stop a stroll, wake the crab, and are
// dropped mid-air (fling / fall). `ms` = how long the row shows before the status row returns.
function trick(name, { ms, bubble, bubbleMs, then } = {}) {
  director.playOneShot(name, {
    prio: 0,
    restart: true,
    source: "menu",
    ms,
    then,
    bubble: bubble ? { text: bubble, ms: bubbleMs } : null,
  });
}

async function runMenuAction(engine, action) {
  if (action !== "usage") closeUsageCard(); // its confirmation bubble must show now, not after the card
  if (typeof action === "string" && action.startsWith("hat:")) {
    // Wardrobe: "auto" | "none" | a hat id, saved to pet-config.json {hat}
    const id = action.slice(4);
    if (id === "auto" || id === "none" || wardrobeIds().includes(id)) setHatChoice(id);
    return;
  }
  switch (action) {
    case "usage":
      showUsage(engine);
      break;
    case "toggle-roam":
      toggleRoam();
      break;
    case "toggle-hide":
      toggleHide();
      break;
    case "toggle-autostart": {
      try {
        const s = await window.ccPet.getAutoStart();
        if (!s.supported) {
          showSpeech("Only works in the packaged app", 2500);
          break;
        }
        const r = await window.ccPet.setAutoStart(!s.enabled);
        showSpeech(r.enabled ? "I'll be here at startup 🚀" : "Won't auto-start anymore", 2500);
      } catch (err) {
        showSpeech("Couldn't change that 😵", 2500);
      }
      break;
    }
    case "wave":
      trick("waving", { ms: 2500, bubble: "Hi there! 👋", bubbleMs: 2500 });
      break;
    case "jump":
      trick("jumping", { ms: 2000, bubble: "Yay! 🎉", bubbleMs: 2000 });
      break;
    case "think":
      trick("review", { ms: 3000, bubble: "Let me think… 🤔", bubbleMs: 3000 });
      break;
    case "flower":
      trick("flower", { ms: 4500, bubble: "For you 🌸", bubbleMs: 3000 });
      break;
    case "backflip":
      trick("backflip", { ms: 1100, bubble: "Ta-da! 🤸", bubbleMs: 2000 });
      break;
    case "snack": {
      const snack = pickSnack(new Date().getHours());
      const text = { coffee: "Coffee break ☕", water: "Hydrating 💧", fries: "Fries! 🍟", sausage: "Nom nom 🌭" }[snack];
      trick(snack, { ms: 5200, bubble: text, bubbleMs: 2500 });
      break;
    }
    case "nap":
      // D16: a yawn first, then the nightcap
      trick("yawn", {
        bubble: "Zzz… 🌙",
        bubbleMs: 2000,
        then: () => {
          sleepStage = 2;
          napUntil = Date.now() + NAP_MIN_MS;
          engine.applyState("sleep");
        },
      });
      break;
    // D19: the new tricks
    case "dance":
      trick("dance", { ms: 2000 });
      break;
    case "cool":
      trick("cool");
      break;
    case "boo":
      trick("surprised");
      break;
    case "chomp":
      trick("chomp", { bubble: "Nom." });
      break;
    case "love":
      trick("love", { ms: 3000 });
      break;
    case "yawn":
      trick("yawn");
      break;
    case "builtin-skin":
      // Back to the built-in Claw'd: forget the imported pack, restore spritesheet.webp
      window.ccPet.setCurrentPetId(null);
      engine.setSpritesheet(BUILTIN_SHEET).then((ok) => {
        if (ok) showSpeech("Back to the original 🦀", 2500);
      });
      break;
    case "import-pet":
      openImportDialog(engine);
      break;
    case "toggle-top":
      isAlwaysOnTop = !isAlwaysOnTop;
      window.ccPet.toggleAlwaysOnTop(isAlwaysOnTop);
      showSpeech(isAlwaysOnTop ? "Pinned on top" : "Unpinned", 1500);
      break;
    case "open-claude":
      openClaude(engine);
      break;
    case "toggle-mischief":
      mischiefEnabled = !mischiefEnabled;
      if (!mischiefEnabled && window.ccPet.clearFootprints) window.ccPet.clearFootprints();
      showSpeech(mischiefEnabled ? "Trouble mode: on 😈" : "I'll behave. Promise.", 2000);
      break;
    case "toggle-reactions":
      // Hook reactions only (H1-H21); dangle, trot, cursor-watch, yawn… stay on either way
      setReactions(!reactionsOn);
      showSpeech(reactionsOn ? "Reactions on 🔔" : "Reactions off. Just the basics.", 2000);
      break;
    case "fling": {
      cancelStroll(false);
      leavePerchSilently();
      const dir = Math.random() < 0.5 ? -1 : 1;
      fling(dir * (700 + Math.random() * 700), -(900 + Math.random() * 500));
      break;
    }
    case "perch": {
      (async () => {
        const wa = await workArea();
        if (!wa) return;
        if (perched) {
          await leavePerch();
          return;
        }
        const target = pickPerchTarget(wa);
        if (!target) {
          showSpeech("No good window to sit on 🤔", 2500);
          return;
        }
        cancelStroll(false);
        if (windowPosY < groundYOf(wa) - 4) await fallToGround(groundYOf(wa));
        const ok = await perchOn(target, wa);
        if (!ok) {
          clearClimb();
          if (isWalkAnim(engine.currentState) || engine.currentState === "jumping") director.requestStatusRow();
          scheduleStroll();
        }
      })();
      break;
    }
    case "steal-cursor":
      stealCursor(true);
      break;
    case "restart":
      cancelStroll(false);
      engine.applyState("jumping");
      showSpeech("Be right back 🔄", 1500);
      setTimeout(() => window.ccPet.restart(), 900);
      break;
    case "quit":
      cancelStroll(false);
      engine.applyState("failed");
      showSpeech("Bye… 😩", 2000);
      setTimeout(() => window.ccPet.quit(), 1500);
      break;
  }
}

// ── Small shared helpers: cooldowns, the (fakeable) clock, emotes ──

const cooldowns = {}; // name → last time it fired
function cooldownOk(name, ms) {
  return !cooldowns[name] || Date.now() - cooldowns[name] >= ms;
}
function markCooldown(name) {
  cooldowns[name] = Date.now();
}

// POST /debug/date sets a fake clock for the night rules and the seasonal hats
let fakeClock = null; // { base: ms of the fake date, setAt: real ms when it was set }
function nowDate() {
  return fakeClock ? new Date(fakeClock.base + (Date.now() - fakeClock.setAt)) : new Date();
}

// ── Overlays: hat and emote (F3 / F4) ──────────────────────
// PetEngine.showFrame (_display) is the single funnel: every frame it shows goes through onFrame →
// overlayFrame → renderOverlays. The placement maths lives in renderer/overlay.js (pure, shared
// with the QA preview); here it is only applied to #pet-hat / #pet-emote. Without CLAWD_META (or
// its emotes / hats tables) nothing is drawn.

const OVERLAY = window.ClawdOverlay || null;
const EMOTE_P4_GAP_MS = 1500; // ambient (P4) emote pops at least this far apart

function emoteMeta() {
  const m = META.meta;
  return m && m.emotes && m.emotes.list ? m.emotes : null;
}
function hatMeta() {
  const m = META.meta;
  return m && m.hats && m.hats.list ? m.hats : null;
}

const ov = {
  hatEl: null,
  emoteEl: null,
  frame: null, // on screen now: { display, base, frame, flip, animChanged, prevHatTop, tick }
  lastTargetTop: null, // the hat's untrailed top on the previous frame (follow-through)
  tick: 0, // frame changes (headband / halo alternate on it)
  hat: null, // last hatBox result
  emote: null, // last emoteBox result
};

function bubbleVisible() {
  const b = document.getElementById("pet-speech-bubble");
  return !!b && b.classList.contains("show-bubble");
}
function badgeVisible() {
  const b = document.getElementById("session-badge");
  return !!b && b.classList.contains("show");
}

function setupOverlays() {
  ov.hatEl = document.getElementById("pet-hat");
  ov.emoteEl = document.getElementById("pet-emote");
  const H = hatMeta();
  const E = emoteMeta();
  if (ov.hatEl && H && H.file) ov.hatEl.style.backgroundImage = `url("${H.file}")`;
  if (ov.emoteEl && E && E.file) ov.emoteEl.style.backgroundImage = `url("${E.file}")`;
  // The wizard-vs-bubble and badge-clamp rules depend on these two; re-place when they toggle
  const mo = new MutationObserver(() => renderOverlays());
  for (const id of ["pet-speech-bubble", "session-badge"]) {
    const el = document.getElementById(id);
    if (el) mo.observe(el, { attributes: true, attributeFilter: ["class"] });
  }
}

// Called for every frame the engine shows (display name, base row, sheet frame, flip)
function overlayFrame(display, base, frame, flip) {
  const f = ov.frame;
  const animChanged = !f || f.display !== display || f.flip !== flip;
  if (f && !animChanged && f.base === base && f.frame === frame) {
    renderOverlays();
    return;
  }
  ov.tick++;
  ov.frame = { display, base, frame, flip, animChanged, prevHatTop: animChanged ? null : ov.lastTargetTop, tick: ov.tick };
  renderOverlays(true);
}

function renderOverlays(frameChanged) {
  const f = ov.frame;
  if (!f || !OVERLAY || !ov.hatEl || !ov.emoteEl) return;
  const meta = META.meta;
  const common = {
    flip: f.flip,
    climbSide,
    hidden: hiddenMode,
    bubbleVisible: bubbleVisible(),
    badgeVisible: badgeVisible(),
    foreign: !engineRef || !engineRef.builtIn,
  };
  const hatId = hatMeta() ? currentHat : null;
  const hb = OVERLAY.hatBox(meta, f.base, f.frame, {
    ...common,
    hatId,
    animChanged: f.animChanged,
    prevHatTop: f.prevHatTop,
    tick: f.tick,
  });
  if (frameChanged) ov.lastTargetTop = hb.targetTop;
  ov.hat = hb;
  applyHatBox(hb);

  const hatHeight = hb.visible && hatId ? Number(hatMeta().list[hatId].height) || 0 : 0;
  const eb = OVERLAY.emoteBox(meta, f.base, f.frame, { ...common, emote: emote.name, col: emote.col, hatHeight });
  ov.emote = eb;
  applyEmoteBox(eb);
}

function applyHatBox(hb) {
  const el = ov.hatEl;
  if (!hb.visible) {
    if (el.style.display !== "none") el.style.display = "none";
    return;
  }
  el.style.display = "block";
  el.style.left = `${hb.left}px`;
  el.style.top = `${hb.top}px`;
  el.style.backgroundPosition = `${hb.bgX}px ${hb.bgY}px`;
  el.style.transformOrigin = hb.mirror ? `${hb.originX}px 0` : "";
  el.style.transform = hb.mirror ? "scaleX(-1)" : "";
}

function applyEmoteBox(eb) {
  const el = ov.emoteEl;
  if (!eb.visible) {
    if (el.style.display !== "none") el.style.display = "none";
    return;
  }
  el.style.display = "block";
  el.style.left = `${eb.left}px`;
  el.style.top = `${eb.top}px`;
  el.style.backgroundPosition = `${eb.bgX}px ${eb.bgY}px`;
  // In a climb the glyph is counter-rotated about its pivot pixel so it stays upright
  el.style.transformOrigin = eb.rotate ? `${eb.originX}px ${eb.originY}px` : "";
  el.style.transform = eb.rotate ? `rotate(${eb.rotate}deg)` : "";
  el.style.opacity = emote.faded ? "0.5" : "";
}

// ── Emote player (§3.5) ──
// Pop-in on columns 0, 1, 2 (popMs), then the emote's loop columns with their loopMs. With a life
// (meta, or the caller's `ms`) it drops to 50% at fadeAt and is gone at life; without one it is
// sticky until cleared or replaced. One emote at a time: a higher or equal priority replaces the
// current one (newest wins), a lower one is dropped. The timeline keeps running while a frame
// hides it (mark suppression, frame gate), so it comes back on the next clean frame.
const emote = {
  name: null,
  prio: 4,
  col: 0,
  faded: false,
  seq: 0,
  startedAt: 0,
  until: 0,
  stepTimer: null,
  fadeTimer: null,
  lifeTimer: null,
  lastP4PopAt: 0,
};

function clearEmoteTimers() {
  clearTimeout(emote.stepTimer);
  clearTimeout(emote.fadeTimer);
  clearTimeout(emote.lifeTimer);
  emote.stepTimer = emote.fadeTimer = emote.lifeTimer = null;
}

function clearEmote(name) {
  if (name && emote.name !== name) return; // only clear that one (a newer emote stays)
  clearEmoteTimers();
  emote.seq++;
  emote.name = null;
  emote.faded = false;
  renderOverlays();
}

// opts: { prio=4, ms (life override; null in meta = sticky), force (skip the P4 gap) }.
// Returns true when it started.
function showEmote(name, opts) {
  const o = opts || {};
  if (!name) {
    clearEmote();
    return true;
  }
  const E = emoteMeta();
  const em = E && E.list[name];
  if (!em) return false;
  const prio = o.prio == null ? 4 : o.prio;
  if (emote.name && prio > emote.prio) return false;
  const now = Date.now();
  if (prio === 4 && !o.force && now - emote.lastP4PopAt < EMOTE_P4_GAP_MS) return false;
  if (prio === 4) emote.lastP4PopAt = now;

  clearEmoteTimers();
  const seq = ++emote.seq;
  emote.name = name;
  emote.prio = prio;
  emote.faded = false;
  emote.startedAt = now;
  const pop = Array.isArray(E.popMs) && E.popMs.length >= 3 ? E.popMs : [90, 90, 90];
  const loopCols = Array.isArray(em.loop) && em.loop.length ? em.loop : [2];
  const loopMs = Array.isArray(em.loopMs) ? em.loopMs : [];
  let i = 0;
  const step = () => {
    if (seq !== emote.seq) return;
    let col;
    let ms;
    if (i < 3) {
      col = i;
      ms = pop[i];
    } else {
      const k = (i - 3) % loopCols.length;
      col = loopCols[k];
      ms = loopMs[k];
    }
    i++;
    emote.col = col;
    renderOverlays();
    emote.stepTimer = setTimeout(step, Math.max(40, Number(ms) || 200));
  };
  step();

  const life = o.ms != null ? Number(o.ms) : em.life;
  if (life != null && life > 0) {
    // The caller's ms keeps meta's fade lead (life - fadeAt), else 400 ms
    const lead = em.life != null && em.fadeAt != null ? em.life - em.fadeAt : 400;
    const fadeAt = o.ms != null || em.fadeAt == null ? Math.max(0, life - lead) : em.fadeAt;
    emote.fadeTimer = setTimeout(() => {
      if (seq !== emote.seq) return;
      emote.faded = true;
      renderOverlays();
    }, fadeAt);
    emote.lifeTimer = setTimeout(() => {
      if (seq === emote.seq) clearEmote();
    }, life);
    emote.until = now + life;
  } else emote.until = Infinity;
  return true;
}

// ── Hats (§3.6, §4.5) ──
// Resolution, evaluated on every status change, once a minute and whenever an input changes:
// debug override → event hat (halo after a test pass) → manual pick ("none" = no hat) → Auto work
// rules (Gate 3) → Auto seasonal rules → none. Imported skins never show hats.
let hatChoice = "auto"; // pet-config.json {hat}: "auto" | "none" | <hat id>
let birthday = null; // pet-config.json {birthday: "MM-DD"} → party hat that day
let reactionsOn = true; // pet-config.json {reactions}: hook reactions H1-H21 (menu 🔔 Reactions)
let eventHat = null; // { id, until }: beats everything, even a manual pick
let debugHat = null; // POST /debug/hat: temporary, not persisted ("none" forces no hat)
let currentHat = null; // the resolved hat id, or null

function seasonalHat(d) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const md = `${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (m === 12 && day >= 20 && day <= 26) return "santa";
  if ((m === 12 && day === 31) || (m === 1 && day === 1)) return "party";
  if (m === 10 && day >= 25) return "catears";
  if (m === 2 && day === 14) return "bow";
  if (birthday && md === birthday) return "party";
  const winter = (m === 12 && day <= 19) || (m === 1 && day >= 2) || (m === 2 && day <= 28);
  if (winter && d.getHours() < 11) return "beanie";
  return null;
}

// The Auto work rules (H20 / H21, Reactions On, focus session) are autoWorkHat() in the hook
// reactions section below.
function resolveHat() {
  if (debugHat) return debugHat === "none" ? null : debugHat;
  if (eventHat && eventHat.until > Date.now()) return eventHat.id;
  if (hatChoice === "none") return null;
  if (hatChoice && hatChoice !== "auto") return hatChoice;
  return autoWorkHat() || seasonalHat(nowDate());
}

function refreshHat() {
  const H = hatMeta();
  const id = resolveHat();
  const next = id && H && H.list[id] ? id : null;
  if (next === currentHat) return;
  currentHat = next;
  renderOverlays();
}

// H4 (Gate 3): halo for 10 s after a test pass
function setEventHat(id, ms) {
  eventHat = { id, until: Date.now() + ms };
  refreshHat();
  setTimeout(refreshHat, ms + 20);
}

function setHatChoice(id) {
  hatChoice = id || "auto";
  if (window.ccPet && window.ccPet.setConfig) window.ccPet.setConfig({ hat: hatChoice }).catch(() => {});
  refreshHat();
}

async function loadConfig() {
  try {
    const cfg = (window.ccPet && window.ccPet.getConfig && (await window.ccPet.getConfig())) || {};
    if (typeof cfg.hat === "string" && cfg.hat) hatChoice = cfg.hat;
    if (typeof cfg.birthday === "string") birthday = cfg.birthday;
    if (typeof cfg.reactions === "boolean") reactionsOn = cfg.reactions;
  } catch (e) {
    /* defaults */
  }
  refreshHat();
}

// Wardrobe menu items the sheet really has (ids only; main.js owns the labels)
function wardrobeIds() {
  const H = hatMeta();
  return H ? Object.keys(H.list).filter((id) => H.list[id] && H.list[id].menu) : [];
}

// ── Cursor-watch (D10 / F5) ──
// Armed by a system-idle report under 10 s or a mousemove inside the pet window. While armed and
// the crab is idle on the ground (status idle, not moving / hidden / asleep / petted / dragged /
// in the menu, built-in sheet), the cursor is polled at 8 Hz and the eyes follow it with display-
// only peeks of the `look` row (with a 1 px breath and a blink every 3-5 s). 4 s after the cursor
// stops moving (or leaves the 260 px range) the crab goes back to its idle loop; with no movement
// it also disarms, and nothing polls until the next arming event.
const CW_RANGE_PX = 260;
const CW_POLL_MS = 125;
const CW_STILL_MS = 4000;
const cw = {
  armed: false,
  lastMoveAt: 0,
  lastInRangeAt: 0,
  lastPos: null,
  timer: null,
  busy: false,
  peeking: false,
  frame: null,
  blinking: false,
  blinkTimer: null,
  nextBlinkAt: 0,
  source: null,
};

// D10 table: head centre ≈ (winX+150, winY+227); ddx / ddy = cursor − head
function lookFrameFor(ddx, ddy) {
  const ax = Math.abs(ddx);
  const ay = Math.abs(ddy);
  if (ax <= 20 && ay <= 20) return 2;
  if (ddy < -40 && ay > ax) return 5;
  if (ddy > 40 && ay > ax) return 6;
  if (ddx < -120) return 0;
  if (ddx < -20) return 1;
  if (ddx > 120) return 4;
  if (ddx > 20) return 3;
  return 2;
}

function cwConditionsOk() {
  const e = engineRef;
  if (!e || !e.builtIn || !e.has("look")) return false;
  if (e.currentState !== "idle" || e.held || e.bridgeTimer) return false;
  if (currentCCStatus !== "idle") return false;
  if (hiddenMode || sleepStage || petting || isDragging || menuOpen || stealing || climbSide || perched) return false;
  if (moveTimer || restTimer || isMustFinish()) return false;
  if (!lastWorkArea || Math.abs(windowPosY - groundYOf(lastWorkArea)) > 4) return false;
  return true;
}

function cwArm(source) {
  if (!cwConditionsOk()) return false;
  cw.armed = true;
  cw.source = source;
  cw.lastMoveAt = Date.now();
  if (!cw.timer && !cw.busy) cw.timer = setTimeout(cwTick, 0);
  return true;
}

function cwStop() {
  cw.armed = false;
  cw.source = null;
  clearTimeout(cw.timer);
  cw.timer = null;
  cwUnpeek();
  cw.lastPos = null;
}

function cwUnpeek() {
  clearTimeout(cw.blinkTimer);
  cw.blinkTimer = null;
  cw.blinking = false;
  if (cw.peeking && engineRef) engineRef.unpeek("cw");
  cw.peeking = false;
  cw.frame = null;
}

function cwOwnsPeek() {
  return !!(engineRef && engineRef.peekInfo && engineRef.peekInfo.owner === "cw");
}

function cwPeek(k) {
  if (!engineRef.peek("look", k, { breathe: true, owner: "cw" })) return;
  if (!cw.peeking) cw.nextBlinkAt = Date.now() + 3000 + Math.random() * 2000;
  cw.peeking = true;
  cw.frame = k;
}

function cwBlink() {
  if (!engineRef.peek("look", 7, { breathe: true, owner: "cw" })) return;
  cw.blinking = true;
  cw.blinkTimer = setTimeout(() => {
    cw.blinkTimer = null;
    cw.blinking = false;
    cw.nextBlinkAt = Date.now() + 3000 + Math.random() * 2000;
    if (cw.peeking && cwOwnsPeek() && cw.frame != null) engineRef.peek("look", cw.frame, { breathe: true, owner: "cw" });
  }, 130);
}

async function cwTick() {
  cw.timer = null;
  if (!cw.armed) return;
  if (!cwConditionsOk()) return cwStop();
  // Something else took the display over (a stroll's glance, a new row): the watch starts afresh
  if (cw.peeking && !cwOwnsPeek()) {
    clearTimeout(cw.blinkTimer);
    cw.blinkTimer = null;
    cw.blinking = false;
    cw.peeking = false;
    cw.frame = null;
  }
  let p = null;
  cw.busy = true;
  try {
    p = await window.ccPet.getCursor();
  } catch (e) {
    p = null;
  }
  cw.busy = false;
  if (!cw.armed) return;
  if (!cwConditionsOk()) return cwStop();
  const now = Date.now();
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
    if (!cw.lastPos || Math.abs(p.x - cw.lastPos.x) + Math.abs(p.y - cw.lastPos.y) >= 1) {
      if (cw.lastPos) cw.lastMoveAt = now;
      cw.lastPos = { x: p.x, y: p.y };
    }
    const ddx = p.x - (windowPosX + WIN_W / 2);
    const ddy = p.y - (windowPosY + 227);
    if (Math.hypot(ddx, ddy) <= CW_RANGE_PX && now - cw.lastMoveAt < CW_STILL_MS) {
      cw.lastInRangeAt = now;
      const k = lookFrameFor(ddx, ddy);
      if (cw.blinking) cw.frame = k;
      else if (!cw.peeking || cw.frame !== k) cwPeek(k);
    }
  }
  if (now - cw.lastMoveAt >= CW_STILL_MS) return cwStop(); // still for 4 s: idle loop, stop polling
  if (cw.peeking && now - cw.lastInRangeAt >= CW_STILL_MS) cwUnpeek(); // left the range 4 s ago
  if (cw.peeking && !cw.blinking && now >= cw.nextBlinkAt) cwBlink();
  cw.timer = setTimeout(cwTick, CW_POLL_MS);
}

// ── Reaction Director ──────────────────────────────────────
// The only code that picks a row, apart from the stroll state machine's own walks and rests and
// the movers (drag, fling, fall, climb, perch, steal, hide) while they move. A play has a
// priority (P0 direct gesture, P1 needs you, P2 milestone, P3 status row, P4 ambient) and a
// token: its follow-up (`then`) runs only while its token is current and its row still shows,
// so an old timer can never undo a newer play, a drag or a landing.

// Hooks that mean their session is mid-turn (the focus session prefers a busy session)
const BUSY_EVENTS = new Set(["UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure"]);

const director = {
  token: 0,
  live: null, // { token, name, prio, until, then, source }
  liveTimer: null,
  queue: null, // 1-slot queue: { name, o, prio, at }
  statusDirty: false, // a status row was deferred (drag, menu, steal, in the air)
  lastP2At: 0,
  lastVerdict: null, // what the last playOneShot did (see there)
  rowStatus: "idle", // the status that drives rows (focus session; waiting-with-prompt from any)
  rowSeq: 0,
  statusExpired: false, // completed / error rows go back to idle after 5 s
  completedRow: "jumping",
  lastPromptSession: null,
  lastAnySession: null,
  rowSession: "", // the session whose status is on the row now
  rowPrompt: false, // the row is that session's open permission prompt (P1)
  sessStatus: new Map(), // sessionId → { status, prompt } of its last hook, most recent last
  promptSeq: new Map(), // sessionId → the order of its last UserPromptSubmit (higher = later)
  promptCounter: 0,
  seenAt: new Map(), // sessionId → Date.now() of its last hook

  liveActive() {
    return !!this.live && this.live.until > Date.now();
  },

  // Forget the live play (its follow-up will not run). Drag, fling, hide and petting call it.
  interrupt() {
    this.token++;
    this.live = null;
    if (this.liveTimer) {
      clearTimeout(this.liveTimer);
      this.liveTimer = null;
    }
  },

  // The blocking matrix (§4.2): "play" | "cancel" (stop the stroll, then play) | "queue" |
  // "drop" | "emote" (emote only) | "wake" (startle first). P3 rows go through requestStatusRow.
  gate(prio, o) {
    const src = o.source || "";
    if (isDragging) return prio === 1 ? "queue" : "drop"; // the drag's own logic owns the row
    if (menuOpen) return prio === 0 ? "play" : prio === 1 ? "queue" : "drop";
    if (isMustFinish()) return prio === 1 || prio === 2 ? "queue" : "drop"; // menu tricks too
    if (stealing && src !== "steal") return prio === 1 ? "queue" : "drop";
    if (hiddenMode) return prio === 0 ? "drop" : "emote";
    if (sleepStage > 0) return prio === 0 ? "play" : prio === 1 ? "wake" : "drop";
    if (petting && src !== "petting") return prio <= 1 ? "play" : prio === 2 ? "emote" : "drop";
    if (usageCard && (prio === 2 || prio === 4)) return "emote";
    if (this.liveActive() && this.live.prio < prio) return prio <= 2 ? "queue" : "drop";
    if (isCancellableMove()) return prio === 4 ? "drop" : "cancel";
    return "play";
  },

  // opts: { prio, loops=1, ms, flip, restart, bubble:{text,ms}, emote, emoteMs, degrade, degradeMs,
  //         then="@status", source, resolves, shake }. restart defaults to true for P0.
  // `emote` shows with the play (and alone when the matrix says emote-only); `degrade` is shown
  // only in that emote-only case (hiddenMode, petting, usage card), e.g. [rain] for H5's sad.
  // Returns true when it played; `lastVerdict` says what happened ("play", "queue", "emote",
  // "drop", "wake", "gap").
  playOneShot(name, opts) {
    const prio = opts && opts.prio != null ? opts.prio : 4;
    const o = { ...(opts || {}), prio };
    if (o.loops == null) o.loops = 1;
    if (o.then === undefined) o.then = "@status"; // null = leave the row as it is
    if (o.restart == null) o.restart = prio === 0;
    if (prio === 2 && !o.resolves && Date.now() - this.lastP2At < P2_GAP_MS) {
      this.lastVerdict = "gap";
      return false;
    }
    let v = this.gate(prio, o);
    if (v === "cancel") {
      cancelStroll(false);
      v = isMustFinish() ? "queue" : "play"; // a cancelled climb drops into a fall: play on landing
    }
    this.lastVerdict = v;
    if (v === "play") return this._start(name, o);
    if (v === "queue") this.enqueue(name, o);
    else if (v === "emote") {
      const de = o.degrade !== undefined ? o.degrade : o.emote;
      if (de) showEmote(de, { prio, ms: o.degrade !== undefined ? o.degradeMs : o.emoteMs });
    } else if (v === "wake") {
      sleepStage = 0;
      return this._start("startle", { prio, loops: 1, restart: true, source: o.source, then: () => this._start(name, o) });
    }
    return false;
  },

  _start(name, o) {
    if (sleepStage && o.prio === 0) {
      sleepStage = 0; // a direct gesture wakes the crab
      napUntil = 0; // …and ends a menu nap (the drop path's chomp comes through here)
    }
    if (petting && o.source !== "petting" && o.prio <= 1) stopPetting(engineRef, true);
    const token = ++this.token;
    if (this.liveTimer) clearTimeout(this.liveTimer);
    engineRef.applyState(name, { flip: !!o.flip, restart: !!o.restart });
    let ms = o.ms != null ? o.ms : engineRef.durationOf(name, o.loops, !!o.flip);
    if (engineRef.bridgeTimer) ms += engineRef.bridgeMs || 0; // the squint bridge delays frame 0
    this.live = { token, name, prio: o.prio, until: Date.now() + ms, then: o.then, source: o.source || "" };
    if (o.prio === 2) this.lastP2At = Date.now();
    if (o.bubble && o.bubble.text) showSpeech(o.bubble.text, o.bubble.ms || ms, { prio: o.prio, kind: "reaction" });
    if (o.emote) showEmote(o.emote, { prio: o.prio, ms: o.emoteMs });
    if (o.shake) shake();
    this.liveTimer = setTimeout(() => this._end(token), ms);
    return true;
  },

  _end(token) {
    if (token !== this.token || !this.live) return;
    const live = this.live;
    this.live = null;
    this.liveTimer = null;
    if (engineRef.currentState !== live.name) return; // something else took the row over
    const then = live.then;
    if (typeof then === "function") then();
    else if (then === "@status") this.afterPlay();
    else if (typeof then === "string" && then) engineRef.applyState(then);
  },

  // What follows a play or a landing: the queued entry if any, else the status row
  afterPlay() {
    if (this.queue) this.playQueued();
    else this.requestStatusRow();
  },

  enqueue(name, o) {
    if (this.queue && this.queue.prio < o.prio) return; // keep the higher priority (ties: newest)
    this.queue = { name, o, prio: o.prio, at: Date.now() };
  },

  playQueued() {
    const q = this.queue;
    this.queue = null;
    if (Date.now() - q.at > 60000 || !this.playOneShot(q.name, q.o)) {
      if (!this.queue && !this.liveActive()) this.requestStatusRow();
    }
  },

  // A must-finish move (fall, fling landing, perch hop) is over
  onLanded() {
    if (isDragging) return;
    this.statusDirty = false;
    this.afterPlay();
  },

  // A blocking flag (menu, drag, steal) cleared: play the queue, or the deferred status row
  flagCleared() {
    if (isDragging || menuOpen || stealing || isMustFinish() || this.liveActive()) return;
    if (this.queue) this.playQueued();
    else if (this.statusDirty) {
      this.statusDirty = false;
      this.requestStatusRow();
    }
  },

  // P3: the status row, unless something with a say is going on
  requestStatusRow() {
    if (isMustFinish() || isDragging || menuOpen || stealing) {
      this.statusDirty = true; // landing / the flag clearing applies it
      return;
    }
    if (this.liveActive() && this.live.prio <= 2) return; // its then:"@status" lands on the row
    if (moveTimer || restTimer) return; // a walk / climb / rest owns the row until it ends
    if (petting && this.rowStatus === "idle") return; // petting is its own row
    this.statusDirty = false;
    engineRef.applyState(this.statusRow());
  },

  statusRow() {
    switch (this.rowStatus) {
      case "running":
        return runningPose();
      case "waiting":
        return "waiting";
      case "completed":
        return this.statusExpired || !this.completedRow ? idleRow() : this.completedRow;
      case "error":
        return this.statusExpired ? idleRow() : "failed";
      default:
        return idleRow();
    }
  },

  // Completion row. H18 (Reactions On, a hook with tags): the variant plays as a P2 one-shot and
  // the completed row is idle after it (null). When a drag or the menu drops the play, the variant
  // is the status row instead (shown when the flag clears). When the 8 s P2 gap refuses it, some
  // other P2 just played (typically H5's sad on this same Stop): no party after it, idle.
  // Otherwise today's jumping / backflip 50/50.
  pickCompletion(sessionId) {
    const v = hookCompletion(sessionId);
    if (!v) return Math.random() < 0.5 ? "backflip" : "jumping";
    const played = this.playOneShot(v.row, { prio: 2, loops: v.loops, source: "hook:h18", degrade: "sparkle" });
    if (played || this.lastVerdict !== "drop") return null;
    const s = hookSess.get(sessionId || "");
    return s && s.failedThisRun ? null : v.row; // no deferred party for a run with a failed test
  },

  // Focus session: the most recently prompted session that is still busy (running, or blocked on
  // a permission prompt, and heard from within HK.STALE_MS). When no session is busy: the one with
  // the latest UserPromptSubmit; before any prompt, the latest session with any hook. So a long
  // run prompted once keeps the crab after a later side chat finishes. A lone session is always
  // the focus. (The hook-event handler calls noteSession too, just before the same hook's
  // status-update does.)
  noteSession(sessionId, event) {
    if (!sessionId || event === "revert") return; // main's own timed revert is not a hook
    if (event === "SessionEnd") {
      this.forgetSession(sessionId);
      return;
    }
    this.lastAnySession = sessionId;
    this.seenAt.set(sessionId, Date.now());
    if (event === "UserPromptSubmit") {
      this.lastPromptSession = sessionId;
      this.promptSeq.set(sessionId, ++this.promptCounter);
    }
    // re-insert: the most recent session comes last
    let entry = this.sessStatus.get(sessionId);
    if (entry) this.sessStatus.delete(sessionId);
    // A prompt or a tool call means that session is busy from this hook on (its status-update,
    // right behind, says so too; the hook-event's focus check must already see it)
    if (BUSY_EVENTS.has(event)) entry = { status: "running", prompt: false };
    if (entry) this.sessStatus.set(sessionId, entry);
  },
  forgetSession(sessionId) {
    if (this.lastPromptSession === sessionId) this.lastPromptSession = null;
    if (this.lastAnySession === sessionId) this.lastAnySession = null;
    this.sessStatus.delete(sessionId);
    this.promptSeq.delete(sessionId);
    this.seenAt.delete(sessionId);
  },
  isBusy(sessionId, e) {
    if (!e || !(e.status === "running" || (e.status === "waiting" && e.prompt))) return false;
    return Date.now() - (this.seenAt.get(sessionId) || 0) < HK.STALE_MS;
  },
  focusSession() {
    let best = null;
    let bestSeq = -1;
    for (const [sid, e] of this.sessStatus) {
      if (!this.isBusy(sid, e)) continue;
      const seq = this.promptSeq.get(sid) || 0;
      if (seq >= bestSeq) {
        best = sid; // ties (never prompted): the most recent
        bestSeq = seq;
      }
    }
    if (best) return best;
    if (this.lastPromptSession || this.lastAnySession) return this.lastPromptSession || this.lastAnySession;
    let last = null;
    for (const sid of this.sessStatus.keys()) last = sid; // the most recent session still alive
    return last;
  },
  isFocus(sessionId) {
    return !sessionId || sessionCount < 2 || sessionId === this.focusSession();
  },
  // The focus session's own status, for handing the row back to it. Its completed / error row
  // has been shown already (or belonged to the moment it happened): that is idle now.
  focusRow() {
    const f = this.focusSession() || "";
    const e = (f && this.sessStatus.get(f)) || { status: "idle", prompt: false };
    return [e.status === "completed" || e.status === "error" ? "idle" : e.status, f, e.prompt];
  },

  // Status path: rows from the focus session (and permission prompts from any session);
  // bubbles from every session, each with its priority. A background session that took the row
  // with its prompt hands it back to the focus session on its next status (approved, done, ended).
  // Returns true when this status set the row.
  onStatus(status, message, sessionId, event) {
    this.noteSession(sessionId, event);
    // Focus as this hook arrives: the focus session's own Stop still plays its completion row,
    // although it stops being busy (and the focus may move on) the moment it is recorded
    const focusNow = this.isFocus(sessionId);
    const ended = event === "SessionEnd";
    const prompt = status === "waiting" && isPermissionPrompt(message, hookNtype(sessionId, event));
    // (a timed revert updates a known session only: it must not bring back one that ended)
    if (sessionId && !ended && (event !== "revert" || this.sessStatus.has(sessionId))) {
      this.sessStatus.set(sessionId, { status, prompt });
    }
    let row = null;
    let rowSid = sessionId || "";
    let rowPrompt = prompt;
    const ownsRow = !!sessionId && sessionId === this.rowSession;
    // Another session's open prompt (P1) keeps the row against the focus session's P2/P3 rows
    const held = this.rowPrompt && !!this.rowSession && !ownsRow;
    // Another session's completed / failed row is still up (its 5 s): a running or idle status
    // waits for it; the row's expiry hands over to the focus session (setRow)
    const fresh =
      (this.rowStatus === "completed" || this.rowStatus === "error") && !this.statusExpired && !!this.rowSession && !ownsRow;
    if (ended && sessionId) {
      // A session that ended drives nothing, unless it was the last one or it had the row
      if (!this.sessStatus.size) row = status;
      else if (ownsRow) [row, rowSid, rowPrompt] = this.focusRow();
    } else if (prompt) row = status; // P1 from any session
    else if (ownsRow) {
      if (focusNow) row = status;
      else [row, rowSid, rowPrompt] = this.focusRow(); // answered, done or reverted: back to the focus session
    } else if (focusNow && !held && !(fresh && status !== "completed" && status !== "error")) row = status;
    if (row) this.setRow(row, rowSid, rowPrompt);
    this.statusBubble(status, message, sessionId, event, prompt);
    return !!row;
  },

  setRow(status, sessionId, prompt) {
    this.rowStatus = status;
    this.rowSession = sessionId || "";
    this.rowPrompt = !!prompt && status === "waiting";
    const seq = ++this.rowSeq;
    if (status === "completed") this.completedRow = this.pickCompletion(sessionId);
    if (status === "error") hookGlobal.cleanStreak = 0; // an error status breaks the clean streak
    if (status === "completed" || status === "error") {
      this.statusExpired = false;
      setTimeout(() => {
        if (this.rowSeq !== seq || this.rowStatus !== status) return;
        // Another session still busy (the focus moved on to it): its status takes the row
        const [next, nextSid, nextPrompt] = this.focusRow();
        if (nextSid && nextSid !== this.rowSession && this.isBusy(nextSid, this.sessStatus.get(nextSid))) {
          poseEval(); // that session's work pose, if it qualifies
          this.setRow(next, nextSid, nextPrompt);
          return;
        }
        this.statusExpired = true; // back to idle after 5 s
        this.requestStatusRow();
      }, 5000);
    }
    this.requestStatusRow();
  },

  // main's session list changed (ids of the sessions still alive): forget the others, and a dead
  // session's prompt row and bubbles go with it (a killed session may never send its SessionEnd
  // idle, or main may hold it back while another session is busy)
  sessionsChanged(ids) {
    if (!Array.isArray(ids)) return;
    const alive = new Set(ids);
    for (const sid of [...this.sessStatus.keys()]) if (!alive.has(sid)) this.forgetSession(sid);
    if (this.lastPromptSession && !alive.has(this.lastPromptSession)) this.lastPromptSession = null;
    if (this.lastAnySession && !alive.has(this.lastAnySession)) this.lastAnySession = null;
    if (this.rowSession && !alive.has(this.rowSession)) {
      const [row, sid, prompt] = this.focusRow();
      this.setRow(row, sid, prompt);
    }
    dropSessionBubbles(alive);
  },

  statusBubble(status, message, sessionId, event, prompt) {
    const sid = sessionId || "";
    if (status === "waiting") {
      // A permission prompt is P1; "waiting for your input" (idle) stays sticky and blinks as
      // before, but at P3, so a busy session's bubbles still replace it
      const msg = message || STATUS_MESSAGES.waiting;
      const prio = prompt ? 1 : 3;
      showSpeech(msg, message ? 999999 : 3000, { prio, kind: "status", sessionId: sid, blink: !!message });
    } else if (status === "running") {
      if (message) showSpeech(message, 999999, { prio: 3, kind: "status", sessionId: sid });
      else showTyping(999999, { prio: 3, kind: "status", sessionId: sid });
    } else {
      // A hook reaction speaking for this hook (H15-H17 on SessionStart) replaces the generic text
      const claim = message ? null : bubbleClaimed(sid, event);
      if (claim) {
        showSpeech(claim.text, claim.ms, { prio: 3, kind: "status", sessionId: sid });
        return;
      }
      const msg = message || STATUS_MESSAGES[status] || "";
      if (msg) showSpeech(msg, status === "completed" ? 5000 : 4000, { prio: 3, kind: "status", sessionId: sid });
    }
  },
};

// A waiting status with a message is a permission prompt (P1), except Claude Code's idle reminder
// ("Claude is waiting for your input", sent about 60 s after a turn ends). A hook with Gate 3's
// tags names the notification (`ntype`); without one, the text is all there is to go on.
const IDLE_PROMPT_RE = /waiting for your input/i;
const PROMPT_NTYPES = new Set(["permission_prompt", "elicitation_dialog", "elicitation_url_dialog", "agent_needs_input"]);
function isPermissionPrompt(message, ntype) {
  if (!message) return false;
  if (ntype) return PROMPT_NTYPES.has(ntype);
  return !IDLE_PROMPT_RE.test(message);
}

// The row while Claude runs: H2's work pose (typing without hook tags, with Reactions Off, and
// in hiddenMode, where the peeking crab keeps today's typing row)
function runningPose() {
  if (hiddenMode || !reactionsOn) return "typing";
  return pose.current || "typing";
}

// ── Hook reactions (§4.4 H1-H21, Gate 3) ───────────────────
// main.js sends one hook-event per hook, just before that hook's status-update: the tags
// hooks/notify.js adds (kind, cmd, ok, verdict, source, ntype, mode, toolUseId, limit). They feed
// the per-session state below and the H-rules. Every tag is optional: an event without them
// (today's notify.js, `rich` false) is only counted, so the pet behaves exactly as before Gate 3.
// Reactions Off (menu, pet-config.json {reactions}) keeps the bookkeeping but plays no H-row,
// emote or work hat, and completion falls back to jumping / backflip.
// Only the focus session drives P2-P4 reactions; P1 (a permission prompt) comes from any session.

const LIMIT_ENABLED = false; // H19 stays off: the limit most likely arrives as the unregistered StopFailure
const HOOK_KINDS = new Set(["shell", "read", "edit", "web", "agent", "todo", "mcp", "other"]);
const HOOK_CMDS = new Set(["test", "git-commit", "git-push"]);
const HOOK_VERDICTS = new Set(["pass", "fail"]);
const TOOL_EMOTE_KINDS = new Set(["read", "edit", "shell", "web", "agent"]); // H1 (todo, mcp, other: none)
const PERMISSION_FALLBACK_RE = /permission|approve|allow/i;
const HK = {
  H1_GAP: 30000, // tool emote pops at most this often
  H3_COOLDOWN: 20000, // fingers-crossed starts at least this far apart
  H3_CAP: 30000, // …and loops at most this long
  H3_DOTS: 60000, // then the dots emote, until a verdict or this long
  H4_HALO: 10000,
  H5_MS: 4500,
  H5_COOLDOWN: 60000,
  H5_RAIN: 6000,
  H7_COOLDOWN: 30000,
  H8_COOLDOWN: 30000,
  H9_COOLDOWN: 10000,
  H10_COOLDOWN: 60000,
  H11_GAP: 90000, // per session, since its last prompt
  H12_GAP: 20 * 60000, // no Claude Code activity this long → startle
  H12_COOLDOWN: 20 * 60000,
  H13_NERVOUS: 30000, // an open permission prompt this long without a hook from its session
  H13_BANG: 20000, // hiddenMode: bang again this often until then
  H13_NERVOUS_MAX: 10 * 60000,
  H14_COOLDOWN: 5 * 60000,
  H15_COOLDOWN: 60000,
  H16_COOLDOWN: 2 * 60000,
  H19_COOLDOWN: 30 * 60000,
  H20_HARDHAT: 2 * 60000,
  H20_HEADBAND: 8 * 60000,
  H21_CHANGE: 10000, // the plan-mode wizard changes at most this often
  POSE_DWELL: 1500, // H2: a pose group this long (or twice in a row) qualifies…
  POSE_HOLD: 8000, // …and a pose holds at least this long
  BURST_MS: 500, // PreToolUses closer than this to a test's own are one parallel burst
  STALE_MS: 10 * 60000, // a focus session silent this long is not "running" for the work hats
  GONE_MS: 5000, // a session main dropped keeps its state this long (its SessionEnd may follow)
};

// Per-session state (§4.2). lastKind is the last PreToolUse kind; kindSince / kindRun describe the
// current run of PreToolUses in one H2 pose group (work-read, work-shell, typing).
const hookSess = new Map();
function hookSession(sid) {
  let s = hookSess.get(sid);
  if (!s) {
    s = {
      runStart: 0,
      inRun: false,
      toolCalls: 0,
      lastKind: "",
      poseGroup: "",
      kindSince: 0,
      kindRun: 0,
      testPending: new Map(), // toolUseId → { t, cmd, played, shown }
      agentPending: new Set(), // toolUseIds
      summoned: false, // a summon played for the pending agents (their return resolves it)
      lastPromptAt: 0,
      waitingSince: 0,
      failedThisRun: false,
      pushedThisRun: false,
      lastPreAt: 0,
      lastHookAt: 0,
      ntype: "",
      ntypeAt: 0,
      mode: "",
      rich: false,
      welcomed: false,
      gone: 0,
    };
    hookSess.set(sid, s);
  }
  return s;
}

// Run lengths (H18, H20) and the quiet time before a prompt (H12) are read off the clock that
// POST /debug/date can fake, so QA can "wait" 20 minutes; pose dwell, cooldowns and bursts use
// real time.
function hookClock() {
  return nowDate().getTime();
}

const hookGlobal = {
  cleanStreak: 0, // consecutive focus completions without a failed test (memory only)
  lastVariant: null, // H18: never the same completion (row and loops) twice in a row
  lastPoppedKind: "", // H1
  lastWorkAt: Date.now(), // H12, on hookClock(): the last work hook (the pet's start counts as activity)
  bubbleClaim: null, // { sid, event, until }: a reaction's bubble the generic status bubble must not replace
  deferred: [], // plays that must wait for their hook's status-update (H17)
  received: { real: 0, injected: 0, rich: 0 },
};
const pose = { current: "typing", since: 0, timer: null }; // H2
const promptWatch = { sid: null, at: 0, timer: null, bangTimer: null, escalated: false }; // H13
const wizardHat = { on: false, changedAt: 0, timer: null }; // H21

function hookTagOf(v, allowed) {
  if (typeof v !== "string") return "";
  return allowed ? (allowed.has(v) ? v : "") : /^[A-Za-z0-9_.:-]{1,64}$/.test(v) ? v : "";
}

function normalizeHookEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    event: hookTagOf(raw.event),
    kind: hookTagOf(raw.kind, HOOK_KINDS),
    cmd: hookTagOf(raw.cmd, HOOK_CMDS),
    verdict: hookTagOf(raw.verdict, HOOK_VERDICTS),
    ok: typeof raw.ok === "boolean" ? raw.ok : null,
    source: hookTagOf(raw.source),
    ntype: hookTagOf(raw.ntype),
    mode: hookTagOf(raw.mode),
    toolUseId: hookTagOf(raw.toolUseId),
    limit: raw.limit === true,
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : "",
    injected: !!raw.injected,
    rich: !!raw.rich,
    // QA extras, only on injected events (POST /debug/hook): backdate the last activity / run start
    qaIdleMs: raw.injected && Number.isFinite(raw.qaIdleMs) ? raw.qaIdleMs : null,
    qaRunMs: raw.injected && Number.isFinite(raw.qaRunMs) ? raw.qaRunMs : null,
  };
}

// A hook's P4 emote pop (H1, H9-H11, H14, H16) follows the §4.2 matrix's P4 column: dropped while
// dragged, in the menu, in the air, stealing, asleep, petted or walking; shown otherwise
// (perched, hiddenMode and the usage card allow emote pops)
function hookPop(name, opts) {
  if (isDragging || menuOpen || isMustFinish() || stealing || sleepStage > 0 || petting || isCancellableMove()) return false;
  return showEmote(name, { prio: 4, ...(opts || {}) });
}

// A play the user will see: it started, waits in the queue, or degraded to its emote
function hookPlay(name, opts) {
  const ok = director.playOneShot(name, opts);
  return ok || director.lastVerdict === "queue" || director.lastVerdict === "emote" || director.lastVerdict === "wake";
}
function isHookPlay(entry) {
  return !!entry && typeof entry.source === "string" && entry.source.startsWith("hook:");
}

function handleHookEvent(raw) {
  const ev = normalizeHookEvent(raw);
  if (!ev || !ev.event) return;
  hookGlobal.received[ev.injected ? "injected" : "real"]++;
  if (!ev.rich) return; // today's hooks/notify.js: no tags, no reactions (the status path does the rest)
  hookGlobal.received.rich++;
  try {
    runHookRules(ev);
  } catch (e) {
    noteError(`hook ${ev.event}: ${(e && e.message) || e}`);
  }
  refreshHat(); // plan mode, run length
}

function runHookRules(ev) {
  const now = hookClock();
  const sid = ev.sessionId;
  const E = ev.event;
  // H13 ends on the next hook from the prompting session (nervous, bang, sweat); a repeated
  // permission notification is the same prompt still open
  if (promptWatch.sid !== null && promptWatch.sid === sid && !(E === "Notification" && ev.ntype === "permission_prompt")) endPromptWatch();
  if (E !== "SessionEnd") director.noteSession(sid, E); // the focus follows this hook right away
  const s = hookSession(sid);
  const focus = director.isFocus(sid);
  const act = reactionsOn;
  s.lastHookAt = now;
  s.rich = true;
  s.gone = 0;
  if (ev.mode) s.mode = ev.mode;
  const work = E === "UserPromptSubmit" || E === "PreToolUse" || E === "PostToolUse" || E === "PostToolUseFailure" || E === "Stop" || E === "Notification";
  if (ev.qaIdleMs != null) hookGlobal.lastWorkAt = now - ev.qaIdleMs;
  const idleGap = now - hookGlobal.lastWorkAt;
  switch (E) {
    case "UserPromptSubmit":
      hookPrompt(ev, s, focus, act, idleGap);
      break;
    case "PreToolUse":
      hookPreTool(ev, s, focus, act, idleGap);
      break;
    case "PostToolUse":
    case "PostToolUseFailure":
      hookPostTool(ev, s, focus, act);
      break;
    case "Stop":
    case "StopFailure":
      inferPending(s, "Stop", focus, act);
      s.inRun = false;
      if (focus) resetPose(true);
      break;
    case "SessionStart":
      hookSessionStart(ev, s, focus, act);
      break;
    case "SessionEnd":
      inferPending(s, "SessionEnd", focus, act);
      hookSess.delete(sid);
      break;
    case "Notification":
      s.ntype = ev.ntype;
      s.ntypeAt = Date.now();
      if (LIMIT_ENABLED && ev.limit && act) hookLimit();
      break;
  }
  if (work) hookGlobal.lastWorkAt = now;
  if (ev.qaRunMs != null && hookSess.has(sid)) {
    s.runStart = now - ev.qaRunMs;
    if (E !== "Stop" && E !== "StopFailure") s.inRun = true;
  }
}

// The notification type of this session's hook that is being handled (for the status that follows)
function hookNtype(sessionId, event) {
  if (event !== "Notification") return "";
  const s = hookSess.get(sessionId || "");
  return s && s.rich && Date.now() - s.ntypeAt < 3000 ? s.ntype : "";
}

// UserPromptSubmit: H12 startle, H11 bulb; a new run starts
function hookPrompt(ev, s, focus, act, idleGap) {
  const now = hookClock();
  inferPending(s, "UserPromptSubmit", focus, act);
  if (director.live && director.live.source === "hook:limit") {
    director.interrupt(); // H19's sad ends with the next prompt
    director.afterPlay();
  }
  if (focus && act) {
    hookStartle(idleGap);
    // H11: a fresh prompt (90 s since this session's last) gets a light bulb by "Thinking..."
    if (!s.lastPromptAt || now - s.lastPromptAt >= HK.H11_GAP) hookPop("bulb");
  }
  s.lastPromptAt = now;
  s.runStart = now;
  s.inRun = true;
  s.toolCalls = 0;
  s.failedThisRun = false;
  s.pushedThisRun = false;
  s.lastKind = "";
  s.poseGroup = "";
  s.kindRun = 0;
  s.kindSince = 0;
  if (focus) {
    resetPose(true);
    hookGlobal.lastPoppedKind = ""; // a new run: its first tool may pop even if it is the last run's kind
  }
}

// H12: the first prompt / tool call after 20 min without Claude Code activity, crab awake
function hookStartle(idleGap) {
  if (idleGap < HK.H12_GAP || sleepStage || !cooldownOk("h12", HK.H12_COOLDOWN)) return;
  if (hookPlay("startle", { prio: 2, source: "hook:h12", degrade: "bangq" })) markCooldown("h12");
}

function poseFor(kind) {
  return kind === "read" ? "work-read" : kind === "shell" ? "work-shell" : "typing";
}

// PreToolUse: inference, H12, H3 (tests), H7 (agents), H9 / H10 (git), H1 (tool emote), H2 (pose)
function hookPreTool(ev, s, focus, act, idleGap) {
  const now = Date.now();
  inferPending(s, "PreToolUse", focus, act);
  if (focus && act) hookStartle(idleGap);
  s.toolCalls++;
  s.lastPreAt = now;
  if (!s.inRun) {
    s.inRun = true; // tools without a prompt seen first (the pet started mid-run)
    s.runStart = hookClock();
  }
  const kind = ev.kind;
  const group = poseFor(kind);
  if (group === s.poseGroup) s.kindRun++;
  else {
    s.poseGroup = group;
    s.kindRun = 1;
    s.kindSince = now;
  }
  s.lastKind = kind;
  const id = ev.toolUseId || `pre-${now}-${s.toolCalls}`;
  let fired = false;

  if (ev.cmd === "test") {
    // H3: fingers crossed for up to 30 s, then the running pose + dots until the verdict
    const t = { t: now, cmd: ev.cmd, played: false, shown: false, token: null };
    s.testPending.set(id, t);
    if (focus && act && cooldownOk("h3", HK.H3_COOLDOWN)) {
      const ok = director.playOneShot("fingers-crossed", {
        prio: 2,
        ms: HK.H3_CAP,
        source: "hook:test",
        degrade: "dots",
        then: () => fingersTimedOut(s, id),
      });
      const v = director.lastVerdict;
      t.played = ok || v === "queue"; // its verdict resolves it (exempt from the P2 gap)
      t.token = ok ? director.token : null; // (a queued one gets its token when it starts)
      t.shown = t.played || v === "emote";
      if (t.shown) {
        markCooldown("h3");
        fired = true;
      }
    }
  }
  if (kind === "agent") {
    // H7: summon (skipped plays still track the pending agent)
    s.agentPending.add(id);
    if (focus && act && cooldownOk("h7", HK.H7_COOLDOWN)) {
      const ok = director.playOneShot("summon", { prio: 2, source: "hook:agent", degrade: "tool-agent" });
      const v = director.lastVerdict;
      if (ok || v === "queue") s.summoned = true;
      if (ok || v === "queue" || v === "emote") {
        markCooldown("h7");
        fired = true;
      }
    }
  }
  if (ev.cmd === "git-commit" && focus && act && cooldownOk("h9", HK.H9_COOLDOWN)) {
    if (hookPop("tool-git")) {
      markCooldown("h9");
      fired = true;
    }
  }
  if (ev.cmd === "git-push") {
    s.pushedThisRun = true;
    if (focus && act && cooldownOk("h10", HK.H10_COOLDOWN) && hookPop("sparkle")) {
      markCooldown("h10");
      fired = true;
    }
  }
  // H1: a tool emote when the kind changes (at most one per 30 s, never over a P0-P2 play)
  const bigPlay = director.liveActive() && director.live.prio <= 2;
  if (!fired && focus && act && !bigPlay && TOOL_EMOTE_KINDS.has(kind) && kind !== hookGlobal.lastPoppedKind && cooldownOk("h1", HK.H1_GAP)) {
    if (hookPop(`tool-${kind}`)) {
      hookGlobal.lastPoppedKind = kind;
      markCooldown("h1");
    }
  }
  if (focus && act) poseEval();
}

// H3's 30 s cap ran out without a verdict: back to the running pose, dots until the verdict
function fingersTimedOut(s, id) {
  director.afterPlay();
  const t = s.testPending.get(id);
  if (t && reactionsOn) {
    t.shown = true;
    showEmote("dots", { prio: 2, ms: HK.H3_DOTS });
  }
}

// PostToolUse (and PostToolUseFailure, if it is ever registered): H4-H6 for a pending test, H8
function hookPostTool(ev, s, focus, act) {
  const id = ev.toolUseId;
  let key = id;
  let t = id ? s.testPending.get(id) : null;
  if (!t && !id && ev.cmd === "test" && s.testPending.size) [key, t] = s.testPending.entries().next().value; // no ids: the oldest
  if (t) {
    s.testPending.delete(key);
    const failed = ev.verdict === "fail" || ev.ok === false || ev.event === "PostToolUseFailure";
    testResolved(s, t, failed ? "fail" : ev.verdict, focus, act);
  }
  if (ev.kind === "agent") {
    let had = false;
    if (id) had = s.agentPending.delete(id);
    else if (s.agentPending.size) had = s.agentPending.delete(s.agentPending.values().next().value);
    if (had && !s.agentPending.size) agentReturned(s, focus, act); // H8: the last one is back
  }
}

// A pending test got its verdict ("pass" | "fail" | "" = none)
function testResolved(s, t, verdict, focus, act) {
  if (t.shown) clearEmote("dots");
  if (verdict === "fail") {
    s.failedThisRun = true;
    if (focus) hookGlobal.cleanStreak = 0;
  }
  const resolves = t.played ? "fingers-crossed" : undefined;
  if (!focus || !act || (verdict !== "pass" && verdict !== "fail")) {
    endFingers(t); // H6 (or not ours to show): back to the running pose silently
    return;
  }
  if (verdict === "pass") {
    // H4: hop, a halo for 10 s, sparkle
    if (hookPlay("hop", { prio: 2, resolves, source: "hook:test", emote: "sparkle" })) setEventHat("halo", HK.H4_HALO);
    else endFingers(t);
    return;
  }
  // H5: sad + "Tests failed. We got this." [rain 6 s]
  if (!resolves && !cooldownOk("h5", HK.H5_COOLDOWN)) {
    endFingers(t);
    return;
  }
  const shown = hookPlay("sad", {
    prio: 2,
    ms: HK.H5_MS,
    resolves,
    source: "hook:test",
    bubble: { text: "Tests failed. We got this.", ms: HK.H5_MS },
    degrade: "rain",
    degradeMs: HK.H5_RAIN,
  });
  if (shown) markCooldown("h5");
  else endFingers(t);
}

// The fingers-crossed of test t, if it is still on screen (or queued), gives way to the running
// pose (or a queued reaction). Only one plays at a time (20 s apart), so t.played names it.
function endFingers(t) {
  if (!t || !t.played) return;
  const live = director.live;
  if (live && live.name === "fingers-crossed" && live.source === "hook:test" && (t.token == null || live.token === t.token)) {
    director.interrupt();
    director.afterPlay();
  }
  if (t.token == null && director.queue && director.queue.name === "fingers-crossed") director.queue = null;
}

// H8: summon-return when the last pending agent is back (resolving its own summon)
function agentReturned(s, focus, act) {
  const resolving = s.summoned;
  s.summoned = false;
  if (!focus || !act) return;
  if (!resolving && !cooldownOk("h8", HK.H8_COOLDOWN)) return;
  if (hookPlay("summon-return", { prio: 2, resolves: resolving ? "summon" : undefined, source: "hook:agent" })) markCooldown("h8");
}

// §4.4 inference: a Post that never came (a failing call is reported as PostToolUseFailure,
// which is not registered). Tests: a Stop / UserPromptSubmit, or a PreToolUse more than 500 ms
// after the test's own (not its parallel burst) while no agent is pending (subagent calls share
// the session id). Agents: the next Stop / UserPromptSubmit / SessionEnd; never a PreToolUse.
// The pending sets are cleared on Stop, UserPromptSubmit and SessionEnd after this ran.
function inferPending(s, cause, focus, act) {
  const now = Date.now();
  let failed = null;
  for (const [id, t] of [...s.testPending]) {
    if (cause === "PreToolUse" && (now - t.t <= HK.BURST_MS || s.agentPending.size)) continue;
    s.testPending.delete(id);
    if (cause === "SessionEnd") {
      if (t.shown) clearEmote("dots");
      continue;
    }
    if (!failed || t.played) failed = t; // one reaction for the lot (a played one resolves)
    else if (t.shown) clearEmote("dots");
  }
  if (failed) testResolved(s, failed, "fail", focus, act);
  if (cause !== "PreToolUse" && s.agentPending.size) {
    s.agentPending.clear();
    agentReturned(s, focus, act);
  }
  if (cause !== "PreToolUse") s.summoned = false;
}

// SessionStart: H15 compaction chomp, H16 fresh start, H17 welcome back
function hookSessionStart(ev, s, focus, act) {
  const sid = ev.sessionId;
  const src = ev.source;
  if (src !== "compact") {
    // a new, cleared or resumed conversation: nothing is pending any more
    s.inRun = false;
    s.testPending.clear();
    s.agentPending.clear();
    s.summoned = false;
  }
  if (!focus || !act) return;
  if (src === "compact" && cooldownOk("h15", HK.H15_COOLDOWN)) {
    const text = "Munched the old context!";
    const shown = hookPlay("chomp", { prio: 2, source: "hook:compact", bubble: { text, ms: 3000 }, degrade: "sparkle" });
    if (shown) {
      markCooldown("h15");
      claimBubble(sid, "SessionStart", text, 3000);
    }
  } else if (src === "clear" && cooldownOk("h16", HK.H16_COOLDOWN)) {
    hookPop("sparkle", { force: true });
    claimBubble(sid, "SessionStart", "Fresh start!", 2500);
    markCooldown("h16");
  } else if (src === "resume" && !s.welcomed) {
    s.welcomed = true;
    claimBubble(sid, "SessionStart", "Welcome back!", 2500);
    // P4: after this hook's own status-update (its idle row would replace the wave at once)
    afterHookStatus(sid, "SessionStart", () =>
      director.playOneShot("waving", { prio: 4, ms: 1600, source: "hook:resume", emote: "hearts", emoteMs: 3000 }),
    );
  }
}

// H19 (disabled by LIMIT_ENABLED): sad until the next prompt or 10 min + "Out of juice…"
function hookLimit() {
  if (!cooldownOk("h19", HK.H19_COOLDOWN)) return;
  if (
    hookPlay("sad", {
      prio: 1,
      ms: 10 * 60000,
      source: "hook:limit",
      bubble: { text: "Out of juice. Back after the reset.", ms: 6000 },
      degrade: "rain",
    })
  )
    markCooldown("h19");
}

// Status path, after director.onStatus: H13 / H14 need the notification's text as a fallback
// (the tags never carry it), and H17 waits for its status-update. `woke`: this status woke a
// dozing / sleeping crab (§4.2 matrix, P1 × sleepStage > 0 = W: startle, then the row).
function hookAfterStatus(status, message, sessionId, event, woke) {
  const sid = sessionId || "";
  flushHookDeferred(sid, event);
  const s = hookSess.get(sid);
  if (!s || !s.rich) return;
  if (status === "waiting") {
    if (!s.waitingSince) s.waitingSince = Date.now();
  } else s.waitingSince = 0;
  if (!reactionsOn || event !== "Notification" || status !== "waiting") return;
  const nt = hookNtype(sid, event);
  const permission = nt ? nt === "permission_prompt" : PERMISSION_FALLBACK_RE.test(message);
  const idle = nt ? nt === "idle_prompt" : IDLE_PROMPT_RE.test(message);
  if (permission) {
    if (woke && !hiddenMode) director.playOneShot("startle", { prio: 1, restart: true, source: "hook:prompt-wake" });
    startPromptWatch(sid);
  } else if (idle && hiddenMode && director.isFocus(sid) && cooldownOk("h14", HK.H14_COOLDOWN)) {
    // H14: the bubble is hidden while peeking, so a question mark says it
    if (hookPop("question")) markCooldown("h14");
  }
}

// H13: a permission prompt (any session). hiddenMode: bang now and every 20 s. After 30 s with
// no hook from that session: nervous (sweat in hiddenMode), once per prompt, until its next hook.
function startPromptWatch(sid) {
  if (promptWatch.sid === sid) return; // already watching this prompt (escalation once per prompt)
  endPromptWatch();
  promptWatch.sid = sid;
  promptWatch.at = Date.now();
  promptWatch.escalated = false;
  if (hiddenMode) showEmote("bang", { prio: 1 });
  promptWatch.bangTimer = setInterval(() => {
    if (hiddenMode && !promptWatch.escalated && promptOpen()) showEmote("bang", { prio: 1 });
  }, HK.H13_BANG);
  promptWatch.timer = setTimeout(escalatePrompt, HK.H13_NERVOUS);
}

function promptOpen() {
  if (promptWatch.sid === null) return false;
  const st = director.sessStatus.get(promptWatch.sid);
  return !!st && st.status === "waiting" && !!st.prompt;
}

function escalatePrompt() {
  promptWatch.timer = null;
  if (!reactionsOn || !promptOpen()) {
    endPromptWatch();
    return;
  }
  promptWatch.escalated = true;
  clearInterval(promptWatch.bangTimer);
  promptWatch.bangTimer = null;
  if (hiddenMode) clearEmote("bang");
  director.playOneShot("nervous", { prio: 1, ms: HK.H13_NERVOUS_MAX, source: "hook:prompt", degrade: "sweat" });
}

function endPromptWatch() {
  clearTimeout(promptWatch.timer);
  clearInterval(promptWatch.bangTimer);
  promptWatch.timer = null;
  promptWatch.bangTimer = null;
  const was = promptWatch.sid;
  promptWatch.sid = null;
  promptWatch.escalated = false;
  if (was === null) return;
  if (director.queue && director.queue.o && director.queue.o.source === "hook:prompt") director.queue = null;
  const live = director.live;
  if (live && live.source === "hook:prompt") {
    director.interrupt();
    director.afterPlay();
  }
  clearEmote("sweat");
  clearEmote("bang");
}

// H2: the running pose follows the focus session's tools. A pose group qualifies after 2 PreToolUses
// in a row or 1.5 s; a pose holds at least 8 s. The change shows when the status row is running.
function poseEval() {
  clearTimeout(pose.timer);
  pose.timer = null;
  if (!reactionsOn) return;
  const s = hookSess.get(director.focusSession() || "");
  if (!s || !s.poseGroup || s.poseGroup === pose.current) return;
  const now = Date.now();
  const dwellAt = s.kindRun >= 2 ? now : s.kindSince + HK.POSE_DWELL;
  const at = Math.max(dwellAt, pose.since + HK.POSE_HOLD);
  if (at > now) {
    pose.timer = setTimeout(poseEval, at - now + 10);
    return;
  }
  pose.current = s.poseGroup;
  pose.since = now;
  if (director.rowStatus === "running") director.requestStatusRow();
}

// A new run (prompt) or its end (Stop): typing again, and the next pose may follow at once.
// `silent`: the hook's own status-update, right behind, applies the row (no one-frame flash).
function resetPose(silent) {
  clearTimeout(pose.timer);
  pose.timer = null;
  const was = pose.current;
  pose.current = "typing";
  pose.since = 0;
  if (!silent && was !== "typing" && director.rowStatus === "running") director.requestStatusRow();
}

// H18: the completion variant for a focus-session Stop → completed, or null (Reactions Off, or a
// hook without tags: today's jumping / backflip roll). Counts the clean streak either way.
// A variant is a row with its loops, so "dance" (1 loop) and "dance x2" are different ones.
const VARIANT_SWAP = { hop: "jumping", jumping: "hop", backflip: "dance", dance: "backflip", "dance x2": "backflip" };
function hookCompletion(sessionId) {
  const s = hookSess.get(sessionId || "");
  if (!s || !s.rich) return null;
  const clean = !s.failedThisRun;
  hookGlobal.cleanStreak = clean ? hookGlobal.cleanStreak + 1 : 0;
  if (!reactionsOn) return null;
  const now = hookClock();
  const L = now - (s.runStart || now);
  const last = hookGlobal.lastVariant;
  let key;
  if (hookGlobal.cleanStreak >= 3 && clean && (s.pushedThisRun || L >= 10 * 60000) && last !== "cool") key = "cool";
  else {
    const band = L < 20000 ? ["hop"] : L < 3 * 60000 ? ["hop", "jumping"] : L < 15 * 60000 ? ["backflip", "dance"] : ["dance x2"];
    let options = band.filter((k) => k !== last);
    if (!options.length) options = [VARIANT_SWAP[last] || "hop"];
    key = options[Math.floor(Math.random() * options.length)];
  }
  hookGlobal.lastVariant = key;
  return key === "dance x2" ? { row: "dance", loops: 2 } : { row: key, loops: 1 };
}

// H20 / H21: the Auto work hats of the focus session (Reactions On). Wizard in plan mode while it
// runs or waits (at most one change per 10 s), then headband after 8 min of running, hardhat
// after 2 min.
function autoWorkHat() {
  if (!reactionsOn) {
    wizardHat.on = false;
    return null;
  }
  const sid = director.focusSession() || "";
  const s = hookSess.get(sid);
  const now = hookClock();
  const live = !!s && s.rich && Math.abs(now - s.lastHookAt) < HK.STALE_MS;
  const st = director.sessStatus.get(sid);
  const status = st ? st.status : "";
  if (wizardFlip(live && s.mode === "plan" && (status === "running" || status === "waiting"))) return "wizard";
  if (live && s.inRun && s.runStart) {
    const L = now - s.runStart;
    if (L >= HK.H20_HEADBAND) return "headband";
    if (L >= HK.H20_HARDHAT) return "hardhat";
  }
  return null;
}

function wizardFlip(want) {
  const w = wizardHat;
  const now = Date.now();
  if (want !== w.on) {
    if (now - w.changedAt >= HK.H21_CHANGE) {
      w.on = want;
      w.changedAt = now;
    } else if (!w.timer) {
      w.timer = setTimeout(() => {
        w.timer = null;
        refreshHat();
      }, HK.H21_CHANGE - (now - w.changedAt) + 20);
    }
  }
  return w.on;
}

// H15-H17 speak for their SessionStart: the text replaces the generic "Idle…" of that hook's own
// status bubble (so it also replaces that session's older status bubble, e.g. a sticky idle
// reminder, as "Idle…" would have). If main holds that status back (another session is busy),
// the text shows as a P4 reaction bubble instead.
function claimBubble(sid, event, text, ms) {
  const claim = { sid: sid || "", event, text, ms, until: Date.now() + 1500 };
  hookGlobal.bubbleClaim = claim;
  afterHookStatus(sid, event, () => {
    if (hookGlobal.bubbleClaim !== claim) return; // the status bubble said it
    hookGlobal.bubbleClaim = null;
    showSpeech(text, ms, { prio: 4, kind: "reaction" });
  });
}
function bubbleClaimed(sid, event) {
  const c = hookGlobal.bubbleClaim;
  if (!c || c.until < Date.now() || c.sid !== (sid || "") || c.event !== event) return null;
  hookGlobal.bubbleClaim = null;
  return c;
}

// Run fn right after this hook's status-update, or after 150 ms when none comes (main holds a
// SessionStart idle back while another session is busy, and drops a status identical to the last)
function afterHookStatus(sid, event, fn) {
  const d = { sid: sid || "", event, fn, timer: null };
  d.timer = setTimeout(() => runHookDeferred(d), 150);
  hookGlobal.deferred.push(d);
}
function runHookDeferred(d) {
  const i = hookGlobal.deferred.indexOf(d);
  if (i < 0) return;
  hookGlobal.deferred.splice(i, 1);
  clearTimeout(d.timer);
  try {
    d.fn();
  } catch (e) {
    noteError(`hook deferred ${d.event}: ${(e && e.message) || e}`);
  }
}
function flushHookDeferred(sid, event) {
  for (const d of hookGlobal.deferred.filter((x) => x.sid === sid && x.event === event)) runHookDeferred(d);
}

// main's session list changed: states of sessions that are gone are dropped a little later (the
// session's own SessionEnd hook, which arrives after the list update, still runs its inference)
function hookSessionsChanged(ids) {
  if (!Array.isArray(ids)) return;
  const alive = new Set(ids);
  const now = Date.now();
  for (const [sid, s] of [...hookSess]) {
    if (!sid || alive.has(sid)) {
      s.gone = 0;
      continue;
    }
    if (promptWatch.sid === sid) endPromptWatch();
    if (!s.gone) s.gone = now;
    else if (now - s.gone >= HK.GONE_MS) hookSess.delete(sid);
  }
  setTimeout(() => {
    for (const [sid, s] of [...hookSess]) if (s.gone && Date.now() - s.gone >= HK.GONE_MS) hookSess.delete(sid);
  }, HK.GONE_MS + 50);
}

// Reactions menu toggle (pet-config.json {reactions})
function setReactions(on) {
  reactionsOn = !!on;
  if (window.ccPet && window.ccPet.setConfig) window.ccPet.setConfig({ reactions: reactionsOn }).catch(() => {});
  if (!reactionsOn) quietHookReactions();
  refreshHat();
}

// Reactions Off: whatever a hook started gives way now (row, queue, emote, pose, event hat, wizard)
const HOOK_EMOTES = new Set(["bang", "question", "bangq", "sweat", "hearts", "bulb", "dots", "sparkle", "rain", "tool-read", "tool-edit", "tool-shell", "tool-web", "tool-agent", "tool-git"]);
function quietHookReactions() {
  endPromptWatch();
  for (const d of hookGlobal.deferred.splice(0)) clearTimeout(d.timer);
  if (director.queue && isHookPlay(director.queue.o)) director.queue = null;
  if (isHookPlay(director.live)) {
    director.interrupt();
    director.afterPlay();
  }
  if (emote.name && HOOK_EMOTES.has(emote.name)) clearEmote();
  if (eventHat) eventHat = null;
  clearTimeout(wizardHat.timer);
  wizardHat.timer = null;
  wizardHat.on = false;
  resetPose();
}

// For GET /debug/state
function hookDebug() {
  const now = Date.now();
  const s = hookSess.get(director.focusSession() || "");
  return {
    received: { ...hookGlobal.received },
    pose: pose.current,
    poseAgeMs: pose.since ? now - pose.since : null,
    cleanStreak: hookGlobal.cleanStreak,
    lastVariant: hookGlobal.lastVariant,
    lastPoppedKind: hookGlobal.lastPoppedKind,
    idleMs: hookClock() - hookGlobal.lastWorkAt,
    prompt: promptWatch.sid !== null ? { sessionId: promptWatch.sid, ageMs: now - promptWatch.at, escalated: promptWatch.escalated } : null,
    wizard: wizardHat.on,
    sessions: hookSess.size,
    focus: s
      ? {
          runMs: s.runStart ? hookClock() - s.runStart : null,
          inRun: s.inRun,
          toolCalls: s.toolCalls,
          lastKind: s.lastKind,
          poseGroup: s.poseGroup,
          kindRun: s.kindRun,
          testPending: s.testPending.size,
          agentPending: s.agentPending.size,
          summoned: s.summoned,
          failedThisRun: s.failedThisRun,
          pushedThisRun: s.pushedThisRun,
          mode: s.mode,
          waitingMs: s.waitingSince ? now - s.waitingSince : null,
        }
      : null,
  };
}

// ── Claude Code status ─────────────────────────────────────

let runningStartedAt = 0;
let coffeeTimer = null;

function handleStatusUpdate(engine, data) {
  const { status, message, sessionId, event } = data || {};
  const prev = currentCCStatus;
  currentCCStatus = status;
  let woke = false;

  if (status !== "idle") {
    stopPetting(engine, true);
    cancelStroll(false); // kind-aware: a crab in the air still lands
    if (sleepStage) {
      sleepStage = 0; // work (from any session) wakes the crab
      woke = true;
    }
  } else {
    scheduleStroll();
  }

  // Long-run bookkeeping: coffee sips every 25 min while running, stretch after ≥30 min
  if (status === "running" && prev !== "running") {
    runningStartedAt = Date.now();
    if (coffeeTimer) clearInterval(coffeeTimer);
    coffeeTimer = setInterval(() => {
      if (currentCCStatus !== "running" || moveTimer || hiddenMode) return;
      director.playOneShot("coffee", { prio: 4, ms: 3800 });
    }, COFFEE_EVERY_MS);
  } else if (status !== "running" && coffeeTimer) {
    clearInterval(coffeeTimer);
    coffeeTimer = null;
  }
  const longRun = prev === "running" && runningStartedAt && Date.now() - runningStartedAt > LONG_RUN_MS;

  if (waitingBlinkTimer) {
    clearInterval(waitingBlinkTimer);
    waitingBlinkTimer = null;
  }

  const drove = director.onStatus(status, message || "", sessionId || "", event || "");
  // A background session's hook woke the crab but set no row: leave the doze / sleep row too
  if (woke && !drove) director.requestStatusRow();
  syncWaitingBlink(); // on while any session's P1 prompt is the status bubble
  hookAfterStatus(status, message || "", sessionId || "", event || "", woke); // H13 / H14, deferred H17
  refreshHat(); // hats are re-resolved on every status change (Auto work rules H20 / H21)

  if (longRun && (status === "completed" || status === "idle")) {
    setTimeout(() => {
      if (currentCCStatus === status && !moveTimer) director.playOneShot("stretch", { prio: 4, ms: 3200 });
    }, status === "completed" ? 5200 : 300);
  }
}

// ── Concurrent sessions badge ──────────────────────────────

function handleSessionsUpdate({ count, names, ids }) {
  sessionCount = count || 0;
  director.sessionsChanged(ids);
  hookSessionsChanged(ids);
  const badge = document.getElementById("session-badge");
  if (!badge) return;
  if (count >= 2) {
    badge.textContent = String(count);
    badge.title = (names || []).join(", ");
    badge.classList.add("show");
  } else {
    badge.classList.remove("show");
  }
}

// ── Sleep cycle + sitting reminder (system-wide idle time, every 10s) ──

let activeSince = 0;

function trackSitting(engine, idleSeconds) {
  const now = Date.now();
  if (idleSeconds >= BREAK_IDLE_S) {
    activeSince = 0; // took a break
    return;
  }
  if (idleSeconds < 60 && !activeSince) activeSince = now;
  if (activeSince && now - activeSince >= SIT_REMIND_MS) {
    activeSince = now; // remind again after another stretch of activity
    remindStretch(engine);
  }
}

function remindStretch(engine) {
  const text = "Stretch break? 🙆 50 min in.";
  if (hiddenMode) {
    try {
      new Notification("🦀 Stretch break?", { body: "You've been at it for 50 minutes." });
    } catch (e) {
      /* ignore */
    }
    return;
  }
  // The bubble always shows; the row is an ambient play (dropped while walking, petting, …)
  showSpeech(text, 5000);
  if (currentCCStatus !== "idle" || climbSide) return;
  director.playOneShot("stretch", { prio: 4, ms: 3200 });
  setTimeout(scheduleStroll, 3200);
}

function handleSystemIdle(engine, seconds) {
  if (!sleepStage) napUntil = 0; // woken some other way: the nap is over
  if (seconds < 10 && !cw.armed) cwArm("idle"); // D10: the user is active → cursor-watch may run
  maybeStealCursor(engine, seconds);
  trackSitting(engine, seconds);

  if (currentCCStatus !== "idle" || hiddenMode || isDragging || menuOpen || petting) {
    if (sleepStage) {
      sleepStage = 0;
      director.requestStatusRow();
    }
    return;
  }
  // D15: a yawn on the way to dozing (idle 150 s; doze follows at 180 s as before)
  if (
    seconds >= YAWN_AT_S &&
    seconds < DOZE_AFTER_S &&
    !sleepStage &&
    engine.currentState === "idle" &&
    !moveTimer &&
    !restTimer &&
    cooldownOk("yawn", YAWN_COOLDOWN_MS)
  ) {
    markCooldown("yawn");
    director.playOneShot("yawn", { prio: 4 });
    return;
  }
  if (seconds >= SLEEP_AFTER_S && sleepStage < 2) {
    cancelStroll(false);
    if (climbSide || moveTimer) return; // wait until back on the floor
    sleepStage = 2;
    showSpeech("", 0);
    engine.applyState("sleep");
  } else if (seconds >= DOZE_AFTER_S && sleepStage < 1) {
    cancelStroll(false);
    if (climbSide || moveTimer) return;
    sleepStage = 1;
    showSpeech("", 0);
    engine.applyState("doze");
  } else if (seconds < 15 && sleepStage > 0 && Date.now() >= napUntil) {
    napUntil = 0;
    const wasAsleep = sleepStage === 2;
    sleepStage = 0;
    showSpeech(wasAsleep ? greeting() : "Huh? I'm awake!", 2500);
    if (!director.playOneShot("stretch", { prio: 4, ms: 3200 })) director.requestStatusRow();
    setTimeout(scheduleStroll, 3200);
  }
}

// Every 10 min, 25% chance of a short time-of-day greeting while idle
function setupGreetings(engine) {
  setInterval(() => {
    if (currentCCStatus !== "idle" || hiddenMode || sleepStage || moveTimer || menuOpen || petting) return;
    if (engine.currentState !== "idle") return;
    if (Math.random() < 0.25) showSpeech(greeting(), 3500, { prio: 4 });
  }, 10 * 60 * 1000);
}

// ── Saved pet pack ─────────────────────────────────────────

async function loadSavedPet(engine) {
  try {
    const petId = await window.ccPet.getCurrentPetId();
    if (!petId) return;
    const pets = await window.ccPet.listPets();
    const pet = pets.find((p) => p.id === petId);
    if (!pet) return;
    const petDir = await window.ccPet.getPetDir(petId);
    const fileUrl = "file:///" + (petDir + "/" + pet.spritesheetPath).replace(/\\/g, "/");
    try {
      const resp = await fetch(fileUrl, { method: "HEAD" });
      if (!resp.ok) return;
    } catch (e) {
      return;
    }
    if (await engine.setSpritesheet(fileUrl)) console.log(`[CCPet] loaded saved pet: ${pet.displayName}`);
  } catch (e) {
    console.warn("[CCPet] loading saved pet failed:", e);
  }
}

// ── File chomp (D18 / F6) ──────────────────────────────────
// A file dragged over the crab: the lid opens and holds (chomp-open). Dropped: it gets eaten
// (chomp) and the crab reports what it tasted: main's inspect-file reads only sizes and counts.

const FLAVOURS = { ".py": "Tastes like Python!", ".md": "Papery!", ".json": "Crunchy!", ".ts": "A strongly typed snack!" };

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function chompReport(r, count) {
  const more = count > 1 ? ` (+${count - 1} more)` : "";
  if (!r || r.error) return "Couldn't taste that 🤔";
  if (r.kind === "dir") {
    const n = r.capped ? "5,000+" : r.count.toLocaleString("en-US");
    return `A whole folder? ${n} files${r.ext ? `, mostly ${r.ext}` : ""}${more}`;
  }
  if (r.kind === "big") return `Too big to chew (${Math.round(r.size / 1048576)} MB)`;
  if (r.kind === "binary") return "Can't digest binaries.";
  const lines = `${r.lines.toLocaleString("en-US")} line${r.lines === 1 ? "" : "s"}`;
  return `${FLAVOURS[r.ext] || "Crunchy!"} ${r.name}: ${lines}, ${formatBytes(r.size)}${more}`;
}

function setupFileDrop(engine) {
  let active = false;
  let leaveTimer = null;
  const hasFiles = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");

  const begin = () => {
    if (active) return;
    if (isDragging || hiddenMode || isMustFinish() || stealing) return;
    active = true;
    cancelStroll(false);
    stopPetting(engine, true);
    director.interrupt();
    // §4.2: sleepStage > 0 × P0 = play and wake. The hold bypasses playOneShot/_start, so wake here
    // too, or the leave path's requestStatusRow() drops straight back into 'sleep'.
    if (sleepStage) {
      sleepStage = 0;
      napUntil = 0;
    }
    director.live = { token: director.token, name: "chomp-open", prio: 0, until: Infinity, then: null, source: "file" };
    engine.hold("chomp-open");
    showSpeech("Ooh, food?", 2500);
  };
  const end = (restore) => {
    clearTimeout(leaveTimer);
    leaveTimer = null;
    if (!active) return;
    active = false;
    if (director.live && director.live.source === "file") director.live = null;
    if (restore && engine.currentState === "chomp-open") director.requestStatusRow();
  };
  // dragover keeps firing while a file hovers; when it stops, the file went away
  const armLeave = () => {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => end(true), 350);
  };

  // Guards: the page itself must never navigate to a dropped file (main also blocks will-navigate)
  document.addEventListener("dragenter", (e) => {
    e.preventDefault();
    if (hasFiles(e)) {
      begin();
      armLeave();
    }
  });
  document.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!hasFiles(e)) return;
    e.dataTransfer.dropEffect = "copy";
    begin();
    armLeave();
  });
  document.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget) armLeave();
  });
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    const wasActive = active;
    end(false);
    if (!files.length) {
      if (wasActive) director.requestStatusRow();
      return;
    }
    let p = "";
    try {
      p = window.ccPet && window.ccPet.pathForFile ? window.ccPet.pathForFile(files[0]) : "";
    } catch (err) {
      p = "";
    }
    chompFile(p, files.length);
  });
}

// Eat a dropped file: chomp, then the report bubble, then the status row (the drop handler and
// POST /debug/drop both come here)
function chompFile(p, count) {
  const report = p && window.ccPet && window.ccPet.inspectFile ? window.ccPet.inspectFile(p).catch(() => null) : Promise.resolve(null);
  const played = director.playOneShot("chomp", {
    prio: 0,
    restart: true,
    source: "file",
    then: () => {
      director.afterPlay();
      report.then((r) => showSpeech(chompReport(r, count), 4500));
    },
  });
  return { played, report };
}

// ── Debug bridge (dev / unpackaged only: main registers the /debug/* routes) ──

// The last few uncaught renderer errors, reported by /debug/state (QA catches silent breakage)
const recentErrors = [];
function noteError(msg) {
  recentErrors.push(`${new Date().toISOString().slice(11, 19)} ${String(msg).slice(0, 300)}`);
  if (recentErrors.length > 10) recentErrors.shift();
}
window.addEventListener("error", (e) => noteError(e.message || e.error || "error"));
window.addEventListener("unhandledrejection", (e) => noteError((e.reason && e.reason.message) || e.reason || "rejection"));

function anchorFlags(base, frame) {
  const a = META.anchors && META.anchors[base];
  const f = a && a[frame];
  return f ? f[3] : null;
}

function pickBox(b, keys) {
  const o = {};
  for (const k of keys) o[k] = b[k];
  return o;
}

function debugState(engine) {
  const e = engine.debugInfo();
  const now = Date.now();
  const cd = {};
  for (const [k, t] of Object.entries(cooldowns)) cd[k] = Math.round((now - t) / 1000);
  return {
    anim: e.anim,
    frame: e.frame,
    pos: e.pos,
    frames: e.frames,
    flip: e.flip,
    peek: e.peek,
    row: e.row,
    base: e.base,
    fallbackUsed: e.fallbackUsed,
    held: e.held,
    ended: e.ended,
    plays: e.plays,
    breathing: e.breathing,
    shakes: shakeCount,
    shown: e.shown,
    prio: director.liveActive() ? director.live.prio : null,
    live: director.liveActive() ? director.live.name : null,
    token: director.token,
    queued: director.queue ? { name: director.queue.name, prio: director.queue.prio } : null,
    lastVerdict: director.lastVerdict, // what the last playOneShot did: play / queue / emote / drop / gap
    sinceP2Ms: director.lastP2At ? now - director.lastP2At : null,
    statusDirty: director.statusDirty,
    status: currentCCStatus,
    rowStatus: director.rowStatus,
    rowSession: director.rowSession,
    moveKind,
    moving: !!moveTimer,
    resting: !!restTimer,
    hat: currentHat,
    hatChoice,
    wardrobe: engine.builtIn && !!hatMeta() && !!OVERLAY, // the menu greys out when false
    hatSource: debugHat ? "debug" : eventHat && eventHat.until > now ? "event" : hatChoice,
    emote: emote.name,
    emoteInfo: emote.name ? { prio: emote.prio, col: emote.col, faded: emote.faded, ageMs: now - emote.startedAt } : null,
    overlay: {
      shown: ov.frame ? { display: ov.frame.display, base: ov.frame.base, frame: ov.frame.frame, flip: ov.frame.flip } : null,
      shownFlags: ov.frame ? anchorFlags(ov.frame.base, ov.frame.frame) : null,
      hat: ov.hat ? pickBox(ov.hat, ["visible", "left", "top", "targetTop", "col", "mirror", "reason"]) : null,
      emote: ov.emote ? pickBox(ov.emote, ["visible", "left", "top", "anchor", "rotate", "reason"]) : null,
      bubbleVisible: bubbleVisible(),
      badgeVisible: badgeVisible(),
    },
    cursorWatch: { armed: cw.armed, source: cw.source, peeking: cw.peeking, frame: cw.frame, blinking: cw.blinking },
    win: { x: Math.round(windowPosX), y: Math.round(windowPosY), headX: Math.round(windowPosX + WIN_W / 2), headY: Math.round(windowPosY + 227) },
    flags: e.base != null ? anchorFlags(e.base, e.frame) : null,
    rowsAvailable: engine.rowsAvailable,
    colsAvailable: engine.colsAvailable,
    skin: engine.builtIn ? "built-in" : String(engine.skinUrl).split(/[\\/]/).pop(),
    meta: !!META.meta,
    sleepStage,
    hiddenMode,
    climbSide,
    perched: !!perched,
    petting,
    dragging: isDragging,
    menuOpen,
    stealing,
    focusSession: director.focusSession(),
    sessions: sessionCount,
    cooldowns: cd, // seconds since each last fired
    reactions: reactionsOn,
    hooks: hookDebug(),
    mischief: mischiefEnabled,
    roam: roamEnabled,
    bubble:
      liveSpeech && liveSpeech.until > now
        ? { text: liveSpeech.typing ? "(typing)" : liveSpeech.text, prio: liveSpeech.prio, kind: liveSpeech.kind, sessionId: liveSpeech.sessionId }
        : null,
    pendingStatusBubble:
      pendingStatusBubble && pendingStatusBubble.until > now
        ? { text: pendingStatusBubble.typing ? "(typing)" : pendingStatusBubble.text, prio: pendingStatusBubble.prio, sessionId: pendingStatusBubble.sessionId }
        : null,
    fakeDate: fakeClock ? nowDate().toISOString() : null,
    errors: recentErrors.slice(),
  };
}

async function runDebug(engine, cmd, args) {
  switch (cmd) {
    case "anim": {
      // P0 with restart, bypassing the director; `frame` holds that frame; `ms` then the status row.
      // QA extras: {unpeek:true}; {name, frame, peek:true, breathe} shows a display-only peek.
      if (args.unpeek) {
        engine.unpeek();
        return { ok: true, peek: null };
      }
      // QA extra: {climb:"left"|"right"|"none", hidden:bool} sets the climb / edge-hiding pose in
      // place (classes and flags only, the window never moves), so overlays can be captured in it
      if (args.climb != null || args.hidden != null) {
        if (args.climb != null) {
          clearClimb();
          if (args.climb === "left" || args.climb === "right") {
            climbSide = args.climb;
            const c = document.getElementById("pet-container");
            if (c) c.classList.add(`climb-${args.climb}`);
          }
        }
        if (args.hidden != null) hiddenMode = !!args.hidden;
        renderOverlays();
        if (!args.name) return { ok: true, climbSide, hiddenMode };
      }
      const name = String(args.name || "");
      if (!engine.atlas.animations[name]) return { ok: false, error: `unknown animation: ${name}` };
      if (args.peek) {
        const ok = engine.peek(name, Number(args.frame) || 0, { flip: !!args.flip, breathe: !!args.breathe });
        return { ok, peek: engine.debugInfo().peek, anim: engine.currentState };
      }
      director.interrupt();
      const flip = !!args.flip;
      if (args.frame != null) engine.hold(name, Number(args.frame) || 0, { flip });
      else engine.applyState(name, { flip, restart: true });
      if (args.ms) {
        const token = director.token;
        setTimeout(() => {
          if (director.token === token && engine.currentState === name) director.requestStatusRow();
        }, Number(args.ms));
      }
      const r = engine.cur;
      return { ok: true, row: r.row, frames: r.indices.length, fallbackUsed: r.fallbackUsed || false };
    }
    case "emote": {
      // {name|null, ms?, prio?}: at P0 by default, so it always replaces what is showing
      const name = args.name || null;
      if (name && !(emoteMeta() && emoteMeta().list[name])) return { ok: false, error: `unknown emote: ${name}`, meta: !!emoteMeta() };
      const ms = args.ms != null && Number.isFinite(Number(args.ms)) ? Number(args.ms) : undefined;
      const started = showEmote(name, { ms, prio: args.prio != null ? Number(args.prio) : 0, force: true });
      return { ok: true, started, emote: emote.name, drawn: !!(OVERLAY && emoteMeta()) };
    }
    case "hat": {
      // {id|null}: a temporary override, not persisted; "none" forces no hat, null clears it
      const id = args.id == null || args.id === "" ? null : String(args.id);
      if (id && id !== "none" && !(hatMeta() && hatMeta().list[id])) return { ok: false, error: `unknown hat: ${id}`, meta: !!hatMeta() };
      debugHat = id;
      refreshHat();
      return { ok: true, hat: currentHat, override: debugHat, drawn: !!(OVERLAY && hatMeta()) };
    }
    case "date":
      if (args.iso) {
        const t = Date.parse(args.iso);
        if (Number.isNaN(t)) return { ok: false, error: "bad iso date" };
        fakeClock = { base: t, setAt: Date.now() };
      } else fakeClock = null;
      refreshHat();
      return { ok: true, now: nowDate().toISOString(), fake: !!fakeClock, night: isNight(), hat: currentHat };
    case "cursor": {
      // main already overrides get-cursor for 60 s; {armed:false} (a null body) stops watching
      if (!args.armed) {
        cwStop();
        return { ok: true, armed: false };
      }
      if (!lastWorkArea) await workArea();
      const armed = cwArm("debug");
      return { ok: true, armed, why: armed ? null : "cursor-watch conditions not met (idle, on the ground, built-in sheet…)" };
    }
    case "skin": {
      const ok = await engine.setSpritesheet(args.reset ? BUILTIN_SHEET : String(args.file));
      return { ok, skin: engine.builtIn ? "built-in" : args.file, rowsAvailable: engine.rowsAvailable, colsAvailable: engine.colsAvailable };
    }
    case "state":
      return debugState(engine);
    case "drop": {
      // The real drop path minus the OS drag: F6 scenarios can feed it a .js, a .png, a folder
      const { played, report } = chompFile(String(args.path || ""), 1);
      const r = await report;
      return { ok: true, played, report: r, text: chompReport(r, 1) };
    }
    default:
      return { ok: false, error: `unknown debug command: ${cmd}` };
  }
}

function setupDebugBridge(engine) {
  if (!window.ccPet || !window.ccPet.onDebugCmd) return;
  window.ccPet.onDebugCmd(async (msg) => {
    const { id, cmd, args } = msg || {};
    let result;
    try {
      result = await runDebug(engine, cmd, args || {});
    } catch (e) {
      result = { ok: false, error: String((e && e.message) || e) };
    }
    window.ccPet.debugReply(id, result);
  });
}

// ── Init ───────────────────────────────────────────────────

function main() {
  window.__petDebug = false; // set true to log bubble layout metrics as [pet] console lines
  const spriteEl = document.getElementById("pet-sprite");
  if (!spriteEl) return;
  const engine = new PetEngine(spriteEl, CODEX_ATLAS);
  engineRef = engine;
  engine.resolveNext = () => director.statusRow();
  setupOverlays();
  // The single funnel: every frame on screen places the overlays (hat, emote)
  engine.onFrame = (display, base, frame, flip) => {
    // trot footprints fall on the foot plants of the 440 ms loop (frames 3 and 5)
    if (display === "trot" && base === "trot" && (frame === 3 || frame === 5)) trotFootprint(flip);
    overlayFrame(display, base, frame, flip);
  };
  if (engine.shown) overlayFrame(engine.shown.name, engine.shown.base, engine.shown.frame, engine.shown.flip);
  loadConfig(); // hat choice, birthday, reactions (pet-config.json)
  setInterval(refreshHat, 60 * 1000); // seasonal hats follow the clock
  workArea(); // cursor-watch needs the floor line before the first stroll

  loadSavedPet(engine).catch(() => {});

  const petContainer = document.getElementById("pet-container");
  if (petContainer) {
    petContainer.classList.add("pet-entering");
    setTimeout(() => petContainer.classList.remove("pet-entering"), 700);
  }

  director.playOneShot("waving", { prio: 0, ms: 4000, restart: true, source: "startup" });
  showSpeech(greeting(), 3000);

  initWindowPos();
  setupDrag(engine);
  setupFileDrop(engine);
  setupGreetings(engine);
  setupRoaming(engine);
  setupDebugBridge(engine);

  if (window.ccPet) {
    // A hook's hook-event arrives just before its status-update (§4.6)
    if (window.ccPet.onHookEvent) window.ccPet.onHookEvent((data) => handleHookEvent(data));
    window.ccPet.onStatusUpdate((data) => handleStatusUpdate(engine, data));
    window.ccPet.onSystemIdle((seconds) => handleSystemIdle(engine, seconds));
    window.ccPet.onWindowsUpdate((data) => handleWindowsUpdate(data));
    if (window.ccPet.getWindows) window.ccPet.getWindows().then((d) => d && (windowsInfo = d)).catch(() => {});
    window.ccPet.onSessionsUpdate((data) => handleSessionsUpdate(data));
    window.ccPet.onFullscreenChange((active) => {
      if (active) enterHide();
      else if (!manualHide) exitHide();
    });
    window.ccPet.onTrayCommand((cmd) => {
      if (cmd === "usage") return showUsage(engine);
      closeUsageCard();
      if (cmd === "toggle-roam") toggleRoam();
      else if (cmd === "toggle-hide") toggleHide();
    });
    window.ccPet.onMenuAction((action) => runMenuAction(engine, action));
    // D10 arming: the pointer moving inside the pet window
    document.addEventListener("mousemove", () => {
      if (!cw.armed) cwArm("mouse");
    });
    window.ccPet.onMenuClosed(() => {
      menuOpen = false;
      director.flagCleared(); // a status row deferred while the menu was open
      scheduleStroll();
    });
  }

  console.log("Claw'd engine initialized");
}

main();
