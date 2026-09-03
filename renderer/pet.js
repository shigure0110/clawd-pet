// ── Claw'd desktop pet engine ────────────────────────────────
// Codex Pet Standard sprite sheet (8 cols × 192×208 cells), rows 0–8 standard,
// rows 9+ are our extensions (laptop, flower, snacks, gaming, backflip, sleep…).

// ── Sprite atlas ──

const CODEX_ATLAS = {
  columns: 8,
  rows: 22,
  cellWidth: 192,
  cellHeight: 208,
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
    typing: { row: 9, frames: 6, frameDurations: [130, 130, 130, 130, 130, 200] },
    flower: { row: 10, frames: 6, frameDurations: [260, 260, 260, 260, 180, 260] },
    coffee: { row: 11, frames: 6, frameDurations: [320, 320, 420, 420, 300, 320] },
    water: { row: 12, frames: 6, frameDurations: [320, 320, 420, 420, 300, 320] },
    fries: { row: 13, frames: 6, frameDurations: [300, 260, 320, 300, 260, 320] },
    sausage: { row: 14, frames: 6, frameDurations: [320, 300, 340, 300, 340, 400] },
    gaming: { row: 15, frames: 6, frameDurations: [140, 140, 160, 140, 160, 140] },
    backflip: { row: 16, frames: 8, frameDurations: [160, 90, 90, 90, 90, 90, 90, 260] },
    doze: { row: 17, frames: 6, frameDurations: [600, 500, 500, 700, 500, 600] },
    sleep: { row: 18, frames: 6, frameDurations: [400, 400, 400, 400, 400, 400] },
    stretch: { row: 19, frames: 6, frameDurations: [260, 260, 420, 420, 260, 300] },
    phone: { row: 20, frames: 6, frameDurations: [300, 300, 300, 300, 200, 300] },
    petted: { row: 21, frames: 6, frameDurations: [220, 220, 220, 220, 220, 220] },
  },
};

// Claude Code status → animation
const STATUS_TO_ANIMATION = {
  idle: "idle",
  running: "typing",
  waiting: "waiting",
  completed: "jumping",
  error: "failed",
};

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

function openClaude(engine) {
  engine.applyState("waving");
  showSpeech("Opening Claude 💬", 1500);
  if (window.ccPet && window.ccPet.openClaude) window.ccPet.openClaude();
  setTimeout(() => {
    if (engine.currentState === "waving") engine.applyState(stateForStatus());
  }, 1600);
}

// ── PetEngine ──────────────────────────────────────────────

class PetEngine {
  constructor(spriteEl, atlas) {
    this.spriteEl = spriteEl;
    this.atlas = atlas;
    this.currentState = "idle";
    this.currentFrame = 0;
    this.timerHandle = null;
    this.applyState("idle");
  }

  applyState(state) {
    const anim = this.atlas.animations[state];
    if (!anim) {
      console.warn(`Unknown state: ${state}, falling back to idle`);
      if (state !== "idle") this.applyState("idle");
      return;
    }
    this.stop();
    this.currentState = state;
    this.currentFrame = 0;
    this.showFrame(0);
    this.startLoop();
  }

  showFrame(index) {
    const anim = this.atlas.animations[this.currentState];
    const x = index * this.atlas.cellWidth;
    const y = anim.row * this.atlas.cellHeight;
    this.spriteEl.style.backgroundPosition = `-${x}px -${y}px`;
  }

  startLoop() {
    const anim = this.atlas.animations[this.currentState];
    const advance = () => {
      this.currentFrame = (this.currentFrame + 1) % anim.frames;
      this.showFrame(this.currentFrame);
      this.timerHandle = window.setTimeout(advance, anim.frameDurations[this.currentFrame]);
    };
    this.timerHandle = window.setTimeout(advance, anim.frameDurations[0]);
  }

  stop() {
    if (this.timerHandle !== null) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }

  setSpritesheet(url) {
    this.spriteEl.style.backgroundImage = `url("${url}")`;
    this.applyState("idle");
  }
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

function showSpeech(text, durationMs) {
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
    return;
  }
  bubbleText.textContent = text;
  bubble.classList.add("show-bubble");
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
  }, durationMs);
}

function showTyping(durationMs) {
  const bubble = document.getElementById("pet-speech-bubble");
  const bubbleText = bubble ? bubble.querySelector(".bubble-text") : null;
  if (!bubble) return;
  if (speechTimer) {
    clearTimeout(speechTimer);
    speechTimer = null;
  }
  if (hiddenMode) {
    bubble.classList.remove("show-bubble");
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
  speechTimer = setTimeout(() => {
    bubble.classList.remove("show-bubble");
    const t = bubble.querySelector(".bubble-typing");
    if (t) t.remove();
    speechTimer = null;
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
let petting = false;

function stateForStatus() {
  if (currentCCStatus !== "idle") return STATUS_TO_ANIMATION[currentCCStatus] || "idle";
  if (sleepStage === 2) return "sleep";
  if (sleepStage === 1) return "doze";
  if (hiddenMode) return "gaming"; // tucked away during a fullscreen app → headphones + gamepad
  return "idle";
}

// ── Usage: today's tokens + API-equivalent cost ───────────

function formatTokens(n) {
  if (!n) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

async function showUsage(engine) {
  engine.applyState("waving");
  showSpeech("Checking the books… 🦀", 999999);
  try {
    const u = await window.ccPet.getUsage();
    if (!u || u.error) {
      showSpeech("Couldn't read today's usage 🤔", 3000);
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
  setTimeout(() => {
    if (engine.currentState === "waving") engine.applyState(stateForStatus());
  }, 2600);
}

// ── Roaming: walk the bottom edge, climb walls, fall, tuck away ──

const WIN_W = 300;
const WIN_H = 280;

let engineRef = null;
let roamEnabled = true;
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
}

// Stops any walk/climb/fall/rest in progress; pending promises resolve false.
function stopMovement() {
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

function moveWindow(targetX, targetY, speed) {
  return new Promise((resolve) => {
    stopMovement();
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
        resolve(true);
        return;
      }
      setPos(windowPosX + (dx / dist) * speed, windowPosY + (dy / dist) * speed);
    }, 33);
  });
}

function rest(ms) {
  return new Promise((resolve) => {
    stopMovement();
    restResolve = resolve;
    restTimer = setTimeout(() => {
      restTimer = null;
      restResolve = null;
      resolve(true);
    }, ms);
  });
}

function fallToGround(groundY) {
  return new Promise((resolve) => {
    stopMovement();
    engineRef.applyState("jumping");
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
        moveTimer = null;
        moveResolve = null;
        engineRef.applyState(stateForStatus());
        resolve(true);
        return;
      }
      setPos(windowPosX, ny);
    }, 25);
  });
}

function cancelStroll(revertToIdle = true) {
  if (hiddenMode) return; // clinging to the edge is not a stroll — never interrupt it
  if (strollTimer) {
    clearTimeout(strollTimer);
    strollTimer = null;
  }
  const wasMoving = !!moveTimer;
  stopMovement();
  const wasClimbing = !!climbSide;
  clearClimb();
  if (wasClimbing && lastWorkArea && !isDragging) {
    fallToGround(groundYOf(lastWorkArea)); // lost grip → drop to the floor
    return;
  }
  if (revertToIdle && wasMoving && engineRef && engineRef.currentState.startsWith("running")) {
    engineRef.applyState("idle");
  }
}

function scheduleStroll(delay) {
  if (!roamEnabled || hiddenMode) return;
  if (strollTimer) clearTimeout(strollTimer);
  if (moveTimer || restTimer) return; // already busy
  strollTimer = setTimeout(attemptStroll, delay == null ? 6000 + Math.random() * 14000 : delay);
}

async function playFor(anim, ms) {
  engineRef.applyState(anim);
  const ok = await rest(ms);
  if (ok && engineRef.currentState === anim) engineRef.applyState("idle");
  return ok;
}

async function climbWall(side, wa) {
  const c = document.getElementById("pet-container");
  climbSide = side;
  if (c) c.classList.add(side === "left" ? "climb-left" : "climb-right");
  engineRef.applyState(side === "right" ? "running-right" : "running-left");

  const groundY = groundYOf(wa);
  const maxUp = Math.max(80, Math.min(groundY - wa.y - 20, 520));
  const targetY = groundY - (60 + Math.random() * (maxUp - 60));
  if (!(await moveWindow(windowPosX, targetY, 2))) return;

  engineRef.applyState("idle"); // hang out on the wall for a bit
  if (!(await rest(3000 + Math.random() * 5000))) return;

  engineRef.applyState(side === "right" ? "running-left" : "running-right");
  if (!(await moveWindow(windowPosX, groundY, 2.6))) return;

  clearClimb();
  engineRef.applyState("idle");
}

async function attemptStroll() {
  strollTimer = null;
  if (!roamEnabled || hiddenMode || sleepStage || petting) return;
  const busy = isDragging || menuOpen || currentCCStatus !== "idle";
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
  engineRef.applyState(dir > 0 ? "running-right" : "running-left");
  const ok = await moveWindow(targetX, groundY, 2.4);
  if (!ok) {
    if (engineRef.currentState.startsWith("running-")) engineRef.applyState(stateForStatus());
    scheduleStroll(10000);
    return;
  }
  if (climb) {
    await climbWall(climb, wa);
    scheduleStroll();
    return;
  }
  engineRef.applyState("idle");
  scheduleStroll();
}

async function settleAfterDrag() {
  const wa = await workArea();
  if (wa) {
    const groundY = groundYOf(wa);
    if (windowPosY < groundY - 4) await fallToGround(groundY);
  }
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
  hiddenMode = true;
  showSpeech("", 0);
  const groundY = groundYOf(wa);
  const edgeX = wa.x + wa.width - WIN_W; // window flush with the right edge
  if (wasClimbing && windowPosY < groundY - 4) await fallToGround(groundY);
  if (!hiddenMode) return;

  engineRef.applyState(edgeX > windowPosX ? "running-right" : "running-left");
  await moveWindow(edgeX, groundY, 3);
  if (!hiddenMode) return;

  const c = document.getElementById("pet-container");
  climbSide = "right";
  if (c) c.classList.add("climb-right");
  engineRef.applyState("running-right");
  await moveWindow(edgeX, groundY - HIDE_CLIMB_PX, 2); // up the wall
  if (!hiddenMode) return;
  await moveWindow(edgeX + HIDE_PEEK_PX, groundY - HIDE_CLIMB_PX, 1.5); // lower half off-screen
  if (!hiddenMode) return;
  engineRef.applyState(stateForStatus()); // gaming pose while idle
  window.ccPet.setIgnoreMouse(true);
}

async function exitHide() {
  if (!hiddenMode) return;
  hiddenMode = false;
  window.ccPet.setIgnoreMouse(false);
  const wa = await workArea();
  if (!wa) return;
  const groundY = groundYOf(wa);
  const edgeX = wa.x + wa.width - WIN_W;
  if (climbSide) {
    engineRef.applyState("running-left");
    await moveWindow(edgeX, windowPosY, 1.5); // slide back onto the screen
    await moveWindow(edgeX, groundY, 2.6); // climb down
    clearClimb();
  }
  engineRef.applyState("running-left");
  await moveWindow(edgeX - 10, groundY, 3);
  engineRef.applyState(stateForStatus());
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

function setupDrag(engine) {
  const hitbox = document.getElementById("pet-hitbox");
  const container = document.getElementById("pet-container");
  if (!hitbox) return;

  hitbox.addEventListener("mousedown", (e) => {
    if (e.button === 2) return;
    stopPetting(engine, true);
    isDragging = true; // set first so cancelStroll doesn't trigger a fall mid-grab
    cancelStroll(false);
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    lastDragX = e.screenX;
    winStartX = windowPosX;
    winStartY = windowPosY;
    document.body.style.cursor = "grabbing";
    e.preventDefault();
    engine.applyState("running-right");
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
    const moveDx = e.screenX - lastDragX;
    if (moveDx > 1 && engine.currentState !== "running-right") engine.applyState("running-right");
    else if (moveDx < -1 && engine.currentState !== "running-left") engine.applyState("running-left");
    lastDragX = e.screenX;
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.cursor = "";
    if (container) {
      container.classList.remove("is-lifting");
      container.classList.add("is-dropping");
    }
    engine.applyState("jumping");
    setTimeout(() => {
      if (container) container.classList.remove("is-dropping");
      engine.applyState(stateForStatus());
      settleAfterDrag();
    }, 500);
  });

  // Click → particles + today's usage
  // Single click → today's usage; double click → bring the Claude app to the front.
  // The first click is held for DBLCLICK_MS so a second one can cancel it.
  let clickTimer = null;
  hitbox.addEventListener("click", (e) => {
    if (e.button !== 0 || isDragging) return;
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

  // Hover 1.2s → petting (happy face, hearts)
  hitbox.addEventListener("mouseenter", () => startPettingTimer(engine));
  hitbox.addEventListener("mouseleave", () => stopPetting(engine, false));

  // Right-click → native OS menu (never clipped by the tiny window)
  hitbox.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (isDragging) return;
    stopPetting(engine, true);
    menuOpen = true;
    window.ccPet.showMenu({ roam: roamEnabled, hidden: hiddenMode, onTop: isAlwaysOnTop });
  });
}

// ── Petting ────────────────────────────────────────────────

let hoverTimer = null;
let heartTimer = null;

function startPettingTimer(engine) {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    hoverTimer = null;
    if (isDragging || menuOpen || moveTimer || climbSide || sleepStage || hiddenMode) return;
    if (currentCCStatus !== "idle") return;
    petting = true;
    cancelStroll(false);
    engine.applyState("petted");
    const hearts = () => {
      const hb = document.getElementById("pet-hitbox");
      if (!hb) return;
      const r = hb.getBoundingClientRect();
      spawnParticles(r.left + r.width / 2 + (Math.random() - 0.5) * 30, r.top + 10, 0);
    };
    hearts();
    heartTimer = setInterval(hearts, 700);
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
  if (!petting) return;
  petting = false;
  const done = () => {
    if (engine.currentState === "petted") engine.applyState(stateForStatus());
    scheduleStroll();
  };
  if (immediate) done();
  else setTimeout(done, 400);
}

// ── Import pet pack ────────────────────────────────────────

async function openImportDialog(engine) {
  try {
    showSpeech("Importing pet…", 3000);
    const manifest = await window.ccPet.importPetZip();
    if (!manifest) return;
    const petDir = await window.ccPet.getPetDir(manifest.id);
    const fileUrl = "file:///" + (petDir + "/" + manifest.spritesheetPath).replace(/\\/g, "/");
    engine.setSpritesheet(fileUrl);
    window.ccPet.setCurrentPetId(manifest.id);
    engine.applyState("waving");
    showSpeech(`Switched to ${manifest.displayName} 🎉`, 3000);
    setTimeout(() => engine.applyState("idle"), 3000);
  } catch (e) {
    console.error("Import failed:", e);
    showSpeech("Import failed 😩", 3000);
  }
}

// ── Menu actions (native context menu + tray) ──────────────

async function runMenuAction(engine, action) {
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
      cancelStroll();
      engine.applyState("waving");
      showSpeech("Hi there! 👋", 2500);
      setTimeout(() => engine.applyState(stateForStatus()), 2500);
      break;
    case "jump":
      cancelStroll();
      engine.applyState("jumping");
      showSpeech("Yay! 🎉", 2000);
      setTimeout(() => engine.applyState(stateForStatus()), 2000);
      break;
    case "think":
      cancelStroll();
      engine.applyState("review");
      showSpeech("Let me think… 🤔", 3000);
      setTimeout(() => engine.applyState(stateForStatus()), 3000);
      break;
    case "flower":
      cancelStroll();
      engine.applyState("flower");
      showSpeech("For you 🌸", 3000);
      setTimeout(() => engine.applyState(stateForStatus()), 4500);
      break;
    case "backflip":
      cancelStroll();
      engine.applyState("backflip");
      showSpeech("Ta-da! 🤸", 2000);
      setTimeout(() => engine.applyState(stateForStatus()), 1100);
      break;
    case "snack": {
      cancelStroll();
      const snack = pickSnack(new Date().getHours());
      engine.applyState(snack);
      showSpeech({ coffee: "Coffee break ☕", water: "Hydrating 💧", fries: "Fries! 🍟", sausage: "Nom nom 🌭" }[snack], 2500);
      setTimeout(() => engine.applyState(stateForStatus()), 5200);
      break;
    }
    case "nap":
      cancelStroll(false);
      sleepStage = 2;
      engine.applyState("sleep");
      showSpeech("Zzz… 🌙", 2000);
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

// ── Claude Code status ─────────────────────────────────────

let runningStartedAt = 0;
let coffeeTimer = null;

function handleStatusUpdate(engine, { status, message }) {
  const prev = currentCCStatus;
  currentCCStatus = status;

  if (status !== "idle") {
    stopPetting(engine, true);
    cancelStroll(false);
    if (sleepStage) sleepStage = 0; // work wakes the crab
  } else {
    scheduleStroll();
  }

  // Long-run bookkeeping: coffee sips every 25 min while running, stretch after ≥30 min
  if (status === "running" && prev !== "running") {
    runningStartedAt = Date.now();
    if (coffeeTimer) clearInterval(coffeeTimer);
    coffeeTimer = setInterval(() => {
      if (currentCCStatus !== "running" || moveTimer || hiddenMode) return;
      engine.applyState("coffee");
      setTimeout(() => {
        if (currentCCStatus === "running" && engine.currentState === "coffee") engine.applyState("typing");
      }, 3800);
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
  const container = document.getElementById("pet-container");
  if (container) container.classList.remove("waiting-blink");

  if (!moveTimer) {
    // mid-fall: landing applies the state instead
    let anim = status === "idle" ? stateForStatus() : STATUS_TO_ANIMATION[status] || "idle";
    if (status === "completed" && Math.random() < 0.5) anim = "backflip"; // celebrate
    engine.applyState(anim);
  }
  if (longRun && (status === "completed" || status === "idle")) {
    setTimeout(() => {
      if (currentCCStatus === status && !moveTimer) {
        engine.applyState("stretch");
        setTimeout(() => {
          if (engine.currentState === "stretch") engine.applyState(stateForStatus());
        }, 3200);
      }
    }, status === "completed" ? 5200 : 300);
  }

  if (status === "waiting") {
    const msg = message || STATUS_MESSAGES[status];
    showSpeech(msg, message ? 999999 : 3000);
    if (message && container) container.classList.add("waiting-blink");
  } else if (status === "running") {
    if (message) showSpeech(message, 999999);
    else showTyping(999999);
  } else {
    const msg = message || STATUS_MESSAGES[status] || "";
    if (msg) showSpeech(msg, status === "completed" ? 5000 : 4000);
  }

  if (status === "completed" || status === "error") {
    setTimeout(() => {
      if (currentCCStatus === status) engine.applyState("idle");
    }, 5000);
  }
}

// ── Concurrent sessions badge ──────────────────────────────

function handleSessionsUpdate({ count, names }) {
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
  if (currentCCStatus !== "idle" || moveTimer || climbSide || petting) {
    showSpeech(text, 5000);
    return;
  }
  cancelStroll(false);
  engine.applyState("stretch");
  showSpeech(text, 5000);
  setTimeout(() => {
    if (engine.currentState === "stretch") engine.applyState(stateForStatus());
    scheduleStroll();
  }, 3200);
}

function handleSystemIdle(engine, seconds) {
  trackSitting(engine, seconds);

  if (currentCCStatus !== "idle" || hiddenMode || isDragging || menuOpen || petting) {
    if (sleepStage) {
      sleepStage = 0;
      if (!moveTimer) engine.applyState(stateForStatus());
    }
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
  } else if (seconds < 15 && sleepStage > 0) {
    const wasAsleep = sleepStage === 2;
    sleepStage = 0;
    engine.applyState("stretch");
    showSpeech(wasAsleep ? greeting() : "Huh? I'm awake!", 2500);
    setTimeout(() => {
      if (engine.currentState === "stretch") engine.applyState(stateForStatus());
      scheduleStroll();
    }, 3200);
  }
}

// Every 10 min, 25% chance of a short time-of-day greeting while idle
function setupGreetings(engine) {
  setInterval(() => {
    if (currentCCStatus !== "idle" || hiddenMode || sleepStage || moveTimer || menuOpen || petting) return;
    if (engine.currentState !== "idle") return;
    if (Math.random() < 0.25) showSpeech(greeting(), 3500);
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
    engine.setSpritesheet(fileUrl);
    console.log(`[CCPet] loaded saved pet: ${pet.displayName}`);
  } catch (e) {
    console.warn("[CCPet] loading saved pet failed:", e);
  }
}

// ── Init ───────────────────────────────────────────────────

function main() {
  window.__petDebug = false; // set true to log bubble layout metrics as [pet] console lines
  const spriteEl = document.getElementById("pet-sprite");
  if (!spriteEl) return;
  const engine = new PetEngine(spriteEl, CODEX_ATLAS);

  loadSavedPet(engine).catch(() => {});

  const petContainer = document.getElementById("pet-container");
  if (petContainer) {
    petContainer.classList.add("pet-entering");
    setTimeout(() => petContainer.classList.remove("pet-entering"), 700);
  }

  engine.applyState("waving");
  showSpeech(greeting(), 3000);
  setTimeout(() => {
    if (engine.currentState === "waving") engine.applyState("idle");
  }, 4000);

  initWindowPos();
  setupDrag(engine);
  setupGreetings(engine);
  setupRoaming(engine);

  if (window.ccPet) {
    window.ccPet.onStatusUpdate((data) => handleStatusUpdate(engine, data));
    window.ccPet.onSystemIdle((seconds) => handleSystemIdle(engine, seconds));
    window.ccPet.onSessionsUpdate((data) => handleSessionsUpdate(data));
    window.ccPet.onFullscreenChange((active) => {
      if (active) enterHide();
      else if (!manualHide) exitHide();
    });
    window.ccPet.onTrayCommand((cmd) => {
      if (cmd === "usage") showUsage(engine);
      else if (cmd === "toggle-roam") toggleRoam();
      else if (cmd === "toggle-hide") toggleHide();
    });
    window.ccPet.onMenuAction((action) => runMenuAction(engine, action));
    window.ccPet.onMenuClosed(() => {
      menuOpen = false;
      scheduleStroll();
    });
  }

  console.log("Claw'd engine initialized");
}

main();
