// Footprint overlay renderer. Receives { x, y, dir, tone } in overlay-local CSS px,
// draws a tiny pixel claw print, and fades it over FADE_MS. Tells main when empty.

const FADE_MS = 7000;
const PX = 2; // logical pixel size of the print

const canvas = document.getElementById("trail");
const ctx = canvas.getContext("2d");
let prints = [];
let raf = null;
let idleTimer = null;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// 7x7 claw print (1 = mud). dir mirrors it for the other foot.
const PRINT = [
  "..1.1..",
  ".1...1.",
  "1.....1",
  ".......",
  "..111..",
  ".11111.",
  "..111..",
];

function drawPrint(p, alpha) {
  const mud = `rgba(96, 62, 38, ${alpha.toFixed(3)})`;
  const dark = `rgba(64, 40, 24, ${alpha.toFixed(3)})`;
  for (let r = 0; r < PRINT.length; r++) {
    for (let c = 0; c < PRINT[r].length; c++) {
      if (PRINT[r][c] !== "1") continue;
      const cc = p.dir < 0 ? PRINT[r].length - 1 - c : c;
      ctx.fillStyle = r >= 4 ? mud : dark;
      ctx.fillRect(Math.round(p.x + (cc - 3) * PX), Math.round(p.y + (r - 3) * PX), PX, PX);
    }
  }
}

function render() {
  raf = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const now = performance.now();
  prints = prints.filter((p) => now - p.born < FADE_MS);
  for (const p of prints) {
    const age = (now - p.born) / FADE_MS;
    const alpha = (1 - age) * (p.tone === 1 ? 0.85 : 0.7);
    drawPrint(p, alpha);
  }
  if (prints.length) {
    raf = requestAnimationFrame(render);
  } else {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => window.trail && window.trail.idle(), 500);
  }
}

if (window.trail) {
  window.trail.onFootprint((fp) => {
    prints.push({ x: fp.x, y: fp.y, dir: fp.dir || 1, tone: fp.tone || 0, born: performance.now() });
    if (prints.length > 120) prints.shift();
    if (!raf) raf = requestAnimationFrame(render);
  });
  window.trail.onClear(() => {
    prints = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
}
