# -*- coding: utf-8 -*-
"""Static contract checks for the Claw'd animation build (spec §7 "Common C deliverables", §8.1).

Usage (from ClaudeCodePet/):
  "E:/Vibegaming playground/30_Tools/py311/python.exe" tools/qa/check_contract.py [--part rows|overlays|all] [--json]

  --part rows      Gate 1: meta vs contract, frame counts, sheet size, rows 0-21 regression, icons,
                   anchors, unused/blank cells, spec-derived flag expectations.
  --part overlays  Gate 2: emote/hat meta, sheet sizes, emote placement and widths, contrast gate, hats.
  --part all       both (default).

Exit code: 0 when nothing FAILs (WARN and SKIP do not fail), 1 otherwise.
A report is also written to tools/qa/out/check_report.txt (and .json with --json).
Missing inputs (files executor A has not generated yet) are reported as FAIL with
"not generated yet", so a gate can never pass on missing files.
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qa_common as Q  # noqa: E402
import spec_bitmaps as SB  # noqa: E402
from PIL import ImageChops  # noqa: E402

RESULTS = []


def rec(status, cid, title, detail=""):
    RESULTS.append({"status": status, "id": cid, "title": title, "detail": detail})


def PASS(cid, title, detail=""):
    rec("PASS", cid, title, detail)


def FAIL(cid, title, detail=""):
    rec("FAIL", cid, title, detail)


def WARN(cid, title, detail=""):
    rec("WARN", cid, title, detail)


def SKIP(cid, title, detail=""):
    rec("SKIP", cid, title, detail)


def short(lst, n=12):
    lst = list(lst)
    s = ", ".join(str(x) for x in lst[:n])
    return s + (" … (+%d more)" % (len(lst) - n) if len(lst) > n else "")


def deep_diff(a, b, path=""):
    """List of human-readable differences between expected a and actual b."""
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in a:
            if k not in b:
                out.append("%s.%s missing" % (path, k))
            else:
                out += deep_diff(a[k], b[k], "%s.%s" % (path, k))
        for k in b:
            if k not in a:
                out.append("%s.%s unexpected (=%s)" % (path, k, json.dumps(b[k])[:60]))
    elif a != b:
        out.append("%s expected %s got %s" % (path, json.dumps(a)[:80], json.dumps(b)[:80]))
    return out


# ───────────────────────────── expectations derived from the spec ─────────────────────────────
TINTED_EXPECT = {"sad": "all", "love": "all", "furious": "all", "dangle": [4, 5, 6, 7]}
VIEW_EXPECT = {"trot": [0, 1, 2, 2, 2, 2, 2, 2]}
# HAT_OK off (§3.2 + lead decision 1, 2026-09-27):
#   - lid frames: chomp f1-f5 (lid frames plus the f4 deflicker), all of furious;
#   - cool f0-f2 (the falling shades are the gag; a hat must not cover them);
#   - nightcap / headphones rows (sleep, gaming; §5.1 F4);
#   - every frame that sets MARK_TOP (a baked mark sits where a hat goes). The spec's list is pinned in
#     MARK_TOP_EXPECT below; the R11 check ALSO derives it from the meta flags (any MARK_TOP frame must be
#     HAT_OK-off), so a mark A adds later is covered without editing this table.
MARK_TOP_EXPECT = {"sad": "all", "dangle": [4, 5, 6, 7], "surprised": [6, 7], "dizzy": "all"}
HAT_OFF = {"chomp": [1, 2, 3, 4, 5], "cool": [0, 1, 2], "furious": "all", "sleep": "all", "gaming": "all"}
HAT_OFF.update(MARK_TOP_EXPECT)
# FACE_OK for the new rows, derived frame by frame from §2 and the §3.2 FACE_OK rule
FACE_ON = {
    "look": [1] * 8,
    "hop": [1, 1, 1, 1, 1, 0, 1, 1],
    "dangle": [1, 1, 1, 1, 0, 0, 0, 0],
    "dizzy": [0] * 8,
    "surprised": [1] * 8,
    "plotting": [1] * 6,
    "yawn": [1, 1, 0, 0, 0, 0, 1, 1],
    "love": [0] * 8,
    "laugh": [1, 0, 0, 0, 0, 0],
    "nervous": [1] * 8,
    "fingers-crossed": [0] * 4,
    "sad": [0] * 8,
    "summon": [1, 0, 1, 1, 1, 1, 1, 1],
    "chomp": [1, 0, 0, 0, 0, 0, 1, 1],
    "furious": [0] * 6,
    "work-read": [0] * 6,
    "work-shell": [1] * 6,
    "dance": [1] * 8,
    "cool": [0] * 8,
    "trot": [1, 0, 0, 0, 0, 0, 0, 0],
    "fall": [1, 1],
}
MARKED_ROWS = ["waiting", "review", "nervous"]  # F3: no side emote may show on these


def frames_set(spec, n):
    return set(range(n)) if spec == "all" else set(spec)


# ───────────────────────────────────────── rows part ─────────────────────────────────────────
def check_rows(contract, meta, meta_js):
    new_rows = contract["rows"]
    table = Q.row_table(contract)

    # R1 contract sanity
    if len(new_rows) == 21 and len(contract["aliases"]) == 8 and sorted(r["row"] for r in new_rows.values()) == list(range(22, 43)):
        PASS("R1", "contract.json: 21 new rows (22-42), 8 aliases")
    else:
        FAIL("R1", "contract.json malformed", "rows=%d aliases=%d" % (len(new_rows), len(contract["aliases"])))

    # R2 meta files present and identical
    if meta is None:
        FAIL("R2", "meta files", "clawd_meta.json: not generated yet / unreadable")
    elif meta_js is None:
        FAIL("R2", "meta files", "clawd_meta.json ok, but clawd_meta.js: not generated yet / unreadable")
    else:
        d = deep_diff(meta, meta_js)
        if d:
            FAIL("R2", "clawd_meta.js and clawd_meta.json differ", short(d, 6))
        else:
            PASS("R2", "clawd_meta.js == clawd_meta.json")

    if meta is not None:
        # R3 version + sheet
        d = deep_diff({"version": contract["version"], "sheet": contract["sheet"]},
                      {"version": meta.get("version"), "sheet": meta.get("sheet")})
        (FAIL if d else PASS)("R3", "meta.version / meta.sheet == contract", short(d))
        # R4 rows
        d = deep_diff(new_rows, meta.get("rows", {}), "rows")
        (FAIL if d else PASS)("R4", "meta.rows == contract.rows (names, indexes, frames, durations, loop, fallbacks)", short(d))
        # R5 aliases / expr / shakeFrames
        d = deep_diff({"aliases": contract["aliases"], "expr": contract["expr"], "shakeFrames": contract["shakeFrames"]},
                      {"aliases": meta.get("aliases"), "expr": meta.get("expr"), "shakeFrames": meta.get("shakeFrames")})
        (FAIL if d else PASS)("R5", "meta.aliases / expr / shakeFrames == contract", short(d))
    else:
        for cid, t in (("R3", "meta.version / sheet"), ("R4", "meta.rows"), ("R5", "meta.aliases / expr / shakeFrames")):
            FAIL(cid, t, "clawd_meta.json not generated yet")

    # R6 frame-count rules (on the meta when present, else on the contract itself)
    src = meta if meta is not None and "rows" in meta else contract
    bad = []
    for name, r in src.get("rows", {}).items():
        fr, du = r.get("frames", 0), r.get("frameDurations", [])
        if not (1 <= fr <= 8):
            bad.append("%s frames=%s" % (name, fr))
        if len(du) != fr:
            bad.append("%s len(durations)=%d != frames %d" % (name, len(du), fr))
        if any((not isinstance(x, (int, float))) or x <= 0 for x in du):
            bad.append("%s has a 0/negative duration" % name)
        ls, le = r.get("loopStart", 0), r.get("loopEnd", fr - 1)
        if not (0 <= ls <= le <= fr - 1):
            bad.append("%s loopStart/loopEnd %s/%s out of range" % (name, ls, le))
    for name, a in src.get("aliases", {}).items():
        base = table.get(a.get("of"))
        if not base:
            bad.append("alias %s: unknown base %s" % (name, a.get("of")))
            continue
        if len(a["frameIndices"]) != len(a["frameDurations"]):
            bad.append("alias %s: indices/durations length differ" % name)
        if any(i < 0 or i >= base["frames"] for i in a["frameIndices"]):
            bad.append("alias %s: frame index out of range" % name)
        if len(a["frameIndices"]) > 8:
            bad.append("alias %s: more than 8 frames" % name)
    (FAIL if bad else PASS)("R6", "frames <= 8, len(durations) == frames, no 0 ms, loop ranges, alias indices (%s)"
                            % ("meta" if src is meta else "contract only"), short(bad))

    # R7 sheet size
    sheet = Q.load_image(Q.SHEET)
    if sheet is None:
        FAIL("R7", "spritesheet.webp size", "renderer/spritesheet.webp missing")
    elif sheet.size == (1536, 8944):
        PASS("R7", "spritesheet.webp is 1536x8944 (43 rows)")
    else:
        FAIL("R7", "spritesheet.webp size", "got %dx%d (%d rows); expected 1536x8944 — new rows not generated yet?"
             % (sheet.width, sheet.height, sheet.height // Q.CH))

    # R8 rows 0-21 pixel regression
    bpath, bmsg = Q.ensure_baseline()
    if sheet is None or bpath is None:
        FAIL("R8", "rows 0-21 pixel regression", bmsg if bpath is None else "sheet missing")
    else:
        base = Q.load_image(bpath)
        box = (0, 0, 1536, 4576)
        if base.size != (1536, 4576):
            FAIL("R8", "rows 0-21 pixel regression", "baseline is %dx%d, expected 1536x4576" % base.size)
        elif sheet.width < 1536 or sheet.height < 4576:
            FAIL("R8", "rows 0-21 pixel regression", "sheet too small: %dx%d" % sheet.size)
        else:
            a = base.crop(box)
            b = sheet.crop(box)
            diff = ImageChops.difference(a, b)
            if diff.getbbox() is None:
                PASS("R8", "rows 0-21 pixel-identical (decoded RGBA) to tmp/baseline", "baseline: " + bmsg)
            else:
                per_row = []
                visible = 0
                pa, pb = a.load(), b.load()
                bb = diff.getbbox()
                for y in range(bb[1], bb[3]):
                    for x in range(bb[0], bb[2]):
                        p, q = pa[x, y], pb[x, y]
                        if p != q and not (p[3] == 0 and q[3] == 0):
                            visible += 1
                for r in range(22):
                    rb = diff.crop((0, r * Q.CH, 1536, (r + 1) * Q.CH)).getbbox()
                    if rb:
                        per_row.append("row %d (%s) bbox %s" % (r, Q.OLD_ROWS[r][0], rb))
                FAIL("R8", "rows 0-21 differ from baseline",
                     "%d visible px differ%s; %s" % (visible, " (only RGB under alpha 0 differs: invisible, but not identical)"
                                                     if visible == 0 else "", short(per_row, 6)))

    # R9 icons untouched
    r = Q.git("status", "--porcelain", "assets/icon.png", "assets/icon.ico", "assets/tray.png")
    out = r.stdout.decode("utf-8", "replace").strip()
    if r.returncode != 0:
        FAIL("R9", "icons untouched", "git status failed: " + r.stderr.decode("utf-8", "replace")[:200])
    elif out:
        FAIL("R9", "icons untouched", "git status --porcelain shows: " + out.replace("\n", " | "))
    else:
        PASS("R9", "assets/icon.png, icon.ico, tray.png untouched (git status clean)")

    # R10 anchors completeness and bounds
    if meta is None or "anchors" not in meta:
        FAIL("R10", "anchors for all 43 rows", "meta.anchors not generated yet")
    else:
        anc = meta["anchors"]
        bad = []
        for name, row, frames, _d in Q.all_rows(contract):
            arr = anc.get(name)
            if arr is None:
                bad.append("%s missing" % name)
                continue
            if len(arr) != frames:
                bad.append("%s has %d anchors, expected %d" % (name, len(arr), frames))
            for i, t in enumerate(arr):
                if not (isinstance(t, list) and len(t) == 5 and all(isinstance(v, int) and not isinstance(v, bool) for v in t)):
                    bad.append("%s[%d] not 5 ints: %s" % (name, i, t))
                    continue
                hx, hy, ey, fl, vw = t
                if not (-8 <= hx <= 56):
                    bad.append("%s[%d] hx=%d" % (name, i, hx))
                if not (-8 <= hy <= 60) or not (-8 <= ey <= 60):
                    bad.append("%s[%d] hy/ey=%d/%d" % (name, i, hy, ey))
                if not (0 <= fl <= 127):
                    bad.append("%s[%d] flags=%d" % (name, i, fl))
                if vw not in (0, 1, 2):
                    bad.append("%s[%d] view=%d" % (name, i, vw))
        extra = [k for k in anc if k not in table]
        if extra:
            bad.append("unexpected anchor keys: %s" % extra)
        (FAIL if bad else PASS)("R10", "anchors: every frame of rows 0-42, 5 ints, x in -8..56, y in -8..60", short(bad))
        check_flag_expectations(contract, anc)
        check_anchor_silhouette(contract, anc, sheet)

    # R12 unused cells empty, used cells not blank
    if sheet is None:
        FAIL("R12", "unused cells empty / used cells drawn", "sheet missing")
    else:
        nrows = sheet.height // Q.CH
        dirty, blank, missing = [], [], []
        for name, row, frames, _d in Q.all_rows(contract):
            if row >= nrows:
                missing.append(name)
                continue
            for col in range(8):
                a = Q.cell(sheet, row, col).getchannel("A").getbbox()
                if col >= frames and a:
                    dirty.append("%s r%d c%d" % (name, row, col))
                if col < frames and not a:
                    blank.append("%s r%d c%d" % (name, row, col))
        msgs = []
        if dirty:
            msgs.append("opaque px in unused cells: " + short(dirty, 8))
        if blank:
            msgs.append("blank used cells: " + short(blank, 8))
        if missing:
            msgs.append("rows not in sheet yet: " + short(missing, 6))
        (FAIL if msgs else PASS)("R12", "no opaque pixels in unused cells; no blank used cell (%d rows in sheet)" % nrows,
                                 " ; ".join(msgs))


def check_flag_expectations(contract, anc):
    F = Q.FLAGS
    bad = []

    def frames(name):
        return anc.get(name) or []

    # TINTED exact
    for name, _r, n, _d in Q.all_rows(contract):
        exp = frames_set(TINTED_EXPECT[name], n) if name in TINTED_EXPECT else set()
        for i, t in enumerate(frames(name)):
            has = bool(t[3] & F["TINTED"])
            if has != (i in exp):
                bad.append("%s[%d] TINTED=%s expected %s" % (name, i, has, i in exp))
    # MIRRORED only running-left
    for name, _r, n, _d in Q.all_rows(contract):
        for i, t in enumerate(frames(name)):
            has = bool(t[3] & F["MIRRORED"])
            if has != (name == "running-left"):
                bad.append("%s[%d] MIRRORED=%s" % (name, i, has))
    # view
    for name, _r, n, _d in Q.all_rows(contract):
        exp = VIEW_EXPECT.get(name, [0] * n)
        for i, t in enumerate(frames(name)):
            if i < len(exp) and t[4] != exp[i]:
                bad.append("%s[%d] view=%d expected %d" % (name, i, t[4], exp[i]))
    # HAT_OK / EMOTE_OK / FACE_OK on new rows are fully determined by the spec
    # (HAT_OK: the fixed table plus every frame whose meta sets MARK_TOP, lead decision 1)
    for name, r in contract["rows"].items():
        hat_off = frames_set(HAT_OFF[name], r["frames"]) if name in HAT_OFF else set()
        hat_off |= {i for i, t in enumerate(frames(name)) if t[3] & F["MARK_TOP"]}
        for i, t in enumerate(frames(name)):
            if bool(t[3] & F["HAT_OK"]) == (i in hat_off):
                bad.append("%s[%d] HAT_OK=%s expected %s" % (name, i, bool(t[3] & F["HAT_OK"]), i not in hat_off))
            if not t[3] & F["EMOTE_OK"]:
                bad.append("%s[%d] EMOTE_OK off (no rot in new rows)" % (name, i))
            exp_face = FACE_ON.get(name, [None] * 8)[i] if i < len(FACE_ON.get(name, [])) else None
            if exp_face is not None and bool(t[3] & F["FACE_OK"]) != bool(exp_face):
                bad.append("%s[%d] FACE_OK=%s expected %s" % (name, i, bool(t[3] & F["FACE_OK"]), bool(exp_face)))
    # old rows: sleep / gaming no hat
    for name in ("sleep", "gaming"):
        for i, t in enumerate(frames(name)):
            if t[3] & F["HAT_OK"]:
                bad.append("%s[%d] HAT_OK set (nightcap/headphones row)" % (name, i))
    # any row (old ones too): a baked top mark and a hat never share a frame (lead decision 1)
    for name, _r, n, _d in Q.all_rows(contract):
        if name in contract["rows"]:
            continue   # already covered above
        for i, t in enumerate(frames(name)):
            if t[3] & F["MARK_TOP"] and t[3] & F["HAT_OK"]:
                bad.append("%s[%d] HAT_OK set on a MARK_TOP frame" % (name, i))
    # FACE_OK implies view 0
    for name, _r, n, _d in Q.all_rows(contract):
        for i, t in enumerate(frames(name)):
            if t[3] & F["FACE_OK"] and t[4] != 0:
                bad.append("%s[%d] FACE_OK on a non-front view" % (name, i))
    (FAIL if bad else PASS)("R11", "flags/view match the spec (TINTED, MIRRORED, view, HAT_OK/EMOTE_OK/FACE_OK on new rows)",
                            short(bad, 16))

    # backflip: 6 rotated frames lose HAT_OK (§3.6 note) — informational
    bf = frames("backflip")
    off = [i for i, t in enumerate(bf) if not t[3] & F["HAT_OK"]]
    if bf and len(off) != 6:
        WARN("R11b", "backflip HAT_OK-off frames", "%d frames off (%s); §3.6 expects 6 rotated frames" % (len(off), off))
    elif bf:
        PASS("R11b", "backflip: 6 frames without HAT_OK (expected disappearance)")
    # lead decision 1 names the MARK_TOP frames; report drift from that list (informational: the HAT_OK
    # rule above already follows whatever the meta sets)
    # (an extra MARK_TOP frame that the fixed table already takes the hat off, e.g. chomp f3, is noted only)
    miss, extra, covered = [], [], []
    for name, r in contract["rows"].items():
        exp = frames_set(MARK_TOP_EXPECT[name], r["frames"]) if name in MARK_TOP_EXPECT else set()
        fixed = frames_set(HAT_OFF[name], r["frames"]) if name in HAT_OFF else set()
        got = {i for i, t in enumerate(frames(name)) if t[3] & F["MARK_TOP"]}
        miss += ["%s[%d]" % (name, i) for i in sorted(exp - got)]
        extra += ["%s[%d]" % (name, i) for i in sorted(got - exp - fixed)]
        covered += ["%s[%d]" % (name, i) for i in sorted((got - exp) & fixed)]
    note = ("also MARK_TOP, already hat-off by the fixed table: " + short(covered)) if covered else ""
    if miss or extra:
        WARN("R11d", "MARK_TOP frames vs lead decision 1 (sad all, dangle 4-7, surprised 6-7, dizzy all)",
             "missing: %s; extra: %s%s" % (short(miss) or "-", short(extra) or "-", ("; " + note) if note else ""))
    else:
        PASS("R11d", "MARK_TOP frames match lead decision 1 (sad all, dangle 4-7, surprised 6-7, dizzy all)", note)
    # F3: side emotes must be suppressed on baked-mark rows
    bad = []
    for name in MARKED_ROWS:
        for i, t in enumerate(frames(name)):
            if t[3] & F["EMOTE_OK"] and not t[3] & F["MARK_SIDE"]:
                bad.append("%s[%d]" % (name, i))
    (WARN if bad else PASS)("R11c", "MARK_SIDE set on waiting / review / nervous (F3 suppression)",
                            ("a side emote would show on: " + short(bad)) if bad else "")


def check_anchor_silhouette(contract, anc, sheet):
    """WARN-level proxy for 'hat sits on the head': on HAT_OK front-view frames the first opaque
    pixel in columns hx-1..hx+1, scanning down from hy-3, should be at hy (no gap, no float)."""
    if sheet is None:
        return
    F = Q.FLAGS
    nrows = sheet.height // Q.CH
    bad = []
    for name, row, frames, _d in Q.all_rows(contract):
        if row >= nrows:
            continue
        for i, t in enumerate(anc.get(name) or []):
            hx, hy, ey, fl, vw = t
            if not fl & F["HAT_OK"] or fl & F["MARK_TOP"] or vw != 0:
                continue
            img = Q.cell_logical(sheet, row, i)
            px = img.load()
            first = None
            for y in range(max(0, hy - 3), min(Q.LH, hy + 6)):
                if any(0 <= x < Q.LW and px[x, y][3] > 0 for x in (hx - 1, hx, hx + 1)):
                    first = y
                    break
            if first != hy:
                bad.append("%s[%d] hy=%d first body px %s" % (name, i, hy, first))
    (WARN if bad else PASS)("R13", "anchor hy matches the head-top silhouette on HAT_OK front frames", short(bad, 10))


# ─────────────────────────────────────── overlays part ───────────────────────────────────────
def check_overlays(contract, meta):
    em_c, hat_c = contract["emotes"], contract["hats"]
    # O1 meta.emotes / meta.hats
    if meta is None:
        FAIL("O1", "meta.emotes / meta.hats == contract", "clawd_meta.json not generated yet")
    else:
        msgs = []
        for key, exp in (("emotes", em_c), ("hats", hat_c)):
            if key not in meta:
                msgs.append("meta.%s not generated yet (executor A step 7)" % key)
            else:
                msgs += deep_diff(exp, meta[key], key)
        (FAIL if msgs else PASS)("O1", "meta.emotes / meta.hats == contract", short(msgs))

    em = Q.load_image(Q.EMOTES)
    hats = Q.load_image(Q.HATS)
    # O2 sizes
    msgs = []
    if em is None:
        msgs.append("emotes.webp not generated yet")
    elif em.size != (768, 1632):
        msgs.append("emotes.webp %dx%d != 768x1632" % em.size)
    if hats is None:
        msgs.append("hats.webp not generated yet")
    elif hats.size != (640, 1536):
        msgs.append("hats.webp %dx%d != 640x1536" % hats.size)
    (FAIL if msgs else PASS)("O2", "emotes.webp 768x1632, hats.webp 640x1536", " ; ".join(msgs))

    if em is not None:
        check_emotes(em_c, em)
    else:
        FAIL("O3", "emote placement / widths", "emotes.webp not generated yet")
        FAIL("O4", "contrast gate (§3.5)", "emotes.webp not generated yet")
    if hats is not None:
        check_hats(hat_c, hats)
    else:
        FAIL("O5", "hat bitmaps vs Appendix B.4", "hats.webp not generated yet")


def emote_cells(em, row):
    """8 logical 24x24 columns of an emote row + whether the x4 cells are clean 4x4 blocks."""
    cols, clean = [], True
    for c in range(8):
        big = em.crop((c * 96, row * 96, (c + 1) * 96, (row + 1) * 96))
        small = Q.logical(big)
        if clean and Q.up(small, 4).tobytes() != big.tobytes():
            clean = False
        cols.append(small)
    return cols, clean


def check_emotes(em_c, em):
    place_bad, warn_bad, meas = [], [], []
    gate_bad, gate_rows = [], []
    nrows = em.height // 96
    for name, e in sorted(em_c["list"].items(), key=lambda kv: kv[1]["row"]):
        if e["row"] >= nrows:
            place_bad.append("%s: row %d missing" % (name, e["row"]))
            continue
        cols, clean = emote_cells(em, e["row"])
        if not clean:
            warn_bad.append("%s: x4 cells are not clean 4x4 blocks" % name)
        used = sorted(set([0, 1, 2] + list(e["loop"])))
        for c in range(8):
            has = Q.opaque_bbox(cols[c]) is not None
            if c in used and not has:
                if not (name == "dots" and c == 4):  # dots col 4 is the "0 dots" frame
                    place_bad.append("%s col %d empty (used)" % (name, c))
            if c not in used and has:
                warn_bad.append("%s col %d unused but not empty" % (name, c))
        l, t, r, b = 99, 99, -1, -1
        for c in range(8):
            bb = Q.opaque_bbox(cols[c])
            if bb:
                l, t, r, b = min(l, bb[0]), min(t, bb[1]), max(r, bb[2]), max(b, bb[3])
        if r < 0:
            place_bad.append("%s: all columns empty" % name)
            continue
        h = b - t + 1
        if e["anchor"] == "side":
            w = r + 1
            if l != 0:
                place_bad.append("%s: leftmost px at col %d, expected 0" % (name, l))
        else:
            w = r - l + 1
            if abs((l + r) / 2.0 - 12) > 0.5:
                place_bad.append("%s: top emote centred on %.1f, expected 12" % (name, (l + r) / 2.0))
        if b != 23:
            place_bad.append("%s: lowest px on row %d, expected 23" % (name, b))
        if h > 14:
            place_bad.append("%s: %d rows tall > 14" % (name, h))
        if w != e["w"]:
            place_bad.append("%s: measured w=%d, contract w=%d" % (name, w, e["w"]))
        meas.append("%s w=%d h=%d" % (name, w, h))
        # overshoot == settle one px higher (not for dots, whose cols 1-4 are dot counts)
        if name != "dots":
            s, o = cols[2], cols[1]
            so = s.load()
            oo = o.load()
            mism = 0
            for y in range(24):
                for x in range(24):
                    a = so[x, y]
                    bpx = oo[x, y - 1] if y - 1 >= 0 else (0, 0, 0, 0)
                    if (a[3] > 0) != (bpx[3] > 0):
                        mism += 1
            if mism:
                warn_bad.append("%s: overshoot col != settle 1 px higher (%d px)" % (name, mism))
        # contrast gate on the settle column
        px = cols[2].load()
        P, cw, cd = 0, 0, 0
        for y in range(24):
            for x in range(24):
                p = px[x, y]
                if p[3] == 0:
                    continue
                P += 1
                if Q.contrast(Q.over(p, (255, 255, 255)), (255, 255, 255)) >= 3.0:
                    cw += 1
                if Q.contrast(Q.over(p, (30, 30, 30)), (30, 30, 30)) >= 3.0:
                    cd += 1
        need = max(4, int(math.ceil(0.25 * P)))
        line = "%s P=%d white=%d dark=%d need=%d" % (name, P, cw, cd, need)
        gate_rows.append(line)
        if cw < need or cd < need:
            gate_bad.append(line)
    (FAIL if place_bad else PASS)("O3", "emotes: bottom row 23, side left col 0 / top centred 12, <= 14 rows, w == contract, used cols drawn",
                                  short(place_bad, 10) if place_bad else short(meas, 17))
    if warn_bad:
        WARN("O3b", "emote sheet hygiene (clean x4 blocks, unused cols empty, overshoot = settle 1 px up)", short(warn_bad, 10))
    else:
        PASS("O3b", "emote sheet hygiene (clean x4 blocks, unused cols empty, overshoot = settle 1 px up)")
    (FAIL if gate_bad else PASS)("O4", "contrast gate (§3.5): >= max(4, 25%) px at 3:1 vs #FFFFFF and #1E1E1E",
                                 short(gate_bad, 17) if gate_bad else short(gate_rows, 17))


def check_hats(hat_c, hats):
    bad, warn = [], []
    nrows = hats.height // 128
    for hid, h in sorted(hat_c["list"].items(), key=lambda kv: kv[1]["row"]):
        if h["row"] >= nrows:
            bad.append("%s row missing" % hid)
            continue
        cols = []
        for c in range(4):
            big = hats.crop((c * 160, h["row"] * 128, (c + 1) * 160, (h["row"] + 1) * 128))
            small = Q.logical(big)
            if Q.up(small, 4).tobytes() != big.tobytes():
                warn.append("%s col %d not clean 4x4 blocks" % (hid, c))
            cols.append(small)
        # front column exact vs B.4
        for cname, ci in (("front", 0), ("alt", 3)):
            if cname == "alt" and hid not in SB.HAT_ALT:
                exp = SB.expected_cell(hid, "front")
            else:
                exp = SB.expected_cell(hid, cname)
            px = cols[ci].load()
            mism = []
            for y in range(32):
                for x in range(40):
                    p = px[x, y]
                    e = exp.get((x, y))
                    if e is None and p[3] != 0:
                        mism.append((x, y))
                    elif e is not None and (p[3] != 255 or tuple(p[:3]) != e):
                        mism.append((x, y))
            if mism:
                bad.append("%s %s: %d px differ from B.4 (first %s)" % (hid, cname, len(mism), mism[:3]))
        # q = front shifted +2
        f, q = cols[0].load(), cols[1].load()
        qm = sum(1 for y in range(32) for x in range(40)
                 if (f[x - 2, y] if x - 2 >= 0 else (0, 0, 0, 0)) != q[x, y] and not ((f[x - 2, y] if x - 2 >= 0 else (0, 0, 0, 0))[3] == 0 and q[x, y][3] == 0))
        if qm:
            warn.append("%s q column != front shifted +2 (%d px)" % (hid, qm))
        side_empty = Q.opaque_bbox(cols[2]) is None
        if h.get("hideInSide"):
            if not side_empty:
                bad.append("%s side column should be empty (hideInSide)" % hid)
        elif side_empty:
            bad.append("%s side column empty" % hid)
    (FAIL if bad else PASS)("O5", "hats.webp front/alt columns pixel-exact vs Appendix B.4; side column rules", short(bad, 10))
    (WARN if warn else PASS)("O5b", "hats.webp hygiene (q = front +2, clean x4 blocks)", short(warn, 10))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", choices=["rows", "overlays", "all"], default="all")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    contract = Q.load_contract()
    meta, mmsg = Q.load_meta_json()
    meta_js, jmsg = Q.load_meta_js()
    print("contract: %s" % Q.CONTRACT)
    print("meta.json: %s | meta.js: %s" % (mmsg, jmsg))
    if args.part in ("rows", "all"):
        check_rows(contract, meta, meta_js)
    if args.part in ("overlays", "all"):
        check_overlays(contract, meta)

    lines = []
    for r in RESULTS:
        lines.append("[%s] %-5s %s" % (r["status"], r["id"], r["title"]))
        if r["detail"]:
            lines.append("               " + r["detail"])
    counts = {s: sum(1 for r in RESULTS if r["status"] == s) for s in ("PASS", "FAIL", "WARN", "SKIP")}
    lines.append("")
    lines.append("SUMMARY part=%s  PASS %d  FAIL %d  WARN %d  SKIP %d" % (args.part, counts["PASS"], counts["FAIL"], counts["WARN"], counts["SKIP"]))
    report = "\n".join(lines)
    print(report)
    Q.ensure_dir(Q.OUT)
    with open(os.path.join(Q.OUT, "check_report.txt"), "w", encoding="utf-8") as f:
        f.write(report + "\n")
    if args.json:
        with open(os.path.join(Q.OUT, "check_report.json"), "w", encoding="utf-8") as f:
            json.dump({"part": args.part, "results": RESULTS, "counts": counts}, f, indent=1)
    sys.exit(1 if counts["FAIL"] else 0)


if __name__ == "__main__":
    main()
