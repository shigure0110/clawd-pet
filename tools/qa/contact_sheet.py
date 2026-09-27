# -*- coding: utf-8 -*-
"""Contact sheets for the Claw'd animation build (spec §7 "Common C deliverables", §8.2).

Usage (from ClaudeCodePet/):
  "E:/Vibegaming playground/30_Tools/py311/python.exe" tools/qa/contact_sheet.py [target ...]

Targets (default: all):
  rows_new rows_all aliases trot_vs_run      (Gate 1)
  hats emotes emote_on_rows tints bg_contrast (Gate 2; "hats" writes hats_<id>.png for every hat)

Output: tools/qa/out/*.png (+ trot_vs_run.gif). Inputs that do not exist yet are drawn as grey
"not generated yet" cells, or the target is skipped with a message; nothing crashes on a partial build.

The overlay placement here is a Python reference implementation of spec §3.4 (the same formulas
renderer/overlay.js implements); emote_on_rows also prints numeric overlap checks.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qa_common as Q  # noqa: E402
from PIL import Image, ImageDraw, ImageOps  # noqa: E402

F = Q.FLAGS
RED = (230, 30, 40, 255)
BLUE = (30, 90, 230, 255)
GREY_TXT = (90, 90, 100, 255)
MISSING = (200, 200, 205, 255)
FIXED_ANCHOR = [24, 22, 26, 2, 0]
# side-emote clearance: bottom-left pixel at (hx' + SIDE_DX, hy + 2); mirrored right-aligned at hx' - SIDE_DX.
# §3.4 said 21; lead decision 2 (2026-09-27) makes it 22, in overlay.js and in this port together.
SIDE_DX = 22


class Ctx:
    def __init__(self):
        self.contract = Q.load_contract()
        self.meta, self.meta_msg = Q.load_meta_json()
        self.sheet = Q.load_image(Q.SHEET)
        self.emotes = Q.load_image(Q.EMOTES)
        self.hats = Q.load_image(Q.HATS)
        self.nrows = Q.sheet_rows_available(self.sheet)
        self.table = Q.row_table(self.contract)
        self.all_rows = Q.all_rows(self.contract)
        print("meta: %s | sheet: %s | emotes: %s | hats: %s" % (
            self.meta_msg, "%dx%d (%d rows)" % (self.sheet.width, self.sheet.height, self.nrows) if self.sheet else "missing",
            "ok" if self.emotes else "not generated yet", "ok" if self.hats else "not generated yet"))

    def has_anchors(self):
        return bool(self.meta and self.meta.get("anchors"))

    def frame(self, name, pos):
        """Logical 48x52 image of the pos-th displayed frame of an anim/alias, or None."""
        base, row, idx, _d = Q.resolve(self.contract, name)
        if self.sheet is None or row >= self.nrows:
            return None
        return Q.cell_logical(self.sheet, row, idx[pos])

    def anchor(self, name, pos):
        return Q.anchor_of(self.meta, self.contract, name, pos)

    def emote_cell(self, name, col):
        e = self.contract["emotes"]["list"][name]
        if self.emotes is None or e["row"] >= self.emotes.height // 96:
            return None
        return self.emotes.crop((col * 96, e["row"] * 96, (col + 1) * 96, (e["row"] + 1) * 96))

    def hat_cell(self, hid, col):
        h = self.contract["hats"]["list"][hid]
        if self.hats is None or h["row"] >= self.hats.height // 128:
            return None
        return self.hats.crop((col * 160, h["row"] * 128, (col + 1) * 160, (h["row"] + 1) * 128))


def missing_cell(w, h, label="not generated yet"):
    im = Image.new("RGBA", (w, h), MISSING)
    d = ImageDraw.Draw(im)
    d.line([0, 0, w - 1, h - 1], fill=(170, 170, 176, 255))
    d.line([0, h - 1, w - 1, 0], fill=(170, 170, 176, 255))
    Q.text(d, (4, h // 2 - 6), label, fill=GREY_TXT, size=10)
    return im


def dot(d, x0, y0, k, x, y, col):
    d.rectangle([x0 + x * k, y0 + y * k, x0 + x * k + k - 1, y0 + y * k + k - 1], outline=col, fill=col[:3] + (150,))


def paste_cell(canvas, img, x, y, k, bg=True, anchor=None, border=(180, 180, 190, 255)):
    w, h = Q.LW * k, Q.LH * k
    if bg:
        canvas.alpha_composite(Q.checker(w, h, sq=max(4, k * 2)), (x, y))
    if img is None:
        canvas.alpha_composite(missing_cell(w, h), (x, y))
    else:
        canvas.alpha_composite(Q.up(img, k), (x, y))
    d = ImageDraw.Draw(canvas)
    d.rectangle([x - 1, y - 1, x + w, y + h], outline=border)
    if anchor is not None and img is not None:
        dot(d, x, y, k, anchor[0], anchor[1], RED)
        dot(d, x, y, k, anchor[0], anchor[2], BLUE)


def row_strip_sheet(ctx, names, k, title, fname, label_fn=None, note=""):
    """Generic contact sheet: one strip per anim/alias name, frames at k x logical."""
    cw, ch = Q.LW * k, Q.LH * k
    gap, head, foot = 8, 18, 30
    width = 12 + 8 * (cw + gap) + 4
    height = 40 + len(names) * (head + ch + foot + 6)
    im = Image.new("RGBA", (width, height), (250, 250, 248, 255))
    d = ImageDraw.Draw(im)
    Q.text(d, (12, 8), title, size=15)
    sub = "red = (hx,hy) head anchor · blue = (hx,ey) eyes · flags H hat E emote F face M mirrored T tinted s mark-side t mark-top"
    if not ctx.has_anchors():
        sub = "meta.anchors not generated yet: no anchor dots or flags · " + note
    Q.text(d, (12, 24), sub, fill=GREY_TXT, size=10)
    y = 40
    for name in names:
        base, row, idx, durs = Q.resolve(ctx.contract, name)
        hdr = label_fn(name) if label_fn else name
        Q.text(d, (12, y + 2), hdr, size=12)
        y += head
        for pos in range(len(idx)):
            x = 12 + pos * (cw + gap)
            a = ctx.anchor(name, pos)
            paste_cell(im, ctx.frame(name, pos), x, y, k, anchor=a)
            lab = "f%d %dms" % (idx[pos], durs[pos])
            Q.text(d, (x, y + ch + 3), lab, size=10)
            if a is not None:
                Q.text(d, (x, y + ch + 15), "%s v%d (%d,%d,%d)" % (Q.flag_letters(a[3]), a[4], a[0], a[1], a[2]),
                       fill=GREY_TXT, size=9)
        y += ch + foot + 6
    return Q.save(im, fname)


def loop_desc(ctx, name):
    c = ctx.contract["rows"].get(name)
    if c is None:
        i = ctx.table[name]["row"]
        return "row %d %s (frozen)" % (i, name)
    s = "row %d %s · %s" % (c["row"], name, "loop" if c["loop"] else "one-shot")
    if c["loop"]:
        s += " %d-%d" % (c.get("loopStart", 0), c.get("loopEnd", c["frames"] - 1))
    s += " · fallback %s" % c["fallback"]
    if c.get("fallbackFlip"):
        s += " / flip %s" % c["fallbackFlip"]
    if name in ctx.contract["expr"]:
        s += " · expr"
    if name in ctx.contract["shakeFrames"]:
        s += " · shake %s" % ctx.contract["shakeFrames"][name]
    if ctx.sheet is not None and c["row"] >= ctx.nrows:
        s += "   [row not in sheet yet]"
    return s


# ─────────────────────────────── Gate 1 targets ───────────────────────────────
def t_rows_new(ctx):
    names = [n for n, r in sorted(ctx.contract["rows"].items(), key=lambda kv: kv[1]["row"])]
    return row_strip_sheet(ctx, names, 3, "rows_new: rows 22-42 at 3x logical", "rows_new.png",
                           lambda n: loop_desc(ctx, n))


def t_rows_all(ctx):
    names = [n for n, _r, _f, _d in ctx.all_rows]
    return row_strip_sheet(ctx, names, 2, "rows_all: rows 0-42 at 2x logical", "rows_all.png",
                           lambda n: loop_desc(ctx, n))


def t_aliases(ctx):
    names = list(ctx.contract["aliases"].keys())

    def lab(n):
        a = ctx.contract["aliases"][n]
        return "%s = %s%s · %s" % (n, a["of"], a["frameIndices"], "loop" if a["loop"] else "one-shot")
    return row_strip_sheet(ctx, names, 3, "aliases: alias frames resolved to their base rows (3x)", "aliases.png", lab)


def t_trot_vs_run(ctx):
    cases = [("trot", False, "trot"), ("trot", True, "trot (flipped = walking left)"),
             ("running-right", False, "running-right"), ("running-left", False, "running-left (baked mirror)")]
    scales = [(3, "3x logical"), (2.2, "2.2x = on-screen size (x4 sheet at 0.55)"), (1, "1x logical (silhouette)")]
    width = 12 + 8 * (48 * 3 + 8) + 250
    height = 40
    for k, _ in scales:
        height += 20 + len(cases) * (int(52 * k) + 22)
    im = Image.new("RGBA", (width, height), (250, 250, 248, 255))
    d = ImageDraw.Draw(im)
    Q.text(d, (12, 8), "trot_vs_run: side-view trot next to the front run (decides TROT_MIN_PX)", size=15)
    y = 36
    for k, klabel in scales:
        Q.text(d, (12, y), klabel, fill=GREY_TXT, size=12)
        y += 20
        for name, flip, lab in cases:
            Q.text(d, (12, y), lab, size=10)
            yy = y + 12
            n = len(Q.resolve(ctx.contract, name)[2])
            for pos in range(n):
                fr = ctx.frame(name, pos)
                if fr is not None and flip:
                    fr = ImageOps.mirror(fr)
                w, h = int(round(48 * k)), int(round(52 * k))
                x = 12 + pos * (w + 6)
                im.alpha_composite(Q.checker(w, h, sq=6), (x, yy))
                im.alpha_composite(missing_cell(w, h, "") if fr is None else fr.resize((w, h), Image.NEAREST), (x, yy))
            y += int(52 * k) + 22
    p = Q.save(im, "trot_vs_run.png")
    # animated GIF, 3x, 20 ms steps, 3.2 s
    gif_frames = []
    step = 20
    total = 3200

    def timeline(name, t):
        c = ctx.contract["rows"].get(name)
        base, row, idx, durs = Q.resolve(ctx.contract, name)
        if c and c.get("loop"):
            ls, le = c.get("loopStart", 0), c.get("loopEnd", len(idx) - 1)
        else:
            ls, le = 0, len(idx) - 1
        intro = sum(durs[:ls])
        if t < intro:
            acc = 0
            for i in range(ls):
                acc += durs[i]
                if t < acc:
                    return i
        cyc = sum(durs[ls:le + 1])
        tt = (t - intro) % cyc
        acc = 0
        for i in range(ls, le + 1):
            acc += durs[i]
            if tt < acc:
                return i
        return le
    for t in range(0, total, step):
        fr = Image.new("RGBA", (4 * 150 + 10, 190), (245, 245, 240, 255))
        dd = ImageDraw.Draw(fr)
        for j, (name, flip, lab) in enumerate(cases):
            pos = timeline(name, t)
            img = ctx.frame(name, pos)
            if img is None:
                img = Image.new("RGBA", (48, 52), MISSING)
            if flip:
                img = ImageOps.mirror(img)
            fr.alpha_composite(Q.up(img, 3), (10 + j * 150, 10))
            Q.text(dd, (10 + j * 150, 170), lab[:24], size=10)
        gif_frames.append(fr.convert("RGB"))
    gp = os.path.join(Q.OUT, "trot_vs_run.gif")
    gif_frames[0].save(gp, save_all=True, append_images=gif_frames[1:], duration=step, loop=0)
    return p + " + " + gp


# ─────────────────────────────── §3.4 reference placement ───────────────────────────────
def hat_visible(ctx, hid, a, bubble=False, climb=None, hidden=False):
    h = ctx.contract["hats"]["list"][hid]
    hx, hy, ey, fl, vw = a
    if hidden:
        return False, "hiddenMode"
    if not fl & F["HAT_OK"]:
        return False, "no HAT_OK"
    if h.get("hideWhenTinted") and fl & F["TINTED"]:
        return False, "tinted"
    if h.get("hideInSide") and vw == 2:
        return False, "side view"
    if h.get("needsFace") and not (fl & F["FACE_OK"] and vw == 0):
        return False, "no FACE_OK"
    # overlay.js: the anchor row (hy, or ey for shades) minus the height must not rise above y 0
    if bubble and climb is None and (ey if h["anchor"] == "eyes" else hy) - h["height"] < 0:
        return False, "bubble clash"
    return True, ""


def hat_col(ctx, hid, vw, frame_changes):
    h = ctx.contract["hats"]["list"][hid]
    cols = ctx.contract["hats"]["cols"]
    col = [cols["front"], cols["q"], cols["side"]][vw]
    # the alt column is a front view: overlay.js alternates only on view-0 frames
    if vw == 0 and h.get("altEveryFrame") and frame_changes % 2 == 1:
        col = cols["alt"]
    if vw == 0 and h.get("altEvery2Frames") and (frame_changes // 2) % 2 == 1:
        col = cols["alt"]
    return col


def hat_box(ctx, hid, a, flip=False, trail=False, frame_changes=0):
    """(left, top, mirror, col) in cell px inside #pet-body."""
    hx, hy, ey, fl, vw = a
    hxp = 47 - hx if flip else hx
    h = ctx.contract["hats"]["list"][hid]
    top = 4 * (ey if h["anchor"] == "eyes" else hy) - 96
    if trail:
        top -= 8
    mirror = bool(fl & F["MIRRORED"]) != bool(flip)
    return 4 * hxp - 80, top, mirror, hat_col(ctx, hid, vw, frame_changes)


def draw_hat(ctx, layer, hid, box, ox, oy, origin_x=82):
    """Paste the hat (x4 cell) into a body-px layer whose #pet-body origin is (ox, oy)."""
    left, top, mirror, col = box
    img = ctx.hat_cell(hid, col)
    if img is None:
        return
    if mirror:
        # transform-origin <origin_x>px 0; scaleX(-1): local x -> 2*origin_x - x (82 -> +4 px)
        img = ImageOps.mirror(img)
        left = left + 2 * origin_x - img.width
    layer.alpha_composite(img, (ox + left, oy + top))


def ref_emote_box(ctx, name, a, flip=False, climb=None, hidden=False, badge=False, bubble=False, hat_h=0):
    """Python port of renderer/overlay.js emoteBox (spec §3.4 plus B's declared climb rule: in a
    climb the glyph is counter-rotated about a pivot just beyond the head, away from the wall).
    Used only when node / overlay.js is not available; parity with overlay.js is checked in
    emote_on_rows. Returns dict(visible, why, anchor, left, top, rotate, originX, originY), cell px."""
    E = ctx.contract["emotes"]
    e = E["list"][name]
    hx, hy, ey, fl, vw = a
    unit = 4
    piv_side, piv_top = E.get("pivotSide", [0, 23]), E.get("pivotTop", [12, 23])
    w = max(1, int(e["w"]))
    hxp = 47 - hx if flip else hx
    side_mirror = bool(flip) != bool(fl & F["MIRRORED"])   # XOR, as hat_box and overlay.js
    use_top = bool(climb) or bool(hidden) or e["anchor"] == "top"
    out = {"anchor": "top" if use_top else "side", "rotate": 0, "visible": True, "why": ""}
    if use_top:
        # glyph columns in the cell: top emotes centred on pivotTop's column, side emotes from col 0
        c0 = piv_top[0] - w // 2 if e["anchor"] == "top" else piv_side[0]
        c1 = c0 + w - 1
        pc = (c0 + c1) // 2
        if climb == "right":
            pc = c1 + 1
        elif climb == "left":
            pc = c0 - 1
        py = hy - 2 - hat_h
        out.update(left=unit * (hxp - pc), top=unit * (py - piv_top[1]),
                   originX=unit * pc + unit // 2, originY=unit * piv_top[1] + unit // 2,
                   rotate=90 if climb == "right" else -90 if climb == "left" else 0)
    else:
        hy_eff = max(hy, 16) if (badge and not climb and not side_mirror) else hy
        out.update(top=unit * (hy_eff + 2 - piv_side[1]),
                   left=unit * (hxp - SIDE_DX - w + 1) if side_mirror else unit * (hxp + SIDE_DX),
                   originX=unit * piv_side[0] + unit // 2, originY=unit * piv_side[1] + unit // 2)
    why = ("frame not EMOTE_OK" if not fl & F["EMOTE_OK"] else
           "baked top mark" if use_top and fl & F["MARK_TOP"] else
           "baked side mark" if not use_top and fl & F["MARK_SIDE"] else
           "top emote under a bubble" if use_top and bubble and not climb else "")
    if why:
        out.update(visible=False, why=why)
    return out


class OverlayJS:
    """renderer/overlay.js (the runtime placement maths) through tools/qa/overlay_bridge.js, so the
    composites show what the pet draws. None-safe: .ok is False without node or overlay.js."""

    def __init__(self, meta):
        self.ok, self.msg, self.p = False, "", None
        ov = os.path.join(Q.RENDERER, "overlay.js")
        if not meta or not os.path.exists(ov):
            self.msg = "renderer/overlay.js or meta missing"
            return
        import json
        import subprocess
        self._json = json
        try:
            self.p = subprocess.Popen(["node", os.path.join(Q.QA_DIR, "overlay_bridge.js"), ov],
                                      stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8")
            self.p.stdin.write(json.dumps(meta) + "\n")
            self.p.stdin.flush()
            r = json.loads(self.p.stdout.readline() or "null")
        except (OSError, ValueError) as ex:
            self.msg = "node bridge failed: %s" % ex
            return
        self.ok = r == "ready"
        self.msg = "renderer/overlay.js" if self.ok else "bridge: %s" % r

    def call(self, fn, row, frame, opts):
        self.p.stdin.write(self._json.dumps([fn, row, frame, opts]) + "\n")
        self.p.stdin.flush()
        r = self._json.loads(self.p.stdout.readline())
        if isinstance(r, dict) and "reason" in r:
            r["why"] = r.get("reason") or ""
        return r


def overlay_js(ctx):
    if not hasattr(ctx, "_ov"):
        ctx._ov = OverlayJS(ctx.meta)
        print("  overlay placement: %s" % (ctx._ov.msg if ctx._ov.ok else "Python reference (%s)" % ctx._ov.msg))
    return ctx._ov if ctx._ov.ok else None


def emote_box(ctx, name, anim, pos, a, flip=False, climb=None, hidden=False, badge=False, bubble=False, hat_h=0):
    """The emote box the runtime computes (overlay.js), or the Python port without node."""
    ov = overlay_js(ctx)
    if ov:
        return ov.call("emoteBox", anim, pos, dict(flip=flip, climbSide=climb, hidden=hidden, badgeVisible=badge,
                                                  bubbleVisible=bubble, emote=name, col=0, hatHeight=hat_h))
    return ref_emote_box(ctx, name, a, flip=flip, climb=climb, hidden=hidden, badge=badge, bubble=bubble, hat_h=hat_h)


def stage_hat(ctx, hid, anim, pos, a, flip=False, climb=None, hidden=False, bubble=False, badge=False):
    """(visible, why, (left, top, mirror, col), originX) as the runtime computes it."""
    ov = overlay_js(ctx)
    if ov:
        hb = ov.call("hatBox", anim, pos, dict(flip=flip, climbSide=climb, hidden=hidden, bubbleVisible=bubble,
                                              badgeVisible=badge, hatId=hid, animChanged=True))
        return hb["visible"], hb.get("why", ""), (hb["left"], hb["top"], hb["mirror"], hb["col"]), hb.get("originX", 82)
    ok, why = hat_visible(ctx, hid, a, bubble=bubble, climb=climb, hidden=hidden)
    return ok, why, hat_box(ctx, hid, a, flip), 82


def paste_emote(layer, cellimg, eb, ox, oy):
    """Paste an emote cell into a body-px layer (#pet-body origin at ox, oy) the way the CSS does it:
    left/top, then rotate(<eb.rotate>deg) about (originX, originY) of the box. Exact for 0/±90."""
    L, T = eb["left"], eb["top"]
    gx, gy = eb.get("originX", 0), eb.get("originY", 0)
    r = int(eb.get("rotate") or 0) % 360
    S = cellimg.width
    if r == 90:      # CSS rotate(90deg) = clockwise: (dx, dy) -> (-dy, dx)
        img, L, T = cellimg.transpose(Image.ROTATE_270), L + gx + gy - S, T + gy - gx
    elif r == 270:   # rotate(-90deg) = counter-clockwise: (dx, dy) -> (dy, -dx)
        img, L, T = cellimg.transpose(Image.ROTATE_90), L + gx - gy, T + gy + gx - S
    else:
        img = cellimg
    layer.paste(img, (int(ox + L), int(oy + T)), img)


# ─────────────────────────────── Gate 2 targets ───────────────────────────────
def t_hats(ctx):
    if ctx.hats is None:
        print("  hats: renderer/hats.webp not generated yet — skipped")
        return None
    if not ctx.has_anchors():
        print("  hats: meta.anchors not generated yet — skipped")
        return None
    outs = []
    k = 2
    pad_t, pad_s = 18, 10
    cw, ch = (48 + 2 * pad_s) * k, (52 + pad_t) * k
    names = [n for n, _r, _f, _d in ctx.all_rows]
    extra = [("running-left", False, "running-left (MIRRORED)"), ("trot", True, "trot flipped"), ("idle", True, "idle flipped")]
    for hid, h in sorted(ctx.contract["hats"]["list"].items(), key=lambda kv: kv[1]["row"]):
        pairs = []  # follow-through pairs: head drops >= 3 logical px between consecutive frames
        for name in names:
            arr = ctx.meta["anchors"].get(name) or []
            for i in range(1, len(arr)):
                if arr[i][1] - arr[i - 1][1] >= 3:
                    pairs.append((name, i - 1, i))
        rows_list = [(n, False, n) for n in names] + extra
        height = 44 + len(rows_list) * (ch + 18) + 30 + (ch + 18) * ((len(pairs) + 3) // 4)
        width = 150 + 8 * (cw + 4) + 10
        im = Image.new("RGBA", (width, height), (250, 250, 248, 255))
        d = ImageDraw.Draw(im)
        Q.text(d, (10, 6), "hats_%s: %s hat (%s anchor, height %d) through §3.4 on every frame of rows 0-42 (2x logical)"
               % (hid, hid, h["anchor"], h["height"]), size=14)
        Q.text(d, (10, 24), "grey label = hat hidden on that frame (reason) · red dot = pivot target (hx', hy|ey)", fill=GREY_TXT, size=10)
        y = 44

        def draw_frame(x, y, name, pos, flip, trail=False, changes=None):
            fr = ctx.frame(name, pos)
            a = ctx.anchor(name, pos)
            tile = Image.new("RGBA", (48 + 2 * pad_s, 52 + pad_t), (0, 0, 0, 0))
            layer = Image.new("RGBA", ((48 + 2 * pad_s) * 4, (52 + pad_t) * 4), (0, 0, 0, 0))
            if fr is not None:
                big = Q.up(fr, 4)
                if flip:
                    big = ImageOps.mirror(big)
                layer.alpha_composite(big, (pad_s * 4, pad_t * 4))
            why = ""
            if a is not None and fr is not None:
                ok, why = hat_visible(ctx, hid, a)
                if ok:
                    draw_hat(ctx, layer, hid, hat_box(ctx, hid, a, flip, trail, pos if changes is None else changes),
                             pad_s * 4, pad_t * 4)
            tile = Q.logical(layer)
            im.alpha_composite(Q.checker(cw, ch, sq=6), (x, y))
            im.alpha_composite(Q.up(tile, k) if fr is not None else missing_cell(cw, ch), (x, y))
            if a is not None and fr is not None:
                hxp = 47 - a[0] if flip else a[0]
                py = a[2] if h["anchor"] == "eyes" else a[1]
                dot(ImageDraw.Draw(im), x, y, k, hxp + pad_s, py + pad_t, RED)
            return why

        for name, flip, lab in rows_list:
            Q.text(d, (10, y + ch // 2 - 6), lab[:22], size=10)
            n = len(Q.resolve(ctx.contract, name)[2])
            for pos in range(n):
                x = 150 + pos * (cw + 4)
                why = draw_frame(x, y, name, pos, flip)
                Q.text(d, (x, y + ch + 2), ("f%d " % pos) + (why or "hat"), fill=GREY_TXT if why else (20, 110, 40, 255), size=9)
            y += ch + 18
        Q.text(d, (10, y + 6), "follow-through (§3.4): previous frame | landing frame with the hat trailing 2 px above, one frame", size=11)
        y += 30
        for j, (name, i0, i1) in enumerate(pairs):
            col = j % 4
            x = 150 + col * 2 * (cw + 4)
            if col == 0 and j:
                y += ch + 18
            draw_frame(x, y, name, i0, False)
            draw_frame(x + cw + 4, y, name, i1, False, trail=True)
            Q.text(d, (x, y + ch + 2), "%s f%d->f%d" % (name, i0, i1), size=9)
        outs.append(Q.save(im, "hats_%s.png" % hid))
    return " ".join(os.path.basename(o) for o in outs)


def t_emotes(ctx):
    if ctx.emotes is None:
        print("  emotes: renderer/emotes.webp not generated yet — skipped")
        return None
    lst = sorted(ctx.contract["emotes"]["list"].items(), key=lambda kv: kv[1]["row"])
    colw = 96 + 6
    panel = 8 * colw
    width = 170 + 2 * panel + 30
    height = 60 + len(lst) * (96 + 22)
    im = Image.new("RGBA", (width, height), (250, 250, 248, 255))
    d = ImageDraw.Draw(im)
    Q.text(d, (10, 6), "emotes: all 8 columns of every emote (native x4 cells) on #FFFFFF and #1E1E1E", size=14)
    Q.text(d, (10, 24), "cols 0 seed · 1 overshoot · 2 settle · 3-7 loop; green = used by the emote; guides: col 0 (left) and row 23 (bottom)",
           fill=GREY_TXT, size=10)
    for pi, bg in enumerate([(255, 255, 255, 255), (30, 30, 30, 255)]):
        for c in range(8):
            Q.text(d, (170 + pi * (panel + 20) + c * colw, 42), "col %d" % c, size=10)
    y = 58
    for name, e in lst:
        used = sorted(set([0, 1, 2] + list(e["loop"])))
        Q.text(d, (10, y + 30), name, size=12)
        Q.text(d, (10, y + 46), "%s w=%d" % (e["anchor"], e["w"]), fill=GREY_TXT, size=10)
        Q.text(d, (10, y + 60), "loop %s" % e["loop"], fill=GREY_TXT, size=10)
        for pi, bg in enumerate([(255, 255, 255, 255), (30, 30, 30, 255)]):
            for c in range(8):
                x = 170 + pi * (panel + 20) + c * colw
                d.rectangle([x, y, x + 95, y + 95], fill=bg)
                gcol = (120, 200, 255, 255) if pi else (150, 180, 255, 255)
                d.line([x, y + 96, x + 95, y + 96], fill=gcol)
                if e["anchor"] == "side":
                    d.line([x - 1, y, x - 1, y + 95], fill=gcol)
                else:
                    d.line([x + 48, y + 97, x + 51, y + 97], fill=gcol)
                cellimg = ctx.emote_cell(name, c)
                if cellimg is not None:
                    im.alpha_composite(cellimg, (x, y))
                d.rectangle([x, y + 99, x + 95, y + 101], fill=(40, 170, 80, 255) if c in used else (220, 220, 220, 255))
        y += 96 + 22
    return Q.save(im, "emotes.png")


STAGE_W, STAGE_H = 300, 280
BUBBLE = (98, 125, 202, 158)       # stage px, a "Thinking..." sized box (§1.5: ends at y 158)
TAIL = (144, 158, 156, 165)
BADGE = (180, 156, 204, 174)       # §1.5: x 180 to about 204, y 156-174


def compose_stage(ctx, name, pos, flip=False, climb=None, hidden=False, emote=None, ecol=2, hat=None,
                  bubble=False, badge=False):
    """Composites one stage (300x280 window) at 1 output px per cell px (= x1.818 stage px).
    Returns (image, report dict)."""
    inv = 1 / 0.55
    margin = 70
    W, H = int(round(STAGE_W * inv)) + 2 * margin, int(round(STAGE_H * inv)) + 2 * margin
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    a = ctx.anchor(name, pos)
    fr = ctx.frame(name, pos)
    rep = {"case": "", "emote": None, "hat": None, "issues": []}
    if fr is None or a is None:
        rep["issues"].append("frame or anchors not generated yet")
        return out, rep
    P = 300
    layer = Image.new("RGBA", (2 * P, 2 * P), (0, 0, 0, 0))  # body-px layer, body centre at (P, P)
    ox, oy = P - 96, P - 104
    big = Q.up(fr, 4)
    if flip:
        big = ImageOps.mirror(big)
    layer.alpha_composite(big, (ox, oy))
    body_mask_layer = layer.copy()
    hat_h = 0
    if hat:
        ok, why, box, origin_x = stage_hat(ctx, hat, name, pos, a, flip=flip, climb=climb, hidden=hidden,
                                           bubble=bubble, badge=badge)
        rep["hat"] = hat if ok else "%s hidden (%s)" % (hat, why)
        if ok:
            draw_hat(ctx, layer, hat, box, ox, oy, origin_x)
            # pet.js passes the visible hat's height, whatever its anchor (spec §3.4 "H")
            hat_h = int(ctx.contract["hats"]["list"][hat]["height"])
    angle = {None: 0, "right": 90, "left": -90}[climb]  # PIL ccw degrees; CSS rotate(-90deg) = ccw 90
    tx = {None: -96, "right": -1, "left": -191}[climb]
    # body centre (96,104) -> stage
    cx_st = 150 + 96 + tx
    cy_st = 72 + 208 + 0.55 * (104 - 208)
    cx_o, cy_o = cx_st * inv + margin, cy_st * inv + margin
    rot = layer.rotate(angle, Image.NEAREST, center=(P, P)) if angle else layer
    out.alpha_composite(rot, (int(round(cx_o - P)), int(round(cy_o - P))))
    body_rot = body_mask_layer.rotate(angle, Image.NEAREST, center=(P, P)) if angle else body_mask_layer
    body_full = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    body_full.alpha_composite(body_rot, (int(round(cx_o - P)), int(round(cy_o - P))))
    em_mask = None
    if emote:
        eb = emote_box(ctx, emote, name, pos, a, flip=flip, climb=climb, hidden=hidden, badge=badge, bubble=bubble,
                       hat_h=hat_h)
        rep["emote"] = "%s %s%s" % (emote, eb["anchor"], "" if eb["visible"] else " hidden (%s)" % eb["why"])
        cellimg = ctx.emote_cell(emote, ecol)
        if eb["visible"] and cellimg is not None:
            # #pet-emote lives in #pet-body: its own counter-rotation first, then the body's climb rotation
            em_body = Image.new("RGBA", (2 * P, 2 * P), (0, 0, 0, 0))
            paste_emote(em_body, cellimg, eb, ox, oy)
            em_rot = em_body.rotate(angle, Image.NEAREST, center=(P, P)) if angle else em_body
            em_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            em_layer.paste(em_rot, (int(round(cx_o - P)), int(round(cy_o - P))), em_rot)  # clips at the edge
            out.alpha_composite(em_layer)
            em_mask = em_layer.getchannel("A")
    # stage-level overlays: bubble + badge
    d = ImageDraw.Draw(out)

    def st(x, y):
        return x * inv + margin, y * inv + margin
    if bubble:
        x0, y0 = st(BUBBLE[0], BUBBLE[1])
        x1, y1 = st(BUBBLE[2], BUBBLE[3])
        d.rounded_rectangle([x0, y0, x1, y1], radius=10, fill=(255, 255, 255, 255), outline=(26, 26, 46, 255), width=4)
        tx0, ty0 = st(TAIL[0], TAIL[1])
        tx1, _ = st(TAIL[2], TAIL[1])
        tipx, tipy = st(150, TAIL[3])
        d.polygon([(tx0, ty0), (tx1, ty0), (tipx, tipy)], fill=(26, 26, 46, 255))
        Q.text(d, (x0 + 40, y0 + 18), "Thinking...", fill=(26, 26, 46, 255), size=20)
    if badge:
        x0, y0 = st(BADGE[0], BADGE[1])
        x1, y1 = st(BADGE[2], BADGE[3])
        d.rounded_rectangle([x0, y0, x1, y1], radius=16, fill=(26, 26, 46, 255))
        Q.text(d, (x0 + 16, y0 + 4), "2", fill=(255, 255, 255, 255), size=24)
    # numeric checks
    if em_mask is not None:
        def rect_hits(r):
            x0, y0 = st(r[0], r[1])
            x1, y1 = st(r[2], r[3])
            return em_mask.crop((int(x0), int(y0), int(x1) + 1, int(y1) + 1)).getbbox() is not None
        if bubble and (rect_hits(BUBBLE) or rect_hits(TAIL)):
            rep["issues"].append("emote overlaps the bubble")
        if badge and rect_hits(BADGE):
            rep["issues"].append("emote overlaps the badge")
        inside = em_mask.crop((margin, margin, W - margin, H - margin))
        tot = em_mask.width * em_mask.height - em_mask.histogram()[0]
        ins = inside.width * inside.height - inside.histogram()[0]
        if tot == 0:
            rep["issues"].append("emote cell is empty")
        elif ins < tot:
            rep["issues"].append("emote clipped by the stage (%d of %d px outside)" % (tot - ins, tot))
        ov = Image.eval(em_mask, lambda v: 255 if v else 0)
        bm = Image.eval(body_full.getchannel("A"), lambda v: 255 if v else 0)
        from PIL import ImageChops
        both = ImageChops.multiply(ov, bm)
        if both.getbbox():
            n = (both.width * both.height - both.histogram()[0]) // 16
            rep["issues"].append("emote overlaps the crab (%d logical px)" % n)
    # dim everything outside the stage (what the window clips)
    shade = Image.new("RGBA", (W, H), (255, 60, 60, 60))
    ImageDraw.Draw(shade).rectangle([margin, margin, W - margin - 1, H - margin - 1], fill=(0, 0, 0, 0))
    out.alpha_composite(shade)
    ImageDraw.Draw(out).rectangle([margin - 1, margin - 1, W - margin, H - margin], outline=(80, 80, 90, 255))
    return out, rep


EOR_CASES = [
    # (label, anim, frame, kwargs)
    ("idle f0 + side (bulb)", "idle", 0, dict(emote="bulb")),
    ("idle f0 + top (rain)", "idle", 0, dict(emote="rain")),
    ("idle f0 + bubble + side (dots)", "idle", 0, dict(emote="dots", ecol=3, bubble=True)),
    ("hop f3 apex + side (sparkle)", "hop", 3, dict(emote="sparkle")),
    ("hop f3 + side + 2-session badge", "hop", 3, dict(emote="sparkle", badge=True)),
    ("hop f3 + wizard + bubble", "hop", 3, dict(emote="note", hat="wizard", bubble=True)),
    ("trot f4 flipped + side (tool-read)", "trot", 4, dict(emote="tool-read", flip=True)),
    ("running-left f2 + side (tool-edit)", "running-left", 2, dict(emote="tool-edit")),
    ("dangle f1 + side (bangq)", "dangle", 1, dict(emote="bangq")),
    ("love f0 + side (hearts)", "love", 0, dict(emote="hearts", ecol=3)),
    ("waiting f0 + side (suppressed?)", "waiting", 0, dict(emote="question")),
    ("climb-left + side->top (tool-shell)", "running-right", 0, dict(emote="tool-shell", climb="left")),
    ("climb-right + side->top (tool-agent)", "running-right", 0, dict(emote="tool-agent", climb="right")),
    ("hidden (climb-right) + bang", "gaming", 0, dict(emote="bang", climb="right", hidden=True, hat="party")),
    ("idle + party hat + rain top", "idle", 0, dict(emote="rain", hat="party")),
    ("jumping f2 + side + badge", "jumping", 2, dict(emote="sweat", ecol=3, badge=True)),
]


def t_emote_on_rows(ctx):
    if ctx.emotes is None or not ctx.has_anchors():
        print("  emote_on_rows: %s — skipped" % ("emotes.webp not generated yet" if ctx.emotes is None else "meta.anchors not generated yet"))
        return None
    tiles, reps = [], []
    for label, name, pos, kw in EOR_CASES:
        img, rep = compose_stage(ctx, name, pos, **kw)
        rep["case"] = label
        tiles.append((label, img))
        reps.append(rep)
    tw, th = tiles[0][1].size
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    im = Image.new("RGBA", (cols * (tw + 10) + 10, 40 + rows * (th + 70)), (250, 250, 248, 255))
    d = ImageDraw.Draw(im)
    Q.text(d, (10, 6), "emote_on_rows: stage composites (1 px = 1 cell px = 1.82 stage px); red tint = outside the 300x280 window",
           size=14)
    for i, ((label, img), rep) in enumerate(zip(tiles, reps)):
        x = 10 + (i % cols) * (tw + 10)
        y = 40 + (i // cols) * (th + 70)
        im.alpha_composite(Q.checker(tw, th, sq=12), (x, y))
        im.alpha_composite(img, (x, y))
        Q.text(d, (x, y + th + 2), label, size=13)
        Q.text(d, (x, y + th + 20), "emote: %s | hat: %s" % (rep["emote"], rep["hat"]), fill=GREY_TXT, size=11)
        iss = "; ".join(rep["issues"]) or "no overlap / clip"
        Q.text(d, (x, y + th + 36), iss, fill=(200, 30, 30, 255) if rep["issues"] else (20, 120, 40, 255), size=11)
    p = Q.save(im, "emote_on_rows.png")
    print("  emote_on_rows checks:")
    for rep in reps:
        print("    %-40s %-44s %s" % (rep["case"], rep["emote"], "; ".join(rep["issues"]) or "ok"))
    overlay_parity(ctx)
    return p


def overlay_parity(ctx):
    """Python port (ref_emote_box / hat_visible+hat_box) vs renderer/overlay.js on every anchored frame,
    so the fallback never drifts from the runtime unnoticed."""
    ov = overlay_js(ctx)
    if not ov:
        print("  overlay parity: skipped (no node / overlay.js)")
        return
    el = ctx.contract["emotes"]["list"]
    side = [n for n, e in el.items() if e["anchor"] == "side"]
    top = [n for n, e in el.items() if e["anchor"] == "top"]
    emotes = sorted(set(side[:1] + top[:1] + [max(el, key=lambda n: el[n]["w"])] + (["tool-shell"] if "tool-shell" in el else [])))
    hats = [h for h in ("party", "shades", "headband") if h in ctx.contract["hats"]["list"]]
    n = bad = 0
    first = []
    for base, arr in sorted(ctx.meta["anchors"].items()):
        for fi, a in enumerate(arr):
            for flip in (False, True):
                for climb in (None, "left", "right"):
                    for em in emotes:
                        kw = dict(flip=flip, climb=climb, badge=flip, bubble=not flip, hat_h=4 if climb else 0)
                        js = ov.call("emoteBox", base, fi, dict(flip=flip, climbSide=climb, badgeVisible=kw["badge"],
                                                                bubbleVisible=kw["bubble"], emote=em, col=0,
                                                                hatHeight=kw["hat_h"]))
                        py = ref_emote_box(ctx, em, a, **kw)
                        keys = ("visible", "left", "top", "rotate", "originX", "originY") if js["visible"] else ("visible",)
                        n += 1
                        if any(js.get(k) != py.get(k) for k in keys):
                            bad += 1
                            if len(first) < 5:
                                first.append("emote %s %s f%d flip=%s climb=%s js=%s py=%s" % (
                                    em, base, fi, flip, climb, {k: js.get(k) for k in keys}, {k: py.get(k) for k in keys}))
                for hid in hats:
                    js = ov.call("hatBox", base, fi, dict(flip=flip, hatId=hid, animChanged=True, bubbleVisible=not flip))
                    ok, _why = hat_visible(ctx, hid, a, bubble=not flip)
                    left, top_, mirror, col = hat_box(ctx, hid, a, flip, False, fi)
                    n += 1
                    same = js["visible"] == ok and (not ok or (js["left"], js["top"], js["mirror"], js["col"]) == (left, top_, mirror, col))
                    if not same:
                        bad += 1
                        if len(first) < 5:
                            first.append("hat %s %s f%d flip=%s js=%s py=%s" % (
                                hid, base, fi, flip, (js["visible"], js["left"], js["top"], js["mirror"], js["col"]),
                                (ok, left, top_, mirror, col)))
    print("  overlay parity (Python port vs renderer/overlay.js): %d of %d placements differ" % (bad, n))
    for f in first:
        print("    " + f)


def t_tints(ctx):
    if ctx.sheet is None or ctx.nrows < 43:
        print("  tints: new rows not generated yet — skipped")
        return None
    cases = [("sad", "sad", range(8)), ("love", "rosy", range(8)), ("furious", "flush", range(6)), ("dangle", "pale", range(4, 8)),
             ("idle", None, range(1))]
    k = 3
    cw, ch = 48 * k, 52 * k
    width = 150 + 8 * (cw + 8)
    height = 90 + len(cases) * (ch + 44)
    im = Image.new("RGBA", (width, height), (250, 250, 248, 255))
    d = ImageDraw.Draw(im)
    Q.text(d, (10, 6), "tints: every tinted frame (3x) with its measured body / leg colours vs §1.4", size=14)
    x = 10
    for tname, (body, legs) in list(Q.TINTS.items()) + [("coral", (Q.CORAL, (192, 98, 68)))]:
        d.rectangle([x, 30, x + 40, 60], fill=body + (255,))
        d.rectangle([x + 42, 30, x + 60, 60], fill=legs + (255,))
        Q.text(d, (x, 63), tname, size=10)
        x += 90
    y = 90
    bad = []
    for name, tint, frames in cases:
        Q.text(d, (10, y + ch // 2 - 6), "%s (%s)" % (name, tint or "untinted ref"), size=11)
        for j, pos in enumerate(frames):
            fr = ctx.frame(name, pos)
            xx = 150 + j * (cw + 8)
            paste_cell(im, fr, xx, y, k, anchor=None)
            if fr is None:
                continue
            counts = {}
            for cnt, p in fr.getcolors(maxcolors=1 << 16) or []:
                if p[3] == 255:
                    counts[p[:3]] = counts.get(p[:3], 0) + cnt
            top = sorted(counts.items(), key=lambda kv: -kv[1])[:3]
            exp_body = Q.TINTS[tint][0] if tint else Q.CORAL
            exp_legs = Q.TINTS[tint][1] if tint else (192, 98, 68)
            ok = top and top[0][0] == exp_body
            legs_ok = exp_legs in counts
            if not ok or not legs_ok:
                bad.append("%s f%d body=%s legs present=%s" % (name, pos, top[0][0] if top else None, legs_ok))
            Q.text(d, (xx, y + ch + 3), "body %s" % ("ok" if ok else "!= %s" % (top[0][0],)), fill=(20, 120, 40, 255) if ok else RED, size=9)
            Q.text(d, (xx, y + ch + 15), "legs %s" % ("ok" if legs_ok else "missing"), fill=(20, 120, 40, 255) if legs_ok else RED, size=9)
            coral_left = counts.get(Q.CORAL, 0)
            if tint and coral_left:
                bad.append("%s f%d still has %d coral px" % (name, pos, coral_left))
                Q.text(d, (xx, y + ch + 27), "%d coral px" % coral_left, fill=RED, size=9)
        y += ch + 44
    print("  tints: %s" % ("ok" if not bad else "; ".join(bad[:10])))
    return Q.save(im, "tints.png")


def t_bg_contrast(ctx):
    k = 2
    cw, ch = 48 * k, 52 * k
    bgs = [("#FFFFFF", Image.new("RGBA", (8 * cw, ch), (255, 255, 255, 255))),
           ("#1E1E1E", Image.new("RGBA", (8 * cw, ch), (30, 30, 30, 255))),
           ("busy", Q.busy_bg(8 * cw, ch))]
    names = [n for n, r in sorted(ctx.contract["rows"].items(), key=lambda kv: kv[1]["row"])]
    elist = sorted(ctx.contract["emotes"]["list"].items(), key=lambda kv: kv[1]["row"])
    pw = 8 * cw + 16
    width = 110 + 3 * pw
    erows = (len(elist) + 7) // 8
    height = 50 + len(names) * (ch + 8) + 40 + erows * 3 * 0 + erows * (96 + 18)
    im = Image.new("RGBA", (width, height), (250, 250, 248, 255))
    d = ImageDraw.Draw(im)
    Q.text(d, (10, 6), "bg_contrast: every new row (2x) and emote settle column (x4) on #FFFFFF, #1E1E1E and a busy wallpaper", size=14)
    for i, (bl, _b) in enumerate(bgs):
        Q.text(d, (110 + i * pw, 28), bl, size=12)
    y = 48
    for name in names:
        Q.text(d, (10, y + ch // 2 - 6), name, size=10)
        for i, (_bl, bgimg) in enumerate(bgs):
            x0 = 110 + i * pw
            im.alpha_composite(bgimg, (x0, y))
            base, row, idx, _d = Q.resolve(ctx.contract, name)
            for pos in range(len(idx)):
                fr = ctx.frame(name, pos)
                if fr is None:
                    im.alpha_composite(missing_cell(cw, ch, ""), (x0 + pos * cw, y))
                else:
                    im.alpha_composite(Q.up(fr, k), (x0 + pos * cw, y))
        y += ch + 8
    y += 30
    Q.text(d, (10, y - 20), "emotes (settle column)", size=12)
    if ctx.emotes is None:
        Q.text(d, (110, y), "emotes.webp not generated yet", fill=GREY_TXT, size=12)
    else:
        for i, (_bl, _b) in enumerate(bgs):
            x0 = 110 + i * pw
            bgbig = [Image.new("RGBA", (8 * 96, erows * (96 + 18)), (255, 255, 255, 255)),
                     Image.new("RGBA", (8 * 96, erows * (96 + 18)), (30, 30, 30, 255)),
                     Q.busy_bg(8 * 96, erows * (96 + 18), sq=12)][i]
            panel = bgbig.copy()
            pd = ImageDraw.Draw(panel)
            for j, (name, e) in enumerate(elist):
                cx, cy = (j % 8) * 96, (j // 8) * (96 + 18)
                cimg = ctx.emote_cell(name, 2)
                if cimg is not None:
                    panel.alpha_composite(cimg, (cx, cy))
                pd.rectangle([cx, cy + 97, cx + 95, cy + 112], fill=(250, 250, 248, 255))
                Q.text(pd, (cx + 2, cy + 98), name, size=10)
            panel = panel.resize((int(panel.width * (8 * cw) / (8 * 96)), int(panel.height * (8 * cw) / (8 * 96))), Image.NEAREST)
            im.alpha_composite(panel, (x0, y))
    return Q.save(im, "bg_contrast.png")


TARGETS = {
    "rows_new": t_rows_new, "rows_all": t_rows_all, "aliases": t_aliases, "trot_vs_run": t_trot_vs_run,
    "hats": t_hats, "emotes": t_emotes, "emote_on_rows": t_emote_on_rows, "tints": t_tints, "bg_contrast": t_bg_contrast,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("targets", nargs="*", default=list(TARGETS.keys()))
    args = ap.parse_args()
    ctx = Ctx()
    Q.ensure_dir(Q.OUT)
    for t in args.targets:
        if t not in TARGETS:
            print("unknown target %s (known: %s)" % (t, ", ".join(TARGETS)))
            continue
        r = TARGETS[t](ctx)
        print("%-14s %s" % (t, r if r else "skipped"))


if __name__ == "__main__":
    main()
