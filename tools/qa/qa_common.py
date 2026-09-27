# -*- coding: utf-8 -*-
"""Shared helpers for the Claw'd QA harness (tools/qa).

Run every tool with the workspace Python:
  "E:/Vibegaming playground/30_Tools/py311/python.exe" tools/qa/<tool>.py
from the ClaudeCodePet/ folder (any cwd works; paths are resolved from this file).

Nothing here writes outside ClaudeCodePet/tmp/ or ClaudeCodePet/tools/qa/out/.
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:  # noqa: BLE001
    pass

QA_DIR = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(QA_DIR, "..", ".."))
# CLAWD_QA_RENDERER / CLAWD_QA_OUT let the self-test point the tools at a mock renderer folder.
RENDERER = os.path.abspath(os.environ.get("CLAWD_QA_RENDERER") or os.path.join(REPO, "renderer"))
OUT = os.path.abspath(os.environ.get("CLAWD_QA_OUT") or os.path.join(QA_DIR, "out"))
TMP = os.path.join(REPO, "tmp")
BASELINE = os.path.join(TMP, "baseline", "spritesheet.webp")

SHEET = os.path.join(RENDERER, "spritesheet.webp")
EMOTES = os.path.join(RENDERER, "emotes.webp")
HATS = os.path.join(RENDERER, "hats.webp")
META_JSON = os.path.join(RENDERER, "clawd_meta.json")
META_JS = os.path.join(RENDERER, "clawd_meta.js")
CONTRACT = os.path.join(QA_DIR, "contract.json")

LW, LH, SCALE = 48, 52, 4
CW, CH = LW * SCALE, LH * SCALE

FLAGS = {"HAT_OK": 1, "EMOTE_OK": 2, "FACE_OK": 4, "MIRRORED": 8, "TINTED": 16, "MARK_SIDE": 32, "MARK_TOP": 64}
FLAG_LETTERS = [("HAT_OK", "H"), ("EMOTE_OK", "E"), ("FACE_OK", "F"), ("MIRRORED", "M"),
                ("TINTED", "T"), ("MARK_SIDE", "s"), ("MARK_TOP", "t")]

# Rows 0-21 are frozen (spec §0.1). This mirrors CODEX_ATLAS in renderer/pet.js at dec5faa.
OLD_ROWS = [
    ("idle", 6, [280, 110, 110, 140, 140, 320]),
    ("running-right", 8, [120, 120, 120, 120, 120, 120, 120, 220]),
    ("running-left", 8, [120, 120, 120, 120, 120, 120, 120, 220]),
    ("waving", 4, [140, 140, 140, 280]),
    ("jumping", 5, [140, 140, 140, 140, 280]),
    ("failed", 8, [140, 140, 140, 140, 140, 140, 140, 240]),
    ("waiting", 6, [150, 150, 150, 150, 150, 260]),
    ("running", 6, [120, 120, 120, 120, 120, 220]),
    ("review", 6, [150, 150, 150, 150, 150, 280]),
    ("typing", 6, [130, 130, 130, 130, 130, 200]),
    ("flower", 6, [260, 260, 260, 260, 180, 260]),
    ("coffee", 6, [320, 320, 420, 420, 300, 320]),
    ("water", 6, [320, 320, 420, 420, 300, 320]),
    ("fries", 6, [300, 260, 320, 300, 260, 320]),
    ("sausage", 6, [320, 300, 340, 300, 340, 400]),
    ("gaming", 6, [140, 140, 160, 140, 160, 140]),
    ("backflip", 8, [160, 90, 90, 90, 90, 90, 90, 260]),
    ("doze", 6, [600, 500, 500, 700, 500, 600]),
    ("sleep", 6, [400, 400, 400, 400, 400, 400]),
    ("stretch", 6, [260, 260, 420, 420, 260, 300]),
    ("phone", 6, [300, 300, 300, 300, 200, 300]),
    ("petted", 6, [220, 220, 220, 220, 220, 220]),
]

# §1.4 tints (body, legs)
TINTS = {
    "sad": ((184, 124, 124), (156, 98, 89)),
    "pale": ((233, 180, 155), (187, 117, 94)),
    "rosy": ((229, 132, 132), (186, 100, 83)),
    "flush": ((222, 88, 69), (179, 78, 62)),
}
CORAL = (217, 119, 87)


def py_exe():
    return sys.executable


def ensure_dir(p):
    os.makedirs(p, exist_ok=True)
    return p


def load_contract():
    with open(CONTRACT, encoding="utf-8") as f:
        return json.load(f)


def load_meta_json():
    """Returns (meta, message). meta is None when the file is missing or broken."""
    if not os.path.exists(META_JSON):
        return None, "renderer/clawd_meta.json not generated yet (executor A step 2)"
    try:
        with open(META_JSON, encoding="utf-8") as f:
            return json.load(f), "ok"
    except Exception as e:  # noqa: BLE001
        return None, "renderer/clawd_meta.json is not valid JSON: %s" % e


def load_meta_js():
    """Evaluates renderer/clawd_meta.js with node in a sandbox and returns (obj, message)."""
    if not os.path.exists(META_JS):
        return None, "renderer/clawd_meta.js not generated yet (executor A step 2)"
    code = (
        "const fs=require('fs'),vm=require('vm');"
        "const src=fs.readFileSync(process.argv[1],'utf8');"
        "const ctx={window:{}};vm.createContext(ctx);vm.runInContext(src,ctx,{timeout:2000});"
        "if(!ctx.window.CLAWD_META){console.error('window.CLAWD_META not set');process.exit(3);}"
        "process.stdout.write(JSON.stringify(ctx.window.CLAWD_META));"
    )
    try:
        r = subprocess.run(["node", "-e", code, META_JS], capture_output=True, text=True, timeout=30)
    except FileNotFoundError:
        return None, "node not found on PATH (needed to evaluate clawd_meta.js)"
    if r.returncode != 0:
        return None, "clawd_meta.js failed to evaluate: %s" % (r.stderr.strip()[:300])
    try:
        return json.loads(r.stdout), "ok"
    except Exception as e:  # noqa: BLE001
        return None, "clawd_meta.js produced non-JSON: %s" % e


def load_image(path):
    if not os.path.exists(path):
        return None
    im = Image.open(path)
    im.load()
    return im.convert("RGBA")


def all_rows(contract):
    """[(name, row, frames, durations)] for rows 0-42 in row order (new rows from the contract)."""
    rows = [(n, i, f, d) for i, (n, f, d) in enumerate(OLD_ROWS)]
    for name, r in sorted(contract["rows"].items(), key=lambda kv: kv[1]["row"]):
        rows.append((name, r["row"], r["frames"], r["frameDurations"]))
    return rows


def row_table(contract):
    return {n: {"row": r, "frames": f, "frameDurations": d} for (n, r, f, d) in all_rows(contract)}


def resolve(contract, name):
    """Alias or row → (base_name, row_index, [base frame indices], [durations])."""
    table = row_table(contract)
    if name in table:
        t = table[name]
        return name, t["row"], list(range(t["frames"])), t["frameDurations"]
    a = contract["aliases"].get(name)
    if a:
        t = table[a["of"]]
        return a["of"], t["row"], list(a["frameIndices"]), list(a["frameDurations"])
    raise KeyError(name)


def sheet_rows_available(sheet):
    return sheet.height // CH if sheet is not None else 0


def cell(sheet, row, col):
    """The native 192x208 cell (RGBA)."""
    return sheet.crop((col * CW, row * CH, (col + 1) * CW, (row + 1) * CH))


def logical(img, scale=SCALE):
    """Nearest-neighbour reduction of a x4 image to logical pixels."""
    return img.resize((img.width // scale, img.height // scale), Image.NEAREST)


def cell_logical(sheet, row, col):
    return logical(cell(sheet, row, col))


def up(img, k):
    if k == 1:
        return img
    return img.resize((int(round(img.width * k)), int(round(img.height * k))), Image.NEAREST)


def anchor_of(meta, contract, name, frame_pos):
    """Anchor tuple [hx,hy,ey,flags,view] for the frame_pos-th displayed frame of an anim/alias."""
    if not meta or "anchors" not in meta:
        return None
    base, _row, idx, _d = resolve(contract, name)
    arr = meta["anchors"].get(base)
    if not arr:
        return None
    fi = idx[frame_pos]
    if fi >= len(arr):
        return None
    return arr[fi]


def flag_letters(flags):
    return "".join(ch if flags & FLAGS[k] else "." for k, ch in FLAG_LETTERS)


_FONT_CACHE = {}


def font(size=11):
    if size not in _FONT_CACHE:
        f = None
        for cand in ("consola.ttf", "arial.ttf", "DejaVuSans.ttf"):
            try:
                f = ImageFont.truetype(cand, size)
                break
            except Exception:  # noqa: BLE001
                continue
        if f is None:
            try:
                f = ImageFont.load_default(size=size)
            except Exception:  # noqa: BLE001
                f = ImageFont.load_default()
        _FONT_CACHE[size] = f
    return _FONT_CACHE[size]


def checker(w, h, a=(236, 236, 236, 255), b=(214, 214, 214, 255), sq=8):
    im = Image.new("RGBA", (w, h), a)
    d = ImageDraw.Draw(im)
    for y in range(0, h, sq):
        for x in range(0, w, sq):
            if ((x // sq) + (y // sq)) % 2:
                d.rectangle([x, y, x + sq - 1, y + sq - 1], fill=b)
    return im


def busy_bg(w, h, sq=6):
    """A busy wallpaper-like checker: mid-tone colours of mixed hue and value."""
    cols = [(92, 132, 180), (201, 160, 96), (74, 122, 78), (216, 216, 210), (150, 72, 96),
            (40, 44, 60), (236, 200, 170), (120, 170, 190)]
    im = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(im)
    for y in range(0, h, sq):
        for x in range(0, w, sq):
            i = ((x // sq) * 7 + (y // sq) * 3 + ((x // sq) * (y // sq)) % 5) % len(cols)
            d.rectangle([x, y, x + sq - 1, y + sq - 1], fill=cols[i] + (255,))
    return im


def text(d, xy, s, fill=(20, 20, 30, 255), size=11):
    d.text(xy, s, fill=fill, font=font(size))


def opaque_bbox(img):
    """bbox of alpha>0 pixels as (l, t, r, b) inclusive, or None."""
    bb = img.getchannel("A").getbbox()
    if not bb:
        return None
    return bb[0], bb[1], bb[2] - 1, bb[3] - 1


def save(img, name):
    ensure_dir(OUT)
    p = os.path.join(OUT, name)
    img.save(p)
    return p


def rel_lum(rgb):
    def ch(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb[:3]
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(c1, c2):
    l1, l2 = rel_lum(c1), rel_lum(c2)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def over(px, bg):
    """Composite an RGBA pixel over an opaque RGB background."""
    a = px[3] / 255.0
    return tuple(int(round(px[i] * a + bg[i] * (1 - a))) for i in range(3))


def git(*args):
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True)


def ensure_baseline():
    """Creates tmp/baseline/spritesheet.webp from git HEAD if it is missing. Returns (path|None, msg)."""
    if os.path.exists(BASELINE):
        return BASELINE, "ok"
    ensure_dir(os.path.dirname(BASELINE))
    import io
    note = "created from git HEAD"
    r = git("show", "HEAD:renderer/spritesheet.webp")
    if r.returncode != 0 or not r.stdout:
        return None, "git show HEAD:renderer/spritesheet.webp failed: %s" % r.stderr.decode("utf-8", "replace")[:200]
    try:
        h = Image.open(io.BytesIO(r.stdout)).height
    except Exception:  # noqa: BLE001
        h = -1
    if h != 22 * CH:
        # HEAD already carries a regenerated sheet (the lead committed it): fall back to the spec's tree.
        r2 = git("show", "dec5faa:renderer/spritesheet.webp")
        if r2.returncode != 0 or not r2.stdout:
            return None, "HEAD sheet is %d px tall (not the 22-row original) and dec5faa is unavailable" % h
        r = r2
        note = "HEAD sheet is %d px tall (already regenerated), baseline taken from dec5faa" % h
    with open(BASELINE, "wb") as f:
        f.write(r.stdout)
    return BASELINE, note
