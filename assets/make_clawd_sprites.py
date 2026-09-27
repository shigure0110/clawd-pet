# -*- coding: utf-8 -*-
"""Claw'd 风格像素螃蟹精灵图生成器（原创致敬 Anthropic 吉祥物造型）

方形身体 / 黑方块眼 / 侧边小短臂 / 四条短腿 / 纯色无描边。
Codex Pet Standard cell: 192x208 (48x52 logical x4), 8 columns.

Rows 0-21 are frozen: their pixels must stay identical to the committed sheet
(the absence of every new param key reproduces the old drawing exactly).
Rows 22-42, the emote sheet, the hat sheet and the meta files were added by the
animation expansion (spec: 80_DesktopPet/_work/anim_plan_20260926.md).

Outputs:
  renderer/spritesheet.webp          8 x 43 cells of 192x208, lossless
  renderer/emotes.webp               8 x 17 cells of 96x96 (24x24 logical)
  renderer/hats.webp                 4 x 12 cells of 160x128 (40x32 logical)
  renderer/clawd_meta.js / .json     rows, aliases, anchors, emotes, hats (A -> B contract)

Run from ClaudeCodePet/ with the 30_Tools/py311 interpreter:
  python assets/make_clawd_sprites.py            # sheets + meta; icons are NOT touched
  python assets/make_clawd_sprites.py --icons    # also rewrite icon.png / icon.ico / tray.png
"""
import os
import sys
import json
import math
from PIL import Image, ImageDraw

LW, LH = 48, 52
SCALE = 4
COLS = 8
CW, CH = LW * SCALE, LH * SCALE

CORAL = (217, 119, 87, 255)      # #D97757 Anthropic 珊瑚橙
CORAL_DK = (192, 98, 68, 255)    # 阴影(腿/暗部)
INK = (26, 20, 18, 255)          # 眼睛
SWEAT = (110, 185, 235, 255)
PROP = (110, 100, 105, 255)
DUST = (203, 192, 182, 255)
LAPTOP_DK = (52, 50, 60, 255)      # 笔记本外框
LAPTOP_BASE = (150, 150, 162, 255) # 键盘底座
SCREEN_A = (38, 78, 110, 255)      # 屏幕(暗)
SCREEN_B = (44, 90, 126, 255)      # 屏幕(亮, 闪烁)
SCREEN_TXT = (140, 220, 170, 255)  # 代码行(终端绿)
STEM = (96, 160, 84, 255)          # 花茎
PETAL = (242, 140, 177, 255)       # 花瓣
POLLEN = (255, 217, 90, 255)       # 花蕊
CUP = (246, 238, 222, 255)         # 咖啡杯
COFFEE = (92, 56, 40, 255)         # 咖啡
STEAM = (190, 186, 190, 200)       # 蒸汽
GLASS = (150, 200, 240, 255)       # 水杯
WATER = (92, 160, 230, 255)        # 水
FRYBOX = (214, 48, 49, 255)        # 薯条盒
FRY = (250, 200, 60, 255)          # 薯条
SAUSAGE = (190, 80, 60, 255)       # 香肠
SAUSAGE_DK = (140, 52, 40, 255)    # 香肠端
STICK = (170, 150, 120, 255)       # 签子
HP_DARK = (58, 56, 70, 255)        # 耳机
HP_LIGHT = (128, 126, 145, 255)    # 耳机内衬
PAD = (124, 124, 136, 255)         # 手柄
PAD_DK = (80, 80, 92, 255)         # 手柄握把
BTN = [(226, 80, 80, 255), (90, 190, 110, 255), (80, 140, 230, 255), (250, 210, 80, 255)]
CAP = (70, 90, 170, 255)           # 睡帽
CAP_WHITE = (248, 248, 250, 255)   # 睡帽边/绒球
PHONE = (40, 40, 48, 255)          # 手机
PHONE_A = (70, 120, 180, 255)      # 手机屏
PHONE_B = (92, 144, 206, 255)      # 手机屏(亮)
ZINK = (120, 110, 130, 255)        # zZZ

# ── palette additions (spec §1.7); existing colours above are unchanged ──
CREAM = (255, 245, 226, 255)       # W
MOUTH_DK = (74, 31, 42, 255)       # M
TONGUE = (226, 122, 146, 255)      # T (also party-hat rose)
OCHRE = (232, 170, 56, 255)        # O
SKY = (142, 195, 230, 255)         # S
Q_BLUE = (70, 130, 190, 255)       # q (question mark, rain)
BANG = (226, 96, 60, 255)          # Z (the jumping-row "!" red)
MARK_GREY = (128, 112, 140, 255)   # j (notes, dots)
MARK_SH = (92, 64, 56, 255)        # drop shade (§1.5)
HEART = (226, 71, 110, 255)        # H
ANGER = (216, 57, 78, 255)         # A
RED_EYE = (255, 47, 74, 255)       # eye state angry_red
GOLD = (242, 197, 61, 255)         # G
GOLD_SH = (217, 169, 46, 255)      # g
VIOLET = (123, 92, 168, 255)       # V
INDIGO = (47, 60, 122, 255)        # I
INDIGO_LT = (70, 86, 160, 255)     # i
TEAL = (58, 156, 152, 255)         # E
TEAL_DK = (47, 125, 122, 255)      # e
CLOUD = (163, 168, 196, 255)       # L
CLOUD_DK = (120, 124, 160, 255)    # l
BULB = (255, 230, 138, 255)        # B
BULB_BASE = (154, 147, 168, 255)   # b
SHADE = (42, 39, 64, 255)          # N (lenses)
SANTA_RED = (200, 50, 60, 255)     # R
CORAL_Q = (202, 106, 76, 255)      # Q (3/4 side face)
FAR_LEG = (159, 84, 64, 255)       # F
HANDLE = (140, 96, 60, 255)        # n
RIM = (90, 86, 100, 255)           # r
TERM_DIM = (100, 170, 140, 255)    # d
GLOOM = (182, 107, 94, 255)        # gloom band
SMEAR_ALPHA = 150                  # smear streaks: body colour at this alpha
LENS = (142, 195, 230, 110)        # magnifier glass
STEAM_FADE = (255, 245, 226, 128)  # steam stage 2

# bitmap legend (Appendix B)
LEGEND = {
    "W": CREAM, "M": MOUTH_DK, "T": TONGUE, "O": OCHRE, "S": SKY, "q": Q_BLUE, "Z": BANG,
    "j": MARK_GREY, "H": HEART, "A": ANGER, "G": GOLD, "g": GOLD_SH, "V": VIOLET, "I": INDIGO,
    "i": INDIGO_LT, "E": TEAL, "e": TEAL_DK, "L": CLOUD, "l": CLOUD_DK, "B": BULB, "b": BULB_BASE,
    "N": SHADE, "R": SANTA_RED, "Q": CORAL_Q, "F": FAR_LEG, "n": HANDLE, "r": RIM, "d": TERM_DIM,
    "K": INK, "C": CORAL, "D": CORAL_DK, "w": CAP_WHITE, "Y": POLLEN, "P": PETAL, "s": SWEAT,
    "X": PROP, "U": DUST, "v": STEM, "k": LAPTOP_DK, "a": SCREEN_A, "t": SCREEN_TXT,
    "#": INK,
    "@": RED_EYE,
}

# tints (§1.4): body, legs
TINTS = {
    "sad": ((184, 124, 124, 255), (156, 98, 89, 255)),
    "pale": ((233, 180, 155, 255), (187, 117, 94, 255)),
    "rosy": ((229, 132, 132, 255), (186, 100, 83, 255)),
    "flush": ((222, 88, 69, 255), (179, 78, 62, 255)),
}

GROUND = 48

# 基准几何(逻辑像素): 身体 x10..38 y22..40, 腿基线 40, 眼 y26
BX0, BX1 = 10, 38
BY0, BY1 = 22, 40
LEG_XS = [13, 19, 27, 33]  # 腿左缘, 宽3
EYE_L, EYE_R = 15, 29      # 眼左缘, 4x4

SQ_W = {0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2}   # squash/stretch half-width change
GLOOM_LINES = False   # gloom hanging lines (§1.8); dropped after the Gate 1 read (they looked like hair)


def R(d, x0, y0, x1, y1, fill, radius=0):
    if radius > 0:
        d.rounded_rectangle([round(x0), round(y0), round(x1), round(y1)], radius=radius, fill=fill)
    else:
        d.rectangle([round(x0), round(y0), round(x1), round(y1)], fill=fill)


def draw_eye(d, x, y, state, look=0):
    """x = 眼左缘。4x4 方块眼是 Claw'd 的灵魂"""
    x += look
    if state == "open":
        R(d, x, y, x + 3, y + 3, INK)
    elif state == "closed":
        R(d, x, y + 2, x + 3, y + 2, INK)
    elif state == "happy":  # ^
        d.line([round(x), round(y + 2), round(x + 1.5), round(y)], fill=INK, width=1)
        d.line([round(x + 1.5), round(y), round(x + 3), round(y + 2)], fill=INK, width=1)
    elif state == "x":
        d.line([round(x), round(y), round(x + 3), round(y + 3)], fill=INK, width=1)
        d.line([round(x), round(y + 3), round(x + 3), round(y)], fill=INK, width=1)
    elif state == "half":
        R(d, x, y + 2, x + 3, y + 3, INK)


# ── pixel helpers for the new primitives ──

def put(img, x, y, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((int(x), int(y)), c)


def over_px(img, x, y, c):
    """alpha-composite one RGBA colour over the destination pixel"""
    if not (0 <= x < img.width and 0 <= y < img.height):
        return
    sr, sg, sb, sa = c
    dr, dg, db, da = img.getpixel((x, y))
    a = sa / 255.0
    b = da / 255.0 * (1 - a)
    oa = a + b
    if oa <= 0:
        return
    out = (round((sr * a + dr * b) / oa), round((sg * a + dg * b) / oa),
           round((sb * a + db * b) / oa), round(oa * 255))
    img.putpixel((x, y), out)


def bm_check(rows):
    assert all(len(r) == len(rows[0]) for r in rows), rows
    return rows


def blit(img, rows, x0, y0, color=None, mirror=False):
    for j, row in enumerate(rows):
        if mirror:
            row = row[::-1]
        for i, ch in enumerate(row):
            if ch != ".":
                put(img, x0 + i, y0 + j, color or LEGEND[ch])


# ── eyes (§1.3, Appendix B.1) ──
OLD_EYES = ("open", "closed", "happy", "x", "half")
EYE_BM = {  # state: (ox, oy, rows, asymmetric)
    "wide": (0, -1, ["KKKK"] * 5, False),
    "dot": (0, 0, ["....", ".KK.", ".KK.", "...."], False),
    "content": (0, 0, ["....", "....", "K..K", ".KK."], False),
    "narrow": (0, 0, ["....", "KKKK", "KKKK", "...."], False),
    "squeeze": (0, 0, ["KK..", "..KK", "..KK", "KK.."], True),
    "sad": (0, 0, ["..KK", ".KKK", "KKKK", "KKKK"], True),
    # deviation (QA fix): B.1 draws angry_red all in RED_EYE, which is ~1:1 in luminance against the
    # flush body, so after the lid rotation the eyes read as smudges. Same silhouette, INK rim, RED_EYE glow core.
    "angry_red": (0, 0, ["KK..", "K@K.", "K@@K", "KKKK"], True),
    "shine": (0, -1, ["KKKK", "KWKK", "KKKK", "KKWK", "KKKK"], False),
    "heart": (-1, 0, ["HH.HH", "HHHHH", ".HHH.", "..H.."], False),
    "heart_big": (-2, -1, [".HH.HH.", "HHHHHHH", "HHHHHHH", ".HHHHH.", "..HHH..", "...H..."], False),
}
SWIRL = {
    "swirl_a": ["#####", "....#", ".##.#", ".#..#", ".####"],
    "swirl_b": ["....#", "###.#", "#.#.#", "#...#", "#####"],
}
SAUCER = {
    0: [".KKKK.", "KWWWWK", "KWKWWK", "KWKWWK", "KWWWWK", ".KKKK."],
    1: [".KKKK.", "KWWWWK", "KWWKWK", "KWWKWK", "KWWWWK", ".KKKK."],
}


def draw_eye_any(img, d, x, y, state, look=0, right=False, pupil=0):
    """x = eye left edge (before look), y = eye top. Old states use the untouched draw_eye."""
    if state in OLD_EYES:
        draw_eye(d, x, y, state, look)
        return
    x += look
    if state == "none":
        return
    if state == "q":
        R(d, x, y, x + 2, y + 3, INK)
    elif state == "side":
        R(d, x, y, x + 1, y + 3, INK)
    elif state == "dash":
        R(d, x - 1, y + 2, x + 4, y + 2, INK)
    elif state == "saucer":
        blit(img, SAUCER[pupil], x - 1, y - 1)
    elif state in SWIRL:
        if right:
            blit(img, SWIRL[state], x, y - 1, mirror=True)
        else:
            blit(img, SWIRL[state], x - 1, y - 1)
    elif state in EYE_BM:
        ox, oy, rows, asym = EYE_BM[state]
        blit(img, rows, x + ox, y + oy, mirror=(asym and right))
    else:
        raise ValueError("unknown eye state " + state)


# ── mouths (§1.2, Appendix B.2): origin relative to (cx, my) ──
MOUTHS = {
    "o": (-1, 0, ["KK", "KK"]),
    "O": (-1, -1, [".M.", "MMM", "MMM", ".M."]),
    "smile": (-2, 0, ["K...K", ".KKK."]),
    "frown": (-2, 0, [".KKK.", "K...K"]),
    "flat": (-2, 0, ["KKKKK"]),
    "wobble_a": (-3, 0, [".K.K.K.", "K.K.K.K"]),
    "wobble_b": (-3, 0, ["K.K.K.K", ".K.K.K."]),
    "cat": (-3, 0, ["K..K..K", ".KK.KK."]),
    "smirk": (-3, -1, [".....K", "....K.", "KKKK.."]),
    "grin": (-3, -1, ["MWWWWWM", ".MMMMM.", "..MMM.."]),
    "laugh": (-3, -1, ["MMMMMMM", "MMMMMMM", ".MMMMM.", ".MTTTM."]),
    "tongue": (-2, 0, ["K...K", ".KKTT", "...TT", "...TT"]),
    "yawn1": (-1, 0, ["MMM", "MMM"]),
    "yawn2": (-2, -1, [".MMM.", "MMMMM", "MMMMM", ".TTT."]),
    "yawn3": (-2, -2, [".MMM.", "MMMMM", "MMMMM", "MMMMM", "MTTTM", ".TTT."]),
}
for _k, _v in MOUTHS.items():
    bm_check(_v[2])


# ─────────────────────────────────────────────────────────────────────────
# Marks (§1.5, Appendix B.3). One set of bitmaps, used by the baked rows
# (draw_mark) and by emotes.webp. A mark function returns pixels in local
# coordinates (the settled bitmap's top-left is (0,0)): [(x, y, rgba), ...].
# ─────────────────────────────────────────────────────────────────────────

def _pix(rows, x0=0, y0=0, color=None):
    out = []
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != ".":
                out.append((x0 + i, y0 + j, color or LEGEND[ch]))
    return out


def _shift(pix, dx=0, dy=0):
    return [(x + dx, y + dy, c) for x, y, c in pix]


def _centre3(pix, w, h):
    cx, cy = w // 2, h // 2
    return [q for q in pix if abs(q[0] - cx) <= 1 and abs(q[1] - cy) <= 1]


def static_mark(rows):
    rows = bm_check(rows)
    w, h = len(rows[0]), len(rows)

    def fn(stage, extra=None):
        pix = _pix(rows)
        if stage == "seed":
            return _centre3(pix, w, h)
        if stage == "over":
            return _shift(pix, 0, -1)
        return pix
    return fn


BANG_ROWS = ["ZZ"] * 7 + [".."] + ["ZZ"] * 2


def mk_bang(stage, extra=None):
    pix = _pix(BANG_ROWS)
    if stage == "seed":
        return [q for q in pix if q[1] >= 8]
    if stage == "over":
        return _shift(pix, 0, -1)
    if stage == "lean_r":
        return [(x + (1 if y <= 2 else 0), y, c) for x, y, c in pix]
    if stage == "lean_l":
        return [(x - (1 if y <= 2 else 0), y, c) for x, y, c in pix]
    return pix


QUESTION_ROWS = bm_check([".qqq.", "qq.qq", "...qq", "..qq.", "..q..", "..q..", ".....", "..q..", "..q.."])


def mk_question(stage, extra=None):
    pix = _pix(QUESTION_ROWS)
    if stage == "seed":
        return [q for q in pix if q[1] >= 7]
    if stage in ("over", "up"):
        return _shift(pix, 0, -1)
    return pix


def mk_bangq(stage, extra=None):
    pix = _pix(BANG_ROWS) + _pix(QUESTION_ROWS, 3, 1)
    if stage == "seed":
        return [q for q in pix if q[1] >= 8]
    if stage == "over":
        return _shift(pix, 0, -1)
    return pix


SWEAT2_ROWS = bm_check([".s.....", "sss....", "wss....", "sss..s.", ".s..sss", ".....s."])


def mk_sweat2(stage, extra=None):
    pix = _pix(SWEAT2_ROWS)
    if stage == "seed":
        return [q for q in pix if q[0] in (1, 2) and q[1] in (2, 3)]
    if stage == "over":
        return _shift(pix, 0, -1)
    return _shift(pix, 0, int(stage))


HEART3_ROWS = bm_check(["P.P", "PPP", ".P."])
SWAY = [0, 1, 1, 0, -1, -1, 0, 0]


def mk_heart3(stage, extra=None):
    pix = _pix(HEART3_ROWS)
    if stage == "seed":
        return [q for q in pix if (q[0], q[1]) == (1, 1)]
    if stage == "over":
        return _shift(pix, 0, -1)
    return pix


def mk_hearts(stage, extra=None):
    """emote `hearts`: three heart3 rising. Local coords are the emote cell (x 0.., bottom row 22)."""
    if stage in ("seed", "over", "settle"):
        x0 = 1 + SWAY[1]                      # heart 0 at its phase-0 spot
        h = _shift(_pix(HEART3_ROWS), x0, 22 - 2)
        if stage == "seed":
            return [q for q in h if (q[0], q[1]) == (x0 + 1, 21)]
        if stage == "over":
            return _shift(h, 0, -1)
        return h
    f = int(stage)
    out = []
    for i in range(3):
        # deviation: sway index +1 so the measured width equals the contract's w=10
        x = 1 + 2 * i + SWAY[(f + 2 * i + 1) % 8]
        bottom = 22 - ((f + 2 * i) % 5) * 2
        out += _shift(_pix(HEART3_ROWS), x, bottom - 2)
    return out


ANGER_SMALL = bm_check([".A.A.", "AA.AA", ".....", "AA.AA", ".A.A."])
ANGER_BIG = bm_check([".A...A.", "AA...AA", ".......", ".......", ".......", "AA...AA", ".A...A."])


def mk_anger(stage, extra=None):
    small = _pix(ANGER_SMALL, 1, 1)
    if stage == "seed":
        return [q for q in small if abs(q[0] - 3) <= 1 and abs(q[1] - 3) <= 1]
    if stage == "over":
        return _shift(small, 0, -1)
    if stage == "big":
        return _pix(ANGER_BIG)
    return small


SPARKLE_BIG = bm_check(["...Y...", "...Y...", "..YYY..", "YYYWYYY", "..YYY..", "...Y...", "...Y..."])
SPARKLE_SMALL = bm_check(["..Y..", "..Y..", "YYWYY", "..Y..", "..Y.."])


def mk_sparkle(stage, extra=None):
    big = _pix(SPARKLE_BIG)
    if stage == "seed":
        return _centre3(big, 7, 7)
    if stage == "over":
        return _shift(big, 0, -1)
    if stage == "small":
        return _pix(SPARKLE_SMALL, 1, 1)
    return big


STAR3_ROWS = bm_check([".O.", "OOO", ".O."])

NOTE_BIG = bm_check(["..jj.", "..j.j", "..j..", "..j..", "jjj..", "jjj.."])
NOTE_SMALL = bm_check([".j.", ".jj", ".j.", "jj.", "jj."])


def mk_note(stage, extra=None):
    if stage == "seed":
        return _pix(["jjj", "jjj"], 0, 5)
    s = 0 if stage in ("over", "settle") else int(stage)
    big = _pix(NOTE_BIG, 0, 1 + [0, -1, -1, 0][s])
    small = _pix(NOTE_SMALL, 6, 2 + [0, 1, 1, 0][s])
    pix = big + small
    if stage == "over":
        return _shift(pix, 0, -1)
    return pix


CLOUD_ROWS = bm_check([
    "....LLL..LLL...",
    "..LLLLLLLLLLLL.",
    ".LLLLLLLLLLLLLL",
    "LLLLLLLLLLLLLLL",
    ".lllllllllllll.",
])


def mk_raincloud(stage, extra=None):
    cdy = (extra or {}).get("raincloud_dy", 0)
    cloud = _pix(CLOUD_ROWS)
    if stage == "seed":
        return [q for q in cloud if q[1] in (3, 4) and 5 <= q[0] <= 9]
    if stage == "over":
        return _shift(cloud, 0, -1)
    if stage == "over0":   # emote sheet only: its settle column is rain phase 0, so the overshoot is too (§3.5)
        return _shift(mk_raincloud(0), 0, -1)
    if stage == "cloud":
        return cloud
    p = int(stage)
    rain = []
    for idx, col in enumerate((1, 4, 7, 10, 13)):
        top = 5 + 2 * p if idx % 2 == 0 else 5 + 2 * ((p + 1) % 3)
        rain += [(col, top, Q_BLUE), (col, top + 1, Q_BLUE)]
    if p == 2:
        rain += [(3, 10, Q_BLUE), (11, 10, Q_BLUE)]
    return rain + _shift(cloud, 0, cdy)   # cloud drawn over the rain


BULB_BODY = bm_check([".BBB.", "BWBBB", "BBBBB", "BBBBB", ".BBB.", ".bbb.", ".bbb."])
RAYS_A = [(5, 1), (1, 3), (9, 3), (0, 6), (10, 6)]
RAYS_B = RAYS_A + [(5, 0), (0, 2), (10, 2)]


def mk_bulb(stage, extra=None):
    body = _pix(BULB_BODY, 3, 4)
    if stage == "seed":
        return [q for q in body if abs(q[0] - 5) <= 1 and abs(q[1] - 7) <= 1]
    rays = RAYS_B if stage == "B" else RAYS_A
    pix = body + [(x, y, OCHRE) for x, y in rays]
    if stage == "over":
        return _shift(pix, 0, -1)
    return pix


def mk_dots(stage, extra=None):
    if stage == "seed":
        return [(0, 1, MARK_GREY)]
    out = []
    for i in range(int(stage)):
        x = 3 * i
        out += [(x, 0, MARK_GREY), (x + 1, 0, MARK_GREY), (x, 1, MARK_GREY), (x + 1, 1, MARK_GREY)]
    return out


def mk_tool_shell(stage, extra=None):
    rows = TOOL_SHELL_ROWS
    if stage == "off":
        rows = [r[:5] + "aa" + r[7:] if j == 4 else r for j, r in enumerate(rows)]
    return static_mark(rows)(stage if stage != "off" else "settle")


TOOL_READ_ROWS = bm_check([".rrrr....", "rWSSSr...", "rSSSSr...", "rSSSSr...", "rSSSSr...",
                           ".rrrrnn..", "......nn.", ".......nn", "........n"])
TOOL_EDIT_ROWS = bm_check([".......PP", "......YPP", ".....YYY.", "....YYY..", "...YYY...",
                           "..YYY....", ".WYY.....", "WW.......", "K........"])
TOOL_SHELL_ROWS = bm_check(["bbbbbbbbb", "baaaaaaab", "bataaaaab", "baataaaab", "bataattab",
                            "baaaaaaab", "bbbbbbbbb"])
TOOL_WEB_ROWS = bm_check(["..SSS..", ".SEESS.", "SEEESES", "SSESSEE", "SSSSSEE", ".SSSES.", "..SSS.."])
TOOL_AGENT_ROWS = bm_check([".CCCCCCC.", "CCKCCCKCC", ".CKCCCKC.", ".CCCCCCC.", ".D.D.D.D.", ".D.D.D.D."])
TOOL_GIT_ROWS = bm_check(["........v", ".......vv", "v.....vv.", "vv...vv..", ".vv.vv...", "..vvv....", "...v....."])

PAPER_ROWS = bm_check(["WWWWWW", "WWWWWW", "WXXXXW", "WWWWWW", "WXXXWW", "WWWWWW", "WXXXXW", "WWWWWW"])

# name: (function, drop shade?, stages spanned by the placement box)
MARKS = {
    "bang": (mk_bang, False, ["seed", "over", "settle", "lean_r", "lean_l"]),
    "question": (mk_question, False, ["seed", "over", "settle"]),
    "bangq": (mk_bangq, False, ["seed", "over", "settle"]),
    "sweat2": (mk_sweat2, True, ["seed", "over", 0, 1, 2, 3]),
    "heart3": (mk_heart3, True, ["seed", "over", "settle"]),
    "hearts": (mk_hearts, True, ["seed", "over", "settle", 0, 1, 2, 3, 4]),
    "anger": (mk_anger, False, ["seed", "over", "small", "big"]),
    "sparkle": (mk_sparkle, True, ["seed", "over", "settle", "small"]),
    "star3": (static_mark(STAR3_ROWS), True, ["settle"]),
    "note": (mk_note, False, ["seed", "over", 0, 1, 2, 3]),
    "raincloud": (mk_raincloud, False, ["seed", "over", "over0", "cloud", 0, 1, 2]),
    "puff_small": (static_mark(["WW", "WW"]), True, ["seed", "over", "settle"]),
    "bulb": (mk_bulb, True, ["seed", "over", "A", "B"]),
    "dots": (mk_dots, False, ["seed", 1, 2, 3]),
    "tool-read": (static_mark(TOOL_READ_ROWS), False, ["seed", "over", "settle"]),
    "tool-edit": (static_mark(TOOL_EDIT_ROWS), True, ["seed", "over", "settle"]),
    "tool-shell": (mk_tool_shell, False, ["seed", "over", "settle", "off"]),
    "tool-web": (static_mark(TOOL_WEB_ROWS), False, ["seed", "over", "settle"]),
    "tool-agent": (static_mark(TOOL_AGENT_ROWS), False, ["seed", "over", "settle"]),
    "tool-git": (static_mark(TOOL_GIT_ROWS), False, ["seed", "over", "settle"]),
}


def mark_pixels(name, stage, extra=None):
    fn, drop, _ = MARKS[name]
    return fn(stage, extra), drop


def shade_of(pix):
    own = {(x, y) for x, y, _ in pix}
    out = []
    for x, y, _ in pix:
        s = (x + 1, y + 1)
        if s not in own and s not in out:
            out.append(s)
    return out


def mark_extent(name, stages=None, extra=None):
    """union bbox (incl. drop shade) of a mark over the stages its box spans"""
    fn, drop, all_stages = MARKS[name]
    xs, ys = [], []
    for s in (stages if stages is not None else all_stages):
        pix = fn(s, extra)
        for x, y, _ in pix:
            xs.append(x)
            ys.append(y)
        if drop:
            for x, y in shade_of(pix):
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def paint_mark(img, pix, drop, ox, oy):
    """draw a mark; with drop, p+(1,1) gets MARK_SH where it is not a mark pixel and the
    destination is transparent (so a shade never lands on the crab)"""
    if drop:
        todo = []
        for sx, sy in shade_of(pix):
            X, Y = sx + ox, sy + oy
            if 0 <= X < img.width and 0 <= Y < img.height and img.getpixel((X, Y))[3] == 0:
                todo.append((X, Y))
        for X, Y in todo:
            img.putpixel((X, Y), MARK_SH)
    for x, y, c in pix:
        put(img, x + ox, y + oy, c)


def _opaque(img, x, y):
    return 0 <= x < img.width and 0 <= y < img.height and img.getpixel((x, y))[3] > 0


def draw_mark(img, name, stage, anchor, geo, extra=None):
    """place a baked mark by its anchor keyword (§1.8 `marks`)"""
    bx0, bx1, by0, cx = geo["bx0"], geo["bx1"], geo["by0"], geo["cx"]
    if name == "hearts3":            # love row: three heart3, explicit placement (§2 row 29)
        f = int(stage)
        for i in range(3):
            x = bx1 + 1 + 2 * i + SWAY[(f + 2 * i) % 8]
            bottom = by0 - 2 - ((f + 3 * i) % 8) * 2
            if bottom - 2 < 0:
                continue
            paint_mark(img, _pix(HEART3_ROWS), True, x, bottom - 2)
        return
    pix, drop = mark_pixels(name, stage, extra)
    xmin, ymin, xmax, ymax = mark_extent(name, extra=extra)
    oy = by0 - 1 - ymax
    if anchor == "side":
        ox = bx1 + 3 - xmin
    elif anchor == "side_far":
        ox = bx1 + 7 - xmin
    elif anchor == "side_l":
        ox = bx0 - 3 - xmax
    elif anchor == "head_r":
        ox = bx1 - 7 - xmin
    elif anchor == "top":
        ox = cx - (xmin + xmax) // 2
    else:
        raise ValueError(anchor)
    if anchor in ("side", "side_far", "side_l"):
        # keep the whole box inside the 48-px cell (a 9-wide note at bx1+3 would be clipped)
        ox = min(max(ox, -xmin), LW - 1 - xmax)
        # and never paint over, or touch, the crab (a raise45 arm tip reaches bx1+6 at by0-2).
        # QA fix: a 0-px gap made the side_far bang merge with the raise45 tip (read as an antenna),
        # so the whole placement box keeps MARK_CLEAR px of clear space from every opaque pixel.
        box = set()
        for s in MARKS[name][2]:
            box |= {(x, y) for x, y, _ in MARKS[name][0](s, extra)}
        ymin = min(y for _x, y in box)
        for _ in range(12):
            if oy + ymin <= 0 or not _near_opaque(img, box, ox, oy, MARK_CLEAR):
                break
            oy -= 1
    paint_mark(img, pix, drop, ox, oy)


MARK_CLEAR = 1    # side marks: px of clear space kept from the crab
STEAM_CLEAR = 2   # steam puffs: px of clear space kept above a raised arm


def _near_opaque(img, pts, ox, oy, gap):
    """True if any opaque pixel lies within `gap` px (Chebyshev) of a point of pts shifted by (ox, oy)"""
    for x, y in pts:
        for ddy in range(-gap, gap + 1):
            for ddx in range(-gap, gap + 1):
                if _opaque(img, x + ox + ddx, y + oy + ddy):
                    return True
    return False


# stars for `dizzy` (§1.8 stars): ellipse slots around (cx, by0-4)
STAR_SLOTS = [(12, 0), (8, 2), (0, 3), (-8, 2), (-12, 0), (-8, -2), (0, -3), (8, -2)]

# summon puff + mini crab (absolute positions, B.3)
PUFF1 = bm_check(["..WW...", ".WWWWW.", "WWWWWWW", "WWWWWWW", ".WWWWW.", "..UUU.."])
PUFF2 = bm_check([
    "....WW.....",
    "..WWWWWW...",
    ".WWWWWWWWW.",
    "WWWWWWWWWWW",
    "WWWWKWWKWWW",
    "WWWWKWWKWWW",
    "WWWWWWWWWWW",
    ".WWWWWWWWW.",
    "..WWWWWWU..",
    "...UUUU....",
])
MINI = {
    "side": bm_check(["..........", ".CCCCCCCC.", ".CCKCCKCC.", "CCCKCCKCCC", ".CCCCCCCC.",
                      ".CCCCCCCC.", "..D.DD.D..", "..D.DD.D.."]),
    "up": bm_check([".........C", ".CCCCCCCCC", ".CCKCCKCC.", "CCCKCCKCC.", ".CCCCCCCC.",
                    ".CCCCCCCC.", "..D.DD.D..", "..D.DD.D.."]),
}
STEAM_BM = {0: ["WW", "WW"], 1: [".W.", "WWW", "WWW"], 2: ["WWW", "WWW"]}

SHADES_ROWS = bm_check([
    "NNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
    "...NNNNNNN.......NNNNNNN.....",
    "...NNNNNNN.......NNNNNNN.....",
    "....NNNNN.........NNNNN......",
])
SHADES_GLINT = {0: [(5, 0), (4, 1)], 1: [(8, 0), (7, 1)], 2: [(19, 0), (18, 1)]}


def draw_shades(img, x0, y0, glint, air=False):
    blit(img, SHADES_ROWS, x0, y0)
    if glint is not None:
        for gx, gy in SHADES_GLINT[glint]:
            put(img, x0 + gx, y0 + gy, CREAM)
    if air:
        # QA fix (cool f0-f2): SHADE lenses in the air, with no body behind them, vanish on a dark
        # IDE background. While falling they get a CREAM glint on each lens plus two short CREAM
        # speed streaks above the lenses (1 px gap), which read on dark and say "falling".
        for gx, gy in SHADES_GLINT[0] + SHADES_GLINT[2]:
            put(img, x0 + gx, y0 + gy, CREAM)
        for sx in (6, 20):
            for sy in (-4, -3, -2):
                put(img, x0 + sx, y0 + sy, CREAM)


def draw_arm(d, side, kind, bx0, bx1, by0, ay, dy_arm, col, lid=0):
    """one side arm. side 'l' / 'r'. The original rects, plus raise45 and a vertical offset.
    With a lid the right side of the head swings away, so a right up/stretch/hold arm is
    extended down to the lower jaw (by0+9) instead of floating beside the open mouth."""
    o = dy_arm
    if lid and side == "r" and kind in ("up", "stretch", "hold"):
        top = {"up": by0 - 8, "stretch": by0 - 13, "hold": by0 + 1}[kind] + o
        R(d, bx1 + (0 if kind == "hold" else 1), top, bx1 + (5 if kind == "hold" else 6), max(by0 + 9, top), col)
        return
    if side == "l":
        if kind == "side":
            R(d, bx0 - 6, ay + o, bx0, ay + 5 + o, col)
        elif kind == "up":
            R(d, bx0 - 6, by0 - 8 + o, bx0 - 1, by0 + 6 + o, col)
        elif kind == "stretch":
            R(d, bx0 - 6, by0 - 13 + o, bx0 - 1, by0 + 6 + o, col)
        elif kind == "hold":
            R(d, bx0 - 5, by0 + 1 + o, bx0, by0 + 6 + o, col)
        elif kind == "down":
            R(d, bx0 - 5, ay + 4 + o, bx0, ay + 10 + o, col)
        elif kind == "raise45":
            for k in range(7):
                R(d, bx0 - k, ay - k + o, bx0 - k, ay + 5 - k + o, col)
    else:
        if kind == "side":
            R(d, bx1, ay + o, bx1 + 6, ay + 5 + o, col)
        elif kind == "up":
            R(d, bx1 + 1, by0 - 8 + o, bx1 + 6, by0 + 6 + o, col)
        elif kind == "stretch":
            R(d, bx1 + 1, by0 - 13 + o, bx1 + 6, by0 + 6 + o, col)
        elif kind == "hold":
            R(d, bx1, by0 + 1 + o, bx1 + 5, by0 + 6 + o, col)
        elif kind == "down":
            R(d, bx1, ay + 4 + o, bx1 + 5, ay + 10 + o, col)
        elif kind == "raise45":
            for k in range(7):
                R(d, bx1 + k, ay - k + o, bx1 + k, ay + 5 - k + o, col)


def draw_clawd(d, p):
    """draw one logical 48x52 frame; returns geo = {bx0, bx1, by0, by1, ey, cx}"""
    img = d._image
    dx = p.get("dx", 0)
    dy = p.get("dy", 0)
    ground = GROUND
    view = p.get("view", "front")
    tint = p.get("tint")
    body_c, leg_c = TINTS[tint] if tint else (CORAL, CORAL_DK)

    # 动作线(身后)
    for x0, y0, x1, y1 in p.get("motion", []):
        d.line([round(x0), round(y0), round(x1), round(y1)], fill=(168, 158, 152, 210), width=1)

    sq = p.get("sq", 0)
    sw = SQ_W[abs(sq)]
    if view == "side":
        bx0, bx1 = 15 + dx, 33 + dx
    else:
        bx0, bx1 = BX0 + dx, BX1 + dx
    if sq > 0:
        bx0, bx1 = bx0 - sw, bx1 + sw
    elif sq < 0:
        bx0, bx1 = bx0 + sw, bx1 - sw
    by0, by1 = BY0 + dy - p.get("tall", 0) + sq, BY1 + dy   # tall: 伸懒腰时身体拉高; sq: squash
    cx = (bx0 + bx1) // 2
    ey = by0 + 4 + p.get("eye_dy", 0)
    ay = by0 + 4
    geo = {"bx0": bx0, "bx1": bx1, "by0": by0, "by1": by1, "ey": ey, "cx": cx}

    # smear streaks (before the legs)
    if p.get("smear"):
        sc = body_c[:3] + (SMEAR_ALPHA,)
        for row, ln in ((by0 + 3, 6), (by0 + 8, 4), (by0 + 13, 7)):
            if p["smear"] < 0:
                R(d, bx0 - ln, row, bx0 - 1, row, sc)
            else:
                R(d, bx1 + 1, row, bx1 + ln, row, sc)

    # dizzy stars behind the crab (slots 5-7)
    if "stars" in p:
        k = p["stars"]
        for s in (k % 8, (k + 3) % 8, (k + 6) % 8):
            if s >= 5:
                sx, sy = STAR_SLOTS[s]
                put(img, cx + sx, by0 - 4 + sy, OCHRE)

    # ── 腿(4条, 宽3) ──
    legs = p.get("legs", "stand")  # stand / phase0-3 / tuck / splay / reach / dangle
    if view == "side":
        sxA, liftA, sxB, liftB = p.get("side_legs", (0, 0, 0, 0))
        for lx, sx, lift, col in ((19, sxA, liftA, FAR_LEG), (30, sxB, liftB, FAR_LEG),
                                  (17, sxB, liftB, leg_c), (28, sxA, liftA, leg_c)):
            x = lx + dx + sx
            R(d, x, by1, x + 2, ground - 1 - lift, col)
    else:
        for i, lx in enumerate(LEG_XS):
            x = lx + dx
            lc = FAR_LEG if (view == "q" and i < 2) else leg_c
            if legs == "tuck":       # 腾空收腿
                R(d, x, by1, x + 2, by1 + 3, lc)
            elif legs == "splay":    # 瘫倒外八
                off = -2 if i < 2 else 2
                R(d, x + off, by1, x + 2 + off, ground - 1, lc)
            elif isinstance(legs, int):  # 走路: 交错抬腿
                lift = 2 if i % 2 == (legs % 2) else 0
                R(d, x, by1, x + 2, ground - 1 - lift, lc)
            elif legs == "reach":    # 空中伸腿
                R(d, x, by1, x + 2, min(by1 + 6, ground - 1), lc)
            elif legs == "dangle":   # 被拎着晃
                ph = p.get("dangle_phase", 0)
                lift = 2 if ((ph == 1 and i % 2 == 0) or (ph == 2 and i % 2 == 1)) else 0
                R(d, x, by1, x + 2, by1 + 6 - lift, lc)
            else:                    # 站立
                R(d, x, by1, x + 2, ground - 1, lc)

    # ── 臂(侧边小短臂) ──
    if view == "q":
        R(d, bx0 - 5, ay, bx0, ay + 5, CORAL_Q)          # far arm
        draw_arm(d, "r", p.get("arm_r", "side"), bx0, bx1, by0, ay, p.get("arm_r_dy", 0), body_c)
    elif view == "side":  # far arm stub behind the body (see the near arm below); counter-bobs
        R(d, bx0 - 4, ay + 1 - p.get("arm_r_dy", 0), bx0, ay + 4 - p.get("arm_r_dy", 0), CORAL_Q)
    elif view == "front":
        draw_arm(d, "l", p.get("arm_l", "side"), bx0, bx1, by0, ay, p.get("arm_l_dy", 0), body_c)
        draw_arm(d, "r", p.get("arm_r", "side"), bx0, bx1, by0, ay, p.get("arm_r_dy", 0), body_c,
                 p.get("lid", 0))

    # ── 身体(平涂圆角方块) ──
    R(d, bx0, by0, bx1, by1, body_c, radius=2)
    if view == "q":   # three-quarter: shaded near-left strip, clipped to the body silhouette
        for x in range(bx0, bx0 + 6):
            for y in range(by0, by1 + 1):
                if _opaque(img, x, y):
                    put(img, x, y, CORAL_Q)
    elif view == "side":  # profile: near arm after the body
        # deviation (Gate 1 trot review): §1.8's 3-px nub under the eye lost Claw'd's "wide bar with
        # side arms" silhouette, so the profile read as a chick / robot box. The near arm is now a
        # 4-row block reaching 5 px past the body at the front-arm height, with a CORAL_DK underside,
        # and the far arm shows as a FAR_LEG stub behind the body (drawn before it, above).
        o = p.get("arm_r_dy", 0)
        R(d, bx1 - 3, ay + 1 + o, bx1 + 5, ay + 4 + o, body_c)
        R(d, bx1 + 1, ay + 4 + o, bx1 + 5, ay + 4 + o, leg_c)

    # ── 笔记本电脑(挡在身体下半部, 眼睛露在上面) ──
    if "laptop" in p:
        flick = p["laptop"]  # 0/1 屏幕闪烁
        R(d, bx0 + 5, by1 - 9, bx1 - 5, by1 - 1, LAPTOP_DK)                 # 屏幕外框
        if p.get("laptop_mode") == "term":
            draw_term(d, bx0, bx1, by1, p.get("term", (0, True, False)))
        else:
            R(d, bx0 + 6, by1 - 8, bx1 - 6, by1 - 2, SCREEN_A if flick else SCREEN_B)  # 屏幕
            for i in range(3):                                                 # 代码行
                R(d, bx0 + 7, by1 - 7 + i * 2, bx0 + 7 + (5, 8, 3)[i] - (1 if flick and i == 1 else 0),
                  by1 - 7 + i * 2, SCREEN_TXT)
        R(d, bx0 + 3, by1 - 1, bx1 - 3, by1 + 1, LAPTOP_BASE)              # 键盘底座
        # 打字的小手(搭在键盘上, 交替上下)
        ty = p.get("type_phase", 0)
        hr = p.get("hand_r_dy", 0)
        R(d, bx0 + 1, by1 - 3 + ty, bx0 + 5, by1 - 1, body_c)
        if hr < 0:
            # QA fix (work-shell f3): a raised hand is body colour on the body and vanished (a 1-px
            # notch). The raised hand hovers 2 px further in, over the screen's right corner (coral
            # on the dark screen), with a CORAL_DK underside and outer edge like the magnifier claw
            # rim. Only when raised, so the typing rows keep their pixels.
            hx0 = bx1 - 7
            R(d, hx0, by1 - 3 + (1 - ty) + hr, hx0 + 4, by1 - 1 + hr, body_c)
            R(d, hx0, by1 + hr, hx0 + 4, by1 + hr, leg_c)
            R(d, hx0 + 4, by1 - 3 + (1 - ty) + hr, hx0 + 4, by1 + hr, leg_c)
        else:
            R(d, bx1 - 5, by1 - 3 + (1 - ty) + hr, bx1 - 1, by1 - 1 + hr, body_c)

    # ── 手柄(身前) + 耳机 ──
    if "gamepad" in p:
        ph = p["gamepad"]  # 0/1 按键相位
        R(d, bx0 + 4, by1 - 4, bx0 + 6, by1, PAD_DK)             # 左握把
        R(d, bx1 - 6, by1 - 4, bx1 - 4, by1, PAD_DK)             # 右握把
        R(d, bx0 + 5, by1 - 7, bx1 - 5, by1 - 2, PAD)            # 手柄本体
        R(d, bx0 + 8, by1 - 6, bx0 + 8, by1 - 4, PAD_DK)         # 十字键 竖
        R(d, bx0 + 7, by1 - 5, bx0 + 9, by1 - 5, PAD_DK)         # 十字键 横
        for i, (ox, oy) in enumerate(((0, -1), (-1, 0), (1, 0), (0, 1))):  # ABXY
            d.point([(round(bx1 - 9 + ox), round(by1 - 5 + oy))], fill=BTN[i])
        R(d, bx0 + 6, by1 - 9 + ph, bx0 + 7, by1 - 8 + ph, body_c)          # 左拇指
        R(d, bx1 - 8, by1 - 9 + (1 - ph), bx1 - 7, by1 - 8 + (1 - ph), body_c)  # 右拇指
    if p.get("headphones"):
        R(d, bx0 + 1, by0 - 3, bx1 - 1, by0 - 2, HP_DARK)        # 头带
        R(d, bx0 - 3, by0 + 1, bx0, by0 + 8, HP_DARK)            # 左耳罩
        R(d, bx1, by0 + 1, bx1 + 3, by0 + 8, HP_DARK)            # 右耳罩
        R(d, bx0 - 2, by0 + 3, bx0 - 2, by0 + 6, HP_LIGHT)
        R(d, bx1 + 2, by0 + 3, bx1 + 2, by0 + 6, HP_LIGHT)

    # ── 手机(身前, 双手捧着) ──
    if "phone" in p:
        pcx = (bx0 + bx1) // 2
        R(d, pcx - 4, by1 - 10, pcx + 4, by1 - 1, PHONE)
        R(d, pcx - 3, by1 - 9, pcx + 3, by1 - 3, PHONE_B if p["phone"] else PHONE_A)
        R(d, pcx - 7, by1 - 6, pcx - 4, by1 - 3, body_c)           # 左手
        R(d, pcx + 4, by1 - 6, pcx + 7, by1 - 3, body_c)           # 右手
        d.point([(round(pcx + 2), round(by1 - 5 + p["phone"]))], fill=body_c)  # 拇指点屏

    # ── 薯条盒(左手) ──
    if "fries" in p:
        n = p["fries"]  # 剩余薯条根数
        R(d, bx0 - 9, by0 + 5, bx0 - 2, by0 + 12, FRYBOX)
        R(d, bx0 - 8, by0 + 6, bx0 - 3, by0 + 6, CUP)           # 盒口高光
        for i in range(n):
            R(d, bx0 - 8 + i * 2, by0 + 1 + (i % 2), bx0 - 8 + i * 2, by0 + 5, FRY)

    # ── scheming forehead (gloom) ──
    if p.get("gloom"):
        R(d, bx0, by0, bx1, by0 + 2, GLOOM)
        if GLOOM_LINES:   # spec §8.2 fallback: the hanging INK lines read as hair, so they are off
            for off, ln in zip((3, 7, 11, 15, 19, 23, 27), (2, 3, 2, 4, 2, 3, 2)):
                R(d, bx0 + off, by0 + 1, bx0 + off, by0 + ln, INK)

    # ── 眼睛 ──
    eyes = p.get("eyes", "open")
    look = p.get("look", 0)
    ly = ey + p.get("look_y", 0)
    el, er = p.get("eyes_l", eyes), p.get("eyes_r", eyes)
    pupil = p.get("pupil", 0)
    if view == "front":
        draw_eye_any(img, d, EYE_L + dx, ly, el, look, False, pupil)
        draw_eye_any(img, d, EYE_R + dx, ly, er, look, True, pupil)
    elif view == "q":
        draw_eye_any(img, d, 20 + dx, ly, "q" if el == "open" else el, look, False, pupil)
        draw_eye_any(img, d, 30 + dx, ly, "q" if er == "open" else er, look, True, pupil)
    else:
        draw_eye_any(img, d, 30 + dx, ly, "side" if er == "open" else er, look, True, pupil)

    # ── mouth / blush / tear (only on reaction peaks and emotion rows) ──
    if "mouth" in p:
        mx, my0, rows = MOUTHS[p["mouth"]]
        my = max(by1 - 7, ey + 5) + p.get("mouth_dy", 0)
        blit(img, rows, cx + mx, my + my0)
    if p.get("blush"):
        R(d, EYE_L + dx - 1, ey + 5, EYE_L + dx + 1, ey + 5, PETAL)
        R(d, EYE_R + dx + 2, ey + 5, EYE_R + dx + 4, ey + 5, PETAL)
        if p["blush"] >= 2:
            R(d, EYE_L + dx - 2, ey + 6, EYE_L + dx, ey + 6, PETAL)
            R(d, EYE_R + dx + 3, ey + 6, EYE_R + dx + 5, ey + 6, PETAL)
    if p.get("tear"):
        put(img, EYE_L + dx - 1, ey + 3, SKY)
        put(img, EYE_R + dx + 4, ey + 3, SKY)

    # ── 睡帽(眼睛之后, 盖住头顶) ──
    if p.get("nightcap"):
        R(d, bx0 + 2, by0 - 3, bx1 - 2, by0 - 1, CAP_WHITE)       # 白边
        for i in range(6):                                         # 向右歪的锥体
            R(d, bx0 + 3 + i * 3, by0 - 4 - i, bx1 - 3 - i, by0 - 4 - i, CAP)
        R(d, bx1 - 9, by0 - 12, bx1 - 7, by0 - 10, CAP_WHITE)     # 绒球

    # ── 手里的食物/饮料(眼睛之后, 送到脸前时可以挡住眼睛) ──
    if "cup" in p:  # ("coffee"|"water", at_face: bool, steam phase)
        kind, at_face, ph = p["cup"]
        if at_face:
            x0, y0 = bx1 - 9, by0 + 0
        else:
            x0, y0 = bx1 + 3, by0 - 6
        if kind == "coffee":
            R(d, x0, y0, x0 + 6, y0 + 6, CUP)
            R(d, x0 + 1, y0, x0 + 5, y0, COFFEE)                  # 咖啡液面
            R(d, x0 + 7, y0 + 2, x0 + 7, y0 + 4, CUP)              # 杯把
            if not at_face:
                for j in range(2):                                # 蒸汽
                    sx = x0 + 2 + j * 3
                    sy = y0 - 3 - ((ph + j) % 2)
                    d.point([(round(sx), round(sy)), (round(sx + (1 if (ph + j) % 2 else -1)), round(sy - 2))], fill=STEAM)
        else:
            R(d, x0 + 1, y0, x0 + 5, y0 + 6, GLASS)
            R(d, x0 + 2, y0 + 2, x0 + 4, y0 + 6, WATER)
            R(d, x0 + 1, y0, x0 + 1, y0 + 6, CAP_WHITE)             # 高光
    if "fry_hand" in p:  # 右手捏薯条送到脸前(手在眼睛下方, 薯条竖在眼睛旁边)
        R(d, bx1 - 7, by0 + 9, bx1 - 1, by0 + 12, body_c)
        if p["fry_hand"]:
            R(d, bx1 - 3, by0 + 2, bx1 - 3, by0 + 8, FRY)
    if "sausage" in p:  # (length, at_face)
        ln, at_face = p["sausage"]
        if at_face:
            x1, y0 = bx1 - 2, by0 + 3
            x0 = x1 - ln
        else:
            x0, y0 = bx1 + 2, by0 - 3
            x1 = x0 + ln
            R(d, bx1 + 2, by0 - 1, bx1 + 2, by0 + 1, STICK)         # 签子
        if ln > 0:
            R(d, x0, y0, x1, y0 + 2, SAUSAGE)
            R(d, x0, y0, x0, y0 + 2, SAUSAGE_DK)
            R(d, x1, y0, x1, y0 + 2, SAUSAGE_DK)
    if "zz" in p:  # 睡觉的 zZZ, 参数是上浮偏移
        off = p["zz"]
        zx, zy = bx1 + 4, by0 - 4 - off
        for i, s in enumerate((2, 3, 4)):
            x, y = zx + i * 4, zy - i * 4
            R(d, x, y - s, x + s, y - s, ZINK)
            for k in range(s + 1):
                d.point([(round(x + s - k), round(y - s + k))], fill=ZINK)
            R(d, x, y, x + s, y, ZINK)
    if "heart" in p:  # 被摸头: 头顶飘小爱心 + 腮红
        hx, hy = bx1 - 2, by0 - 7 - p["heart"]
        R(d, hx - 2, hy - 1, hx - 1, hy, PETAL)
        R(d, hx + 1, hy - 1, hx + 2, hy, PETAL)
        R(d, hx - 3, hy, hx + 3, hy + 1, PETAL)
        R(d, hx - 2, hy + 2, hx + 2, hy + 2, PETAL)
        R(d, hx - 1, hy + 3, hx + 1, hy + 3, PETAL)
        d.point([(round(hx), round(hy + 4))], fill=PETAL)
        R(d, EYE_L + dx - 1, by0 + 9, EYE_L + dx + 1, by0 + 9, PETAL)   # 腮红
        R(d, EYE_R + dx + 2, by0 + 9, EYE_R + dx + 4, by0 + 9, PETAL)
    if "z1" in p:  # 打瞌睡的一个小 z
        x, y = bx1 + 4, by0 - 5 - p["z1"]
        R(d, x, y - 2, x + 2, y - 2, ZINK)
        d.point([(round(x + 1), round(y - 1))], fill=ZINK)
        R(d, x, y, x + 2, y, ZINK)

    # ── 小花(举在右臂顶端) ──
    if "flower" in p:
        fx = bx1 + 3 + p["flower"]      # 摇摆偏移
        fy = by0 - 12
        d.line([round(bx1 + 3), round(by0 - 8), round(fx), round(fy + 4)], fill=STEM, width=1)  # 茎
        R(d, fx - 4, fy - 1, fx - 3, fy + 1, PETAL)   # 左瓣
        R(d, fx + 3, fy - 1, fx + 4, fy + 1, PETAL)   # 右瓣
        R(d, fx - 1, fy - 4, fx + 1, fy - 3, PETAL)   # 上瓣
        R(d, fx - 1, fy + 3, fx + 1, fy + 4, PETAL)   # 下瓣
        R(d, fx - 2, fy - 2, fx + 2, fy + 2, PETAL)   # 花心外圈
        R(d, fx - 1, fy - 1, fx + 1, fy + 1, POLLEN)  # 花蕊
        d.point([(round(bx1 + 1), round(by0 - 6))], fill=STEM)           # 叶子
        R(d, bx1 + 0, by0 - 6, bx1 + 1, by0 - 5, STEM)

    # ── 小道具(前景) ──
    if "sweat" in p:
        sx, sy = p["sweat"]
        R(d, sx, sy, sx + 1, sy + 2, SWEAT)
        d.point([round(sx), round(sy - 1)], fill=SWEAT)
    if "qmark" in p:
        qy = 12 + p["qmark"]
        qx = bx1 + 4
        d.arc([qx - 2, qy - 3, qx + 2, qy + 1], start=180, end=90, fill=PROP, width=2)
        d.line([round(qx + 1.6), round(qy), round(qx), round(qy + 2)], fill=PROP, width=2)
        d.point([round(qx), round(qy + 4)], fill=PROP)
    if "dots" in p:
        for i in range(p["dots"]):
            R(d, bx1 + 3 + i * 4, 14 - i, bx1 + 4 + i * 4, 15 - i, PROP)
    if "bang" in p:
        bx = bx1 + 4
        d.line([round(bx), 9, round(bx), 14], fill=(226, 96, 60, 255), width=2)
        d.point([round(bx), 16], fill=(226, 96, 60, 255))
    if p.get("dust"):
        for ox in (bx0 - 5, bx1 + 3):
            R(d, ox, ground - 3, ox + 2, ground - 2, DUST)
            R(d, ox + 1, ground - 5, ox + 2, ground - 4, DUST)

    # ── new props and marks (after the eyes) ──
    if "mag" in p:
        draw_mag(img, d, p["mag"], by0, body_c, leg_c)
    if "shades" in p:
        sox, soy, glint = p["shades"]
        draw_shades(img, bx0 + sox, ey + soy, glint, p.get("shades_air", False))
    if "stars" in p:
        k = p["stars"]
        for s in (k % 8, (k + 3) % 8, (k + 6) % 8):
            if s < 5:
                sx, sy = STAR_SLOTS[s]
                paint_mark(img, _pix(STAR3_ROWS), True, cx + sx - 1, by0 - 4 + sy - 1)
    for name, stage, anchor in p.get("marks", []):
        draw_mark(img, name, stage, anchor, geo, p)
    for side, st in p.get("steam", []):
        if side == "L":
            x0 = bx0 - 4 - st
        else:
            x0 = bx1 + 2 + st
        y0 = by0 - 3 - 3 * st
        puff = _pix(STEAM_BM[st], color=(STEAM_FADE if st == 2 else CREAM))
        # a raised arm sits on the puff spot: let the puff rise above it with STEAM_CLEAR px of air
        # between (QA fix: a puff resting on the arm top read as a white claw tip, not steam)
        pts = [(x, y) for x, y, _c in puff]
        for _ in range(16):
            if y0 <= 0 or not _near_opaque(img, pts, x0, y0, STEAM_CLEAR):
                break
            y0 -= 1
        paint_mark(img, puff, True, x0, y0)
    if "paper" in p and not p.get("paper_under_lid"):
        paint_mark(img, _pix(PAPER_ROWS), True, p["paper"][0], p["paper"][1])
    for x, y in p.get("crumbs", []):
        paint_mark(img, [(0, 0, CREAM)], True, x, y)
    for x, y in p.get("dust_px", []):
        put(img, x, y, DUST)
    if "puff" in p:
        pf = p["puff"]
        if pf == 0:
            R(d, 41, 41, 42, 42, CREAM)
        elif pf == 1:
            paint_mark(img, _pix(PUFF1), True, 39, 39)
        elif pf == 2:
            paint_mark(img, _pix(PUFF2), True, 37, 36)
        else:
            paint_mark(img, [(37, 38, CREAM), (46, 37, CREAM), (38, 46, CREAM), (47, 44, CREAM),
                             (42, 35, CREAM)], True, 0, 0)
    if "mini" in p:
        blit(img, MINI[p["mini"]], 37, 39)
    return geo


def draw_term(d, bx0, bx1, by1, term):
    """laptop_mode 'term': a shell prompt instead of code lines (§1.8)"""
    cmd_len, cursor, scrolled = term
    X0, Y0, X1, Y1 = bx0 + 6, by1 - 8, bx1 - 6, by1 - 2
    R(d, X0, Y0, X1, Y1, SCREEN_A)
    if scrolled:
        R(d, X0 + 1, Y0 + 1, X0 + 9, Y0 + 1, TERM_DIM)
        py = Y0 + 3
    else:
        py = Y0 + 2
    for px, pyy in ((X0 + 1, py), (X0 + 2, py + 1), (X0 + 1, py + 2)):
        R(d, px, pyy, px, pyy, SCREEN_TXT)
    if cmd_len > 0:
        R(d, X0 + 4, py + 1, X0 + 3 + cmd_len, py + 1, SCREEN_TXT)
    if cursor:
        R(d, X0 + 5 + cmd_len, py + 1, X0 + 6 + cmd_len, py + 1, SCREEN_TXT)


def draw_mag(img, d, mcx, by0, body_c, leg_c):
    """magnifier: RIM ring with a LENS over the eye, handle stair, rimmed claw (§1.8 mag)"""
    y0, y1 = by0 + 2, by0 + 8
    for x in range(mcx - 3, mcx + 4):
        for y in range(y0, y1 + 1):
            ex = x in (mcx - 3, mcx + 3)
            ey_ = y in (y0, y1)
            if ex and ey_:
                continue
            if ex or ey_:
                put(img, x, y, RIM)
            else:
                over_px(img, x, y, LENS)
    put(img, mcx - 2, by0 + 3, CREAM)
    for hx, hy in ((3, 9), (4, 9), (4, 10), (5, 10), (5, 11), (6, 11), (6, 12), (7, 12)):
        put(img, mcx + hx, by0 + hy, HANDLE)
    R(d, mcx + 6, by0 + 12, mcx + 9, by0 + 15, body_c)
    R(d, mcx + 6, by0 + 12, mcx + 9, by0 + 12, leg_c)
    R(d, mcx + 6, by0 + 12, mcx + 6, by0 + 15, leg_c)
    R(d, mcx + 6, by0 + 15, mcx + 9, by0 + 15, leg_c)   # bottom rim too: reads as a pincer over the body


def apply_lid(img, p, geo):
    """lunchbox-lid mouth (§1.8 lid): slab lifts about its bottom-left hinge"""
    th = p["lid"]
    bx0, bx1, by0 = geo["bx0"], geo["bx1"], geo["by0"]
    W = bx1 - bx0 + 1
    lid = Image.new("RGBA", (W, 11), (0, 0, 0, 0))
    lid.paste(img.crop((bx0, by0, bx1 + 1, by0 + 9)), (0, 0))
    ld = ImageDraw.Draw(lid)
    for tx in (4, 9, 14, 19, 24):                                 # upper teeth
        ld.rectangle([tx, 9, tx + 2, 9], fill=CREAM)
        ld.point((tx + 1, 10), fill=CREAM)
    img.paste(Image.new("RGBA", (W, 9), (0, 0, 0, 0)), (bx0, by0))  # clear the slab
    L = bx1 - bx0
    t = math.radians(th)
    tip = (bx0 + round(L * math.cos(t)), by0 + 8 - round(L * math.sin(t)))
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).polygon([(bx0, by0 + 8), (bx1, by0 + 8), tip], fill=255)
    for y in range(img.height):
        for x in range(img.width):
            if mask.getpixel((x, y)):
                img.putpixel((x, y), MOUTH_DK)
    for x in range(bx0 + 13, bx0 + 21):                           # tongue, clipped to the wedge
        for y in (by0 + 7, by0 + 8):
            if 0 <= x < img.width and mask.getpixel((x, y)):
                img.putpixel((x, y), TONGUE)
    for off in (2, 7, 12, 17, 22):                                # lower teeth
        if off * math.tan(t) < 3:
            continue
        tx = bx0 + off
        for x in range(tx, tx + 3):
            put(img, x, by0 + 8, CREAM)
        put(img, tx + 1, by0 + 7, CREAM)
    if p.get("paper_under_lid") and "paper" in p:
        paint_mark(img, _pix(PAPER_ROWS), True, p["paper"][0], p["paper"][1])
    canvas = Image.new("RGBA", img.size, (0, 0, 0, 0))
    canvas.paste(lid, (bx0, by0))
    canvas = canvas.rotate(th, resample=Image.NEAREST, center=(bx0, by0 + 8))
    img.alpha_composite(canvas)
    return img


def apply_lean(img, lean, geo):
    """shear: rows by0..ey+3 move by sign(lean); |lean|==2 moves by0..ey-1 once more"""
    s = 1 if lean > 0 else -1
    by0, ey = geo["by0"], geo["ey"]

    def shift_rows(a, b):
        for y in range(max(a, 0), min(b, img.height - 1) + 1):
            row = img.crop((0, y, img.width, y + 1))
            img.paste(Image.new("RGBA", (img.width, 1), (0, 0, 0, 0)), (0, y))
            img.paste(row, (s, y))
    shift_rows(by0, ey + 3)
    if abs(lean) == 2:
        shift_rows(by0, ey - 1)
    return img


def render(p, mirror=False, scale=SCALE):
    """draw_clawd -> lid -> lean -> rot -> lift -> mirror -> scale.
    Returns (image, (hx, hy, ey)) with the anchor pushed through the same transforms."""
    img = Image.new("RGBA", (LW, LH), (0, 0, 0, 0))
    geo = draw_clawd(ImageDraw.Draw(img), p)
    hx, hy, ey = geo["cx"], geo["by0"], geo["ey"]
    # deviation from §1.9 (g12 QA): the baked headphone band (gaming, row 15) is drawn at by0-3..by0-2,
    # above the head top, and the top emote (hiddenMode's only channel, placed at hy-2) sat on it. hy is
    # the top of the baked headgear there, so the top emote keeps the usual 1 px gap. Pixels unchanged.
    # (The sleep nightcap is left at by0: no top emote can show on it, sleep never runs while climbing.)
    if p.get("headphones"):
        hy = geo["by0"] - 3
    if p.get("lid"):
        img = apply_lid(img, p, geo)
    if p.get("lean"):
        img = apply_lean(img, p["lean"], geo)
        hx += p["lean"]
    ex = hx
    if p.get("rot"):  # 后空翻: 绕身体中心旋转
        img = img.rotate(p["rot"], resample=Image.NEAREST, center=(24, 32))
        t = math.radians(p["rot"])
        c, s = math.cos(t), math.sin(t)

        def rp(x, y):
            return (24 + (x - 24) * c + (y - 32) * s, 32 - (x - 24) * s + (y - 32) * c)
        (hx, hy), (ex, ey) = rp(hx, hy), rp(ex, ey)
        hx, hy, ey = round(hx), round(hy), round(ey)
    if p.get("lift"):  # 腾空高度
        shifted = Image.new("RGBA", (LW, LH), (0, 0, 0, 0))
        shifted.paste(img, (0, -int(p["lift"])))
        img = shifted
        hy -= int(p["lift"])
        ey -= int(p["lift"])
    if mirror:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
        hx = LW - 1 - hx
    if scale == SCALE:
        img = img.resize((CW, CH), Image.NEAREST)
    elif scale != 1:
        img = img.resize((LW * scale, LH * scale), Image.NEAREST)
    return img, (int(hx), int(hy), int(ey))


def frames_idle():
    return [
        {"dy": 0, "eyes": "open"},
        {"dy": 0, "eyes": "open"},
        {"dy": -1, "eyes": "open"},
        {"dy": -1, "eyes": "open", "arm_r": "up"},
        {"dy": 0, "eyes": "closed"},
        {"dy": 0, "eyes": "open"},
    ]


def frames_run(direction=1):
    fs = []
    for i in range(8):
        mx = 5 if direction < 0 else 43
        fs.append({
            "dy": -1 if i % 2 == 0 else 0,
            "dx": direction,
            "legs": i,
            "eyes": "open",
            "look": direction,
            "motion": [(mx, 30, mx + 3 * (1 if direction < 0 else -1), 30),
                       (mx, 36, mx + 2 * (1 if direction < 0 else -1), 36)] if i % 2 == 0 else [],
        })
    return fs


def frames_waving():
    return [
        {"eyes": "happy", "arm_r": "up", "dy": -1},
        {"eyes": "happy", "arm_r": "side"},
        {"eyes": "happy", "arm_r": "up", "dy": -1},
        {"eyes": "happy", "arm_r": "side"},
    ]


def frames_jumping():
    return [
        {"dy": 2, "eyes": "open", "legs": "stand"},
        {"dy": -6, "eyes": "happy", "legs": "tuck", "arm_l": "up", "arm_r": "up"},
        {"dy": -10, "eyes": "happy", "legs": "tuck", "arm_l": "up", "arm_r": "up", "bang": True},
        {"dy": -4, "eyes": "happy", "legs": "tuck", "arm_l": "up", "arm_r": "up"},
        {"dy": 0, "eyes": "happy", "legs": "stand", "dust": True},
    ]


def frames_failed():
    fs = []
    for i in range(8):
        fs.append({
            "dy": 2,
            "dx": 1 if i % 2 == 0 else -1,
            "eyes": "x",
            "legs": "splay",
            "arm_l": "down",
            "arm_r": "down",
            "sweat": (40, 18 + (i % 4)),
        })
    return fs


def frames_waiting():
    looks = [-1, -1, 0, 1, 1, 0]
    fs = []
    for i in range(6):
        fs.append({
            "eyes": "closed" if i == 5 else "open",
            "look": looks[i],
            "arm_r": "up" if i % 2 == 0 else "side",
            "qmark": (i % 3) - 1,
        })
    return fs


def frames_running_work():
    fs = []
    for i in range(6):
        fs.append({
            "dy": -1 if i % 2 == 0 else 0,
            "dx": (-1, 0, 1, 1, 0, -1)[i],
            "legs": i,
            "eyes": "open",
            "look": 0,
            "sweat": (40, 16 + (i % 3)),
            "motion": [(4, 32, 7, 32), (41, 32, 44, 32)] if i % 2 else [],
        })
    return fs


def frames_review():
    fs = []
    for i in range(6):
        fs.append({
            "eyes": "half",
            "arm_r": "up",
            "dots": (i // 2) + 1,
            "dy": 0 if i < 3 else -1,
        })
    return fs


def frames_typing():
    """掏出笔记本敲键盘(running 状态用): 双手交替 + 屏幕闪烁 + 盯着屏幕"""
    fs = []
    for i in range(6):
        fs.append({
            "laptop": i % 2,
            "type_phase": i % 2,
            "eyes": "closed" if i == 4 else "open",
            "eye_dy": 1,
            "arm_l": "none", "arm_r": "none",  # 手画在键盘上, 不画侧臂
        })
    return fs


def frames_flower():
    """举着小花晃悠(空闲彩蛋)"""
    sway = [0, 1, 1, 0, -1, -1]
    fs = []
    for i in range(6):
        fs.append({
            "arm_r": "up",
            "flower": sway[i],
            "eyes": "happy" if i in (1, 2) else ("closed" if i == 4 else "open"),
            "dy": -1 if i in (1, 2) else 0,
        })
    return fs


def frames_drink(kind):
    """端着杯子 → 送到脸前喝 → 放下. kind: coffee / water"""
    seq = [(False, 0, "open"), (False, 1, "open"), (True, 0, "closed"),
           (True, 1, "closed"), (False, 0, "happy"), (False, 1, "open")]
    fs = []
    for at_face, ph, eyes in seq:
        fs.append({"cup": (kind, at_face, ph), "eyes": eyes,
                   "arm_r": "none" if at_face else "hold", "arm_l": "side"})
    return fs


def frames_fries():
    """左手薯条盒, 右手捏一根送到脸前, 吃掉后身体一蹲"""
    seq = [(3, False, "open", 0), (3, True, "open", 0), (2, False, "happy", 1),
           (2, False, "open", 0), (2, True, "open", 0), (1, False, "happy", 1)]
    fs = []
    for n, hand, eyes, dy in seq:
        fs.append({"fries": n, "fry_hand": hand, "eyes": eyes, "dy": dy,
                   "arm_l": "hold", "arm_r": "none"})
    return fs


def frames_sausage():
    seq = [(10, False, "open"), (10, True, "closed"), (7, False, "happy"),
           (7, True, "closed"), (4, False, "happy"), (4, True, "closed")]
    fs = []
    for ln, at_face, eyes in seq:
        fs.append({"sausage": (ln, at_face), "eyes": eyes,
                   "arm_r": "none" if at_face else "hold"})
    return fs


def frames_gaming():
    """戴耳机打手柄(全屏躲在屏幕边上时)"""
    looks = [-1, 0, 1, 0, 0, -1]
    fs = []
    for i in range(6):
        fs.append({"headphones": True, "gamepad": i % 2, "arm_l": "none", "arm_r": "none",
                   "eyes": "closed" if i == 4 else "open", "look": looks[i],
                   "dx": (0, 0, 1, 0, -1, 0)[i]})
    return fs


def frames_backflip():
    fs = [{"dy": 2, "eyes": "open"}]                                   # 蹲
    for i, (rot, lift) in enumerate(((50, 6), (100, 9), (150, 11), (200, 11), (250, 9), (300, 6))):
        fs.append({"rot": rot, "lift": lift, "legs": "tuck", "arm_l": "up", "arm_r": "up",
                   "eyes": "happy"})
    fs.append({"eyes": "happy", "dust": True})                        # 落地
    return fs


def frames_doze():
    """打瞌睡: 点头 + 眼皮打架 + 一个小 z"""
    eyes = ["half", "half", "closed", "closed", "closed", "half"]
    dys = [0, 1, 1, 2, 1, 0]
    dxs = [0, 1, 1, 0, -1, 0]
    fs = []
    for i in range(6):
        p = {"eyes": eyes[i], "dy": dys[i], "dx": dxs[i]}
        if 2 <= i <= 4:
            p["z1"] = i - 2
        fs.append(p)
    return fs


def frames_sleep():
    fs = []
    for i in range(6):
        fs.append({"nightcap": True, "eyes": "closed", "dy": (0, 0, 1, 1, 0, 0)[i], "zz": i})
    return fs


def frames_stretch():
    return [
        {"eyes": "open"},
        {"arm_l": "up", "arm_r": "up", "tall": 1, "eyes": "open"},
        {"arm_l": "stretch", "arm_r": "stretch", "tall": 2, "eyes": "closed"},
        {"arm_l": "stretch", "arm_r": "stretch", "tall": 2, "eyes": "closed"},
        {"arm_l": "up", "arm_r": "up", "tall": 1, "eyes": "happy"},
        {"eyes": "open"},
    ]


def frames_petted():
    """被摸头: 眯眼开心 + 轻轻晃 + 爱心上飘"""
    fs = []
    for i in range(6):
        fs.append({"eyes": "happy", "dy": (0, -1, -1, 0, 0, 0)[i], "dx": (0, 0, 1, 1, 0, -1)[i],
                   "heart": i, "arm_l": "side", "arm_r": "up" if i in (2, 3) else "side"})
    return fs


def frames_phone():
    fs = []
    for i in range(6):
        fs.append({"phone": i % 2, "arm_l": "none", "arm_r": "none", "eye_dy": 1,
                   "eyes": "closed" if i == 4 else "half"})
    return fs


ROWS_SPEC = [
    ("idle", frames_idle(), False),
    ("running-right", frames_run(1), False),
    ("running-left", frames_run(1), True),
    ("waving", frames_waving(), False),
    ("jumping", frames_jumping(), False),
    ("failed", frames_failed(), False),
    ("waiting", frames_waiting(), False),
    ("running", frames_running_work(), False),
    ("review", frames_review(), False),
    ("typing", frames_typing(), False),         # row 9  (扩展行, 以下同)
    ("flower", frames_flower(), False),         # row 10
    ("coffee", frames_drink("coffee"), False),  # row 11
    ("water", frames_drink("water"), False),    # row 12
    ("fries", frames_fries(), False),           # row 13
    ("sausage", frames_sausage(), False),       # row 14
    ("gaming", frames_gaming(), False),         # row 15
    ("backflip", frames_backflip(), False),     # row 16
    ("doze", frames_doze(), False),             # row 17
    ("sleep", frames_sleep(), False),           # row 18
    ("stretch", frames_stretch(), False),       # row 19
    ("phone", frames_phone(), False),           # row 20
    ("petted", frames_petted(), False),         # row 21
]


# ═════════════════════════════════════════════════════════════════════════
# Rows 22-42 (animation expansion, spec §2). Appended in this exact order.
# ═════════════════════════════════════════════════════════════════════════

def frames_look():
    """22 cursor-watch table: rest pose, only the eyes move; f7 is the blink / squint bridge"""
    return [{"look": -2}, {"look": -1}, {}, {"look": 1}, {"look": 2},
            {"look_y": -1}, {"look_y": 1}, {"eyes": "closed"}]


def frames_hop():
    """23 a real jump: crouch, stretch, apex hold, squash landing"""
    return [
        {"sq": 3, "eyes": "closed", "arm_l": "down", "arm_r": "down"},
        {"sq": -4, "dy": -4, "legs": "tuck", "arm_l": "up", "arm_r": "up", "eyes": "wide",
         "motion": [(16, 44, 16, 47), (24, 45, 24, 47), (32, 44, 32, 47)]},
        {"sq": -2, "dy": -8, "legs": "tuck", "arm_l": "up", "arm_r": "up", "eyes": "happy"},
        {"dy": -10, "legs": "tuck", "arm_l": "up", "arm_r": "up", "eyes": "happy", "mouth": "smile"},
        {"sq": -2, "dy": -5, "legs": "reach", "arm_l": "raise45", "arm_r": "raise45"},
        {"sq": 4, "eyes": "squeeze", "dust": True},
        {"sq": -1, "dy": -1, "arm_l": "raise45", "arm_r": "raise45", "eyes": "happy"},
        {"eyes": "happy", "mouth": "smile"},
    ]


def frames_dangle():
    """24 carried while dragged: f0-3 calm, f4-7 scared"""
    fs = []
    for f in range(4):
        fs.append({"sq": -2, "look_y": 1, "mouth": "o", "arm_l": "up", "arm_r": "stretch",
                   "legs": "dangle", "dangle_phase": [1, 2, 1, 0][f], "dy": [0, -1, 0, -1][f]})
    for j in range(4):
        fs.append({"tint": "pale", "sq": -3, "eyes": "saucer", "pupil": [0, 1, 0, 1][j],
                   "mouth": ["wobble_a", "wobble_b"][j % 2], "dx": [1, -1, 1, -1][j],
                   "arm_l": "up", "arm_r": "stretch", "legs": "dangle",
                   "dangle_phase": [1, 2, 1, 2][j], "marks": [("sweat2", j % 3, "head_r")]})
    return fs


def frames_dizzy():
    """25 after a fling"""
    arm = ["up", "raise45", "side", "raise45", "up", "raise45", "side", "raise45"]
    fs = []
    for f in range(8):
        fs.append({"dx": [0, 1, 2, 1, 0, -1, -2, -1][f], "lean": [0, 0, 1, 0, 0, 0, -1, 0][f],
                   "dy": [0, -1, 0, 0, 0, -1, 0, 0][f],
                   "eyes_l": ["swirl_a", "swirl_b"][f % 2], "eyes_r": ["swirl_b", "swirl_a"][f % 2],
                   "mouth": ["wobble_a", "wobble_b"][f % 2],
                   "arm_l": arm[f], "arm_r": arm[(f + 2) % 8], "stars": f})
    return fs


def frames_surprised():
    """26 take, deadpan, sheepish (aliases startle / busted)"""
    return [
        {"sq": 2},
        {"sq": -4, "dy": -4, "legs": "tuck", "arm_l": "up", "arm_r": "up", "eyes": "wide", "mouth": "O",
         "marks": [("bang", "seed", "side_far")]},
        {"sq": -2, "dy": -2, "arm_l": "up", "arm_r": "up", "eyes": "wide", "mouth": "O",
         "marks": [("bang", "over", "side_far")]},
        {"sq": 2, "arm_l": "raise45", "arm_r": "raise45", "eyes": "wide", "mouth": "o",
         "marks": [("bang", "lean_r", "side_far")]},
        {"arm_l": "raise45", "arm_r": "raise45", "eyes": "wide", "mouth": "o",
         "marks": [("bang", "lean_l", "side_far")]},
        {"eyes": "dot", "mouth": "flat", "marks": [("bang", "settle", "side_far")]},
        {"eyes": "content", "mouth": "smile", "arm_r": "up", "look": -1, "marks": [("sweat2", 0, "head_r")]},
        {"eyes": "content", "mouth": "smile", "arm_r": "up", "arm_r_dy": -1, "look": -1,
         "marks": [("sweat2", 1, "head_r")]},
    ]


def frames_plotting():
    """27 mischief before a cursor steal"""
    fs = []
    for i in range(6):
        fs.append({"eyes": "narrow", "look": 2, "mouth": "grin", "gloom": True,
                   "arm_l": "hold", "arm_r": "hold",
                   "arm_l_dy": [1, 0, 1, 0, 1, 0][i], "arm_r_dy": [0, 1, 0, 1, 0, 1][i],
                   "dy": [-1, 0, -1, 0, -1, 0][i], "lean": 1})
    return fs


def frames_yawn():
    """28"""
    return [
        {"eyes": "half"},
        {"sq": -2, "eyes": "closed", "mouth": "yawn1", "arm_l": "raise45", "arm_r": "raise45"},
        {"sq": -3, "eyes": "squeeze", "mouth": "yawn2", "arm_l": "up", "arm_r": "up"},
        {"sq": -4, "eyes": "squeeze", "mouth": "yawn3", "arm_l": "stretch", "arm_r": "stretch", "tear": True},
        {"sq": -4, "eyes": "squeeze", "mouth": "yawn3", "mouth_dy": 1, "arm_l": "stretch", "arm_r": "stretch",
         "tear": True},
        {"sq": -2, "eyes": "squeeze", "mouth": "yawn2", "arm_l": "up", "arm_r": "up"},
        {"sq": 2, "eyes": "closed", "mouth": "o", "arm_l": "down", "arm_r": "down"},
        {"sq": 1, "eyes": "half", "arm_l": "down", "arm_r": "down", "z1": 0},
    ]


def frames_love():
    """29 long petting"""
    fs = []
    for f in range(8):
        fs.append({"tint": "rosy", "blush": 2, "mouth": "cat",
                   "eyes": "heart_big" if f == 0 else "heart",  # one throb per loop, not two
                   "dx": [0, 1, 1, 1, 0, -1, -1, -1][f], "lean": [0, 0, 1, 0, 0, 0, -1, 0][f],
                   "dy": [0, -1, 0, 0, 0, -1, 0, 0][f],
                   "arm_l": ["down", "side"][f % 2], "arm_r": ["side", "down"][f % 2],
                   "marks": [("hearts3", f, "side")]})
    return fs


def frames_laugh():
    """30 tickled"""
    fs = [{"sq": 2, "eyes": "wide", "mouth": "O", "arm_l": "raise45", "arm_r": "raise45"}]
    for j in range(1, 6):
        fs.append({"eyes": "squeeze", "mouth": "laugh", "blush": 1,
                   "dy": [-1, 0, -1, 0, -1][j - 1], "sq": [0, 1, 0, 1, 0][j - 1],
                   "lean": -1 if j % 2 else 0,
                   "arm_l": "down" if j % 2 else "side", "arm_r": "side" if j % 2 else "down",
                   "tear": j >= 3})
    return fs


def frames_nervous():
    """31 a permission prompt left waiting"""
    fs = []
    for f in range(8):
        fs.append({"tall": 1, "look": [-2, -2, 2, 2, -1, -1, 2, 0][f],
                   "mouth": ["wobble_a", "wobble_b"][f % 2], "dx": [0, 1, 0, -1, 0, 1, 0, -1][f],
                   "arm_l": ["side", "down"][f % 2], "arm_r": ["side", "side", "down"][f % 3],
                   "marks": [("sweat2", f % 4, "side")]})
    return fs


def frames_fingers_crossed():
    """32 tests running; f2 is the peek"""
    fs = []
    for f in range(4):
        p = {"sq": 1, "eyes": "squeeze", "arm_l": "hold", "arm_r": "hold",
             "arm_l_dy": [0, 1, 0, 1][f], "arm_r_dy": [1, 0, 1, 0][f],
             "mouth": ["wobble_a", "wobble_b"][f % 2], "marks": [("sweat2", f % 3, "side")]}
        if f == 2:
            p.update({"eyes_l": "squeeze", "eyes_r": "open", "look": -1})
        fs.append(p)
    return fs


def frames_sad():
    """33 tests failed (rain cloud baked in)"""
    fs = []
    for f in range(8):
        p = {"tint": "sad", "sq": 2, "eyes": "sad", "eye_dy": 1, "mouth": "frown",
             "arm_l": "down", "arm_r": "down"}
        if f == 0:
            p["marks"] = [("raincloud", "seed", "top")]
        elif f == 1:
            p["marks"] = [("raincloud", "over", "top")]
        else:
            p["marks"] = [("raincloud", (f - 2) % 3, "top")]
        if f in (4, 5):
            p["raincloud_dy"] = 1
        if f >= 5:
            p["lean"] = 1
        fs.append(p)
    return fs


def frames_summon():
    """34 a subagent pops out of a puff (reverse alias summon-return)"""
    return [
        {"sq": 2, "arm_l": "down", "arm_r": "down", "eyes": "closed"},
        {"sq": -2, "arm_l": "up", "arm_r": "up", "eyes": "squeeze"},
        {"arm_l": "up", "arm_r": "up", "look": 1, "puff": 0},
        {"arm_l": "up", "arm_r": "up", "look": 1, "puff": 1},
        {"arm_l": "up", "arm_r": "up", "look": 1, "dy": -1, "puff": 2},
        {"look": 1, "puff": 3, "mini": "side"},
        {"eyes": "happy", "mini": "up"},
        {"mini": "side"},
    ]


def frames_chomp():
    """35 the lid eats a page (f2 doubles as chomp-open)"""
    return [
        {"eyes": "narrow", "look": 1, "arm_r": "hold", "paper": (39, 19)},
        {"lid": 12, "look": -1, "arm_r": "hold", "paper": (39, 17)},
        {"lid": 35, "arm_r": "up", "paper": (39, 6)},
        {"lid": 35, "paper": (28, 20), "paper_under_lid": True},
        {"sq": 3, "dy": 1, "eyes": "squeeze", "crumbs": [(41, 28), (44, 31)]},
        {"lid": 6, "sq": 1, "eyes": "content", "crumbs": [(44, 35)]},
        {"sq": 2, "eyes": "content", "crumbs": [(44, 46)]},
        {"eyes": "content", "blush": 1, "marks": [("puff_small", 0, "side")]},
    ]


def frames_furious():
    """36 the lid rattles (3rd fling in 2 min); shake on f2 and f5"""
    seq = [
        {"lid": 14, "arm_l": "up", "arm_r": "raise45", "steam": [("L", 0)]},
        {"lid": 20, "dx": 1, "arm_l": "raise45", "arm_r": "up", "steam": [("L", 1), ("R", 0)]},
        {"lid": 14, "sq": 2, "dx": -1, "arm_l": "up", "arm_r": "up", "dust": True, "steam": [("L", 2), ("R", 1)]},
        {"lid": 22, "dx": 1, "arm_l": "raise45", "arm_r": "up", "steam": [("R", 2)]},
        {"lid": 16, "dx": -1, "arm_l": "up", "arm_r": "side", "steam": [("L", 0)]},
        {"lid": 20, "sq": 2, "arm_l": "up", "arm_r": "up", "dust": True, "steam": [("R", 0)]},
    ]
    for p in seq:
        p.update({"tint": "flush", "eyes": "angry_red"})
    return seq


def frames_work_read():
    """37 magnifier sweep (Read / Grep / Glob)"""
    seq = [
        {"mag": 17, "eyes_l": "wide", "look": -1},
        {"mag": 21},
        {"mag": 25, "lean": 1},
        {"mag": 31, "eyes_r": "wide", "look": 1},
        {"mag": 31, "eyes_r": "shine", "dy": -1, "marks": [("sparkle", "settle", "side")]},
        {"mag": 24},
    ]
    for p in seq:
        p["arm_r"] = "none"
    return seq


def frames_work_shell():
    """38 terminal typing plus an Enter slam (Bash)"""
    seq = [
        {"type_phase": 0, "term": (0, True, False)},
        {"type_phase": 1, "term": (3, False, False)},
        {"type_phase": 0, "term": (5, True, False)},
        # deviation (QA fix): hand_r_dy -4 instead of §2's -2, so the Enter wind-up reads
        {"type_phase": 0, "hand_r_dy": -4, "look": 1, "term": (5, False, False)},
        {"type_phase": 0, "hand_r_dy": 1, "sq": 1, "term": (0, True, True)},
        {"type_phase": 1, "term": (0, True, True)},
    ]
    for p in seq:
        p.update({"laptop": 0, "laptop_mode": "term", "eye_dy": 1, "arm_l": "none", "arm_r": "none"})
    return seq


def frames_dance():
    """39 beat bounce; the note sits on the side whose arm is down"""
    fs = []
    for f in range(8):
        fs.append({"dy": [0, -3, -5, -3, 0, -3, -5, -3][f], "sq": 2 if f in (0, 4) else 0,
                   "legs": "tuck" if f in (2, 6) else ("reach" if f % 2 else "stand"),
                   "arm_l": "up" if f < 4 else "side", "arm_r": "side" if f < 4 else "up",
                   "eyes": "happy", "mouth": "smile", "dx": [0, 0, 1, 1, 0, 0, -1, -1][f],
                   "marks": [("note", f % 4, "side" if f < 4 else "side_l")]})
    return fs


def frames_cool():
    """40 sunglasses drop (clean streak)"""
    return [
        # shades_air (QA fix): glints + speed streaks while the shades fall with no body behind them
        {"eyes": "narrow", "look": 1, "shades": (2, -18, None), "shades_air": True},
        {"eyes": "narrow", "look": 1, "shades": (2, -11, None), "shades_air": True},
        {"eyes": "narrow", "look": 1, "shades": (1, -5, None), "shades_air": True},
        {"eyes": "none", "sq": 2, "dy": 1, "shades": (0, 0, None)},
        {"eyes": "none", "mouth": "smirk", "shades": (0, 1, None)},
        {"eyes": "none", "mouth": "smirk", "arm_r": "raise45", "shades": (0, 0, 0)},
        {"eyes": "none", "mouth": "smirk", "arm_r": "raise45", "dy": -1, "shades": (0, 0, 1),
         "marks": [("note", "seed", "side")]},
        {"eyes": "none", "mouth": "smirk", "arm_r": "raise45", "shades": (0, 0, 2),
         "marks": [("note", 0, "side")]},
    ]


def frames_trot():
    """41 turn into a side-view trot (left = CSS flip)"""
    fs = [
        {"sq": 1, "look": 2},
        {"view": "q", "smear": -1, "eyes": "dash"},
        {"view": "side", "lean": 1, "side_legs": (0, 0, 0, 0), "motion": [(8, 30, 11, 30), (9, 36, 11, 36)]},
    ]
    for k in range(4):
        fs.append({"view": "side",
                   "side_legs": ([0, 1, 0, -1][k], [0, 2, 0, 0][k], [0, -1, 0, 1][k], [0, 0, 0, 2][k]),
                   "dy": [0, -1, 0, -1][k], "arm_r_dy": [0, 1, 0, -1][k],
                   "dust_px": [(13, 47)] if k % 2 else []})
    fs.append({"view": "side", "sq": 2, "lean": -1, "look": -1, "side_legs": (1, 0, 0, 0),
               "dust_px": [(31, 46), (32, 46), (33, 47)]})
    return fs


def frames_fall():
    """42 airborne while the window drops (dy 0: the window itself falls)"""
    return [
        {"sq": -2, "legs": "reach", "arm_l": "up", "arm_r": "up", "eyes": "wide", "mouth": "o"},
        {"sq": -2, "legs": "reach", "arm_l": "raise45", "arm_r": "raise45", "eyes": "wide", "mouth": "o"},
    ]


ROWS_SPEC += [
    ("look", frames_look(), False),                        # row 22
    ("hop", frames_hop(), False),                          # row 23
    ("dangle", frames_dangle(), False),                    # row 24
    ("dizzy", frames_dizzy(), False),                      # row 25
    ("surprised", frames_surprised(), False),              # row 26
    ("plotting", frames_plotting(), False),                # row 27
    ("yawn", frames_yawn(), False),                        # row 28
    ("love", frames_love(), False),                        # row 29
    ("laugh", frames_laugh(), False),                      # row 30
    ("nervous", frames_nervous(), False),                  # row 31
    ("fingers-crossed", frames_fingers_crossed(), False),  # row 32
    ("sad", frames_sad(), False),                          # row 33
    ("summon", frames_summon(), False),                    # row 34
    ("chomp", frames_chomp(), False),                      # row 35
    ("furious", frames_furious(), False),                  # row 36
    ("work-read", frames_work_read(), False),              # row 37
    ("work-shell", frames_work_shell(), False),            # row 38
    ("dance", frames_dance(), False),                      # row 39
    ("cool", frames_cool(), False),                        # row 40
    ("trot", frames_trot(), False),                        # row 41
    ("fall", frames_fall(), False),                        # row 42
]
ROWS = len(ROWS_SPEC)
for _name, _frames, _m in ROWS_SPEC:
    assert len(_frames) <= COLS, _name


def make_icons(assets_dir):
    """应用图标: idle 第一帧放大裁成正方形 → icon.png / icon.ico / tray.png"""
    base = Image.new("RGBA", (LW, LH), (0, 0, 0, 0))
    draw_clawd(ImageDraw.Draw(base), {"eyes": "open"})
    # 裁到螃蟹本体(x 4..44, y 20..48) → 40x28, 居中放进 40x40
    crab = base.crop((4, 18, 44, 48))
    sq = Image.new("RGBA", (40, 40), (0, 0, 0, 0))
    sq.paste(crab, (0, 5))
    big = sq.resize((256, 256), Image.NEAREST)
    big.save(os.path.join(assets_dir, "icon.png"), "PNG")
    big.save(os.path.join(assets_dir, "icon.ico"), format="ICO",
             sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    sq.resize((32, 32), Image.LANCZOS).save(os.path.join(assets_dir, "tray.png"), "PNG")
    print("icons saved to", assets_dir)



# ═════════════════════════════════════════════════════════════════════════
# The A -> B contract: spec Appendix A, verbatim. Meta rows / aliases / expr /
# shakeFrames / emotes / hats are emitted from here, never retyped.
# ═════════════════════════════════════════════════════════════════════════
CONTRACT = json.loads(r"""
{
  "version": 1,
  "sheet": {"file": "spritesheet.webp", "columns": 8, "rows": 43, "cellW": 192, "cellH": 208, "scale": 4},
  "rows": {
    "look":            {"row": 22, "frames": 8, "frameDurations": [400,400,400,400,400,400,400,130], "loop": true,  "loopStart": 0, "loopEnd": 6, "fallback": "idle"},
    "hop":             {"row": 23, "frames": 8, "frameDurations": [140,90,90,160,90,90,110,240],     "loop": false, "fallback": "jumping"},
    "dangle":          {"row": 24, "frames": 8, "frameDurations": [130,130,130,160,90,90,90,90],     "loop": true,  "loopStart": 0, "loopEnd": 3, "fallback": "running-right"},
    "dizzy":           {"row": 25, "frames": 8, "frameDurations": [110,110,110,110,110,110,110,110], "loop": true,  "fallback": "failed"},
    "surprised":       {"row": 26, "frames": 8, "frameDurations": [110,90,90,110,140,400,350,450],   "loop": false, "fallback": "jumping"},
    "plotting":        {"row": 27, "frames": 6, "frameDurations": [125,125,125,125,125,125],         "loop": true,  "fallback": "review"},
    "yawn":            {"row": 28, "frames": 8, "frameDurations": [220,160,200,450,300,140,220,500], "loop": false, "fallback": "idle"},
    "love":            {"row": 29, "frames": 8, "frameDurations": [250,250,250,250,250,250,250,250], "loop": true,  "fallback": "waving"},
    "laugh":           {"row": 30, "frames": 6, "frameDurations": [90,100,100,100,100,100],          "loop": true,  "loopStart": 1, "loopEnd": 5, "fallback": "waving"},
    "nervous":         {"row": 31, "frames": 8, "frameDurations": [125,125,125,125,125,125,125,125], "loop": true,  "fallback": "waiting"},
    "fingers-crossed": {"row": 32, "frames": 4, "frameDurations": [120,120,260,120],                 "loop": true,  "fallback": "waiting"},
    "sad":             {"row": 33, "frames": 8, "frameDurations": [90,90,125,125,125,125,125,125],   "loop": true,  "loopStart": 2, "loopEnd": 7, "fallback": "failed"},
    "summon":          {"row": 34, "frames": 8, "frameDurations": [140,110,90,90,110,140,200,400],   "loop": false, "fallback": "jumping"},
    "chomp":           {"row": 35, "frames": 8, "frameDurations": [220,90,140,90,90,140,140,420],    "loop": false, "fallback": "idle"},
    "furious":         {"row": 36, "frames": 6, "frameDurations": [110,110,125,110,110,125],         "loop": true,  "fallback": "failed"},
    "work-read":       {"row": 37, "frames": 6, "frameDurations": [180,160,160,200,320,160],         "loop": true,  "fallback": "running"},
    "work-shell":      {"row": 38, "frames": 6, "frameDurations": [130,130,130,110,90,260],          "loop": true,  "fallback": "running"},
    "dance":           {"row": 39, "frames": 8, "frameDurations": [125,125,125,125,125,125,125,125], "loop": true,  "fallback": "jumping"},
    "cool":            {"row": 40, "frames": 8, "frameDurations": [110,90,90,90,110,250,250,600],    "loop": false, "fallback": "jumping"},
    "trot":            {"row": 41, "frames": 8, "frameDurations": [90,90,90,110,110,110,110,140],    "loop": true,  "loopStart": 3, "loopEnd": 6, "fallback": "running-right", "fallbackFlip": "running-left"},
    "fall":            {"row": 42, "frames": 2, "frameDurations": [120,120],                         "loop": true,  "fallback": "jumping"}
  },
  "aliases": {
    "hop-land":      {"of": "hop",       "frameIndices": [5,6,7],           "frameDurations": [90,110,240],                    "loop": false},
    "dangle-scared": {"of": "dangle",    "frameIndices": [4,5,6,7],         "frameDurations": [90,90,90,90],                   "loop": true},
    "startle":       {"of": "surprised", "frameIndices": [0,1,2,3,4,5],     "frameDurations": [110,90,90,110,140,400],         "loop": false},
    "busted":        {"of": "surprised", "frameIndices": [0,1,2,3,5,6,7],   "frameDurations": [110,90,90,110,400,350,450],     "loop": false},
    "summon-return": {"of": "summon",    "frameIndices": [7,6,5,4,3,2,1,0], "frameDurations": [200,160,140,110,90,90,110,200], "loop": false},
    "chomp-open":    {"of": "chomp",     "frameIndices": [2],               "frameDurations": [400],                           "loop": true},
    "trot-stop":     {"of": "trot",      "frameIndices": [7,1,0],           "frameDurations": [140,90,120],                    "loop": false},
    "squint":        {"of": "look",      "frameIndices": [7],               "frameDurations": [100],                           "loop": false}
  },
  "expr": ["dizzy","surprised","plotting","yawn","love","laugh","nervous","fingers-crossed","sad","furious","cool"],
  "shakeFrames": {"furious": [2,5]},
  "anchorFields": ["hx","hy","ey","flags","view"],
  "flags": {"HAT_OK": 1, "EMOTE_OK": 2, "FACE_OK": 4, "MIRRORED": 8, "TINTED": 16, "MARK_SIDE": 32, "MARK_TOP": 64},
  "emotes": {
    "file": "emotes.webp", "cellW": 96, "cellH": 96, "columns": 8, "pivotSide": [0,23], "pivotTop": [12,23],
    "popMs": [90,90,90],
    "list": {
      "bang":       {"row": 0,  "anchor": "side", "w": 4,  "loop": [3,4,2],     "loopMs": [120,120,400],     "life": 1800, "fadeAt": 1400},
      "question":   {"row": 1,  "anchor": "side", "w": 5,  "loop": [3,2],       "loopMs": [300,300],         "life": 2400, "fadeAt": 2000},
      "bangq":      {"row": 2,  "anchor": "side", "w": 8,  "loop": [2],         "loopMs": [1000],            "life": 2000, "fadeAt": 1600},
      "sweat":      {"row": 3,  "anchor": "side", "w": 8,  "loop": [3,4,5],     "loopMs": [150,150,150],     "life": null},
      "hearts":     {"row": 4,  "anchor": "side", "w": 10, "loop": [3,4,5,6,7], "loopMs": [150,150,150,150,150], "life": null},
      "anger":      {"row": 5,  "anchor": "side", "w": 7,  "loop": [3,4],       "loopMs": [250,250],         "life": null},
      "bulb":       {"row": 6,  "anchor": "side", "w": 12, "loop": [3,4],       "loopMs": [200,200],         "life": 1800, "fadeAt": 1400},
      "dots":       {"row": 7,  "anchor": "side", "w": 8,  "loop": [1,2,3,3,4], "loopMs": [250,250,250,250,250], "life": null},
      "note":       {"row": 8,  "anchor": "side", "w": 9,  "loop": [3,4,5,6],   "loopMs": [150,150,150,150], "life": 3000, "fadeAt": 2600},
      "sparkle":    {"row": 9,  "anchor": "side", "w": 8,  "loop": [3,4],       "loopMs": [120,120],         "life": 1500, "fadeAt": 1100},
      "rain":       {"row": 10, "anchor": "top",  "w": 15, "loop": [3,4,5],     "loopMs": [140,140,140],     "life": null},
      "tool-read":  {"row": 11, "anchor": "side", "w": 9,  "loop": [2],         "loopMs": [700],             "life": 1400, "fadeAt": 1100},
      "tool-edit":  {"row": 12, "anchor": "side", "w": 10, "loop": [2],         "loopMs": [700],             "life": 1400, "fadeAt": 1100},
      "tool-shell": {"row": 13, "anchor": "side", "w": 9,  "loop": [2,3],       "loopMs": [350,350],         "life": 1400, "fadeAt": 1100},
      "tool-web":   {"row": 14, "anchor": "side", "w": 7,  "loop": [2],         "loopMs": [700],             "life": 1400, "fadeAt": 1100},
      "tool-agent": {"row": 15, "anchor": "side", "w": 9,  "loop": [2],         "loopMs": [700],             "life": 1400, "fadeAt": 1100},
      "tool-git":   {"row": 16, "anchor": "side", "w": 9,  "loop": [2],         "loopMs": [700],             "life": 1400, "fadeAt": 1100}
    }
  },
  "hats": {
    "file": "hats.webp", "cellW": 160, "cellH": 128, "columns": 4, "pivot": [20,24],
    "cols": {"front": 0, "q": 1, "side": 2, "alt": 3},
    "list": {
      "party":    {"row": 0,  "anchor": "head", "height": 11, "menu": true},
      "tophat":   {"row": 1,  "anchor": "head", "height": 9,  "menu": true},
      "crown":    {"row": 2,  "anchor": "head", "height": 7,  "menu": true},
      "beanie":   {"row": 3,  "anchor": "head", "height": 6,  "menu": true},
      "santa":    {"row": 4,  "anchor": "head", "height": 8,  "menu": true},
      "wizard":   {"row": 5,  "anchor": "head", "height": 14, "menu": true},
      "catears":  {"row": 6,  "anchor": "head", "height": 7,  "menu": true, "hideWhenTinted": true, "hideInSide": true},
      "bow":      {"row": 7,  "anchor": "head", "height": 4,  "menu": true},
      "hardhat":  {"row": 8,  "anchor": "head", "height": 6,  "menu": true},
      "headband": {"row": 9,  "anchor": "head", "height": 0,  "menu": false, "altEveryFrame": true},
      "halo":     {"row": 10, "anchor": "head", "height": 8,  "menu": false, "altEvery2Frames": true},
      "shades":   {"row": 11, "anchor": "eyes", "height": 0,  "menu": true, "needsFace": true, "hideInSide": true}
    }
  }
}
""")


# ── anchors and flags (§1.9, §3.2) ──
F_HAT_OK, F_EMOTE_OK, F_FACE_OK, F_MIRRORED, F_TINTED, F_MARK_SIDE, F_MARK_TOP = 1, 2, 4, 8, 16, 32, 64
FACE_EYES = ("open", "closed", "half", "happy", "narrow", "wide", "dot", "content")
MARK_KEYS = ("marks", "qmark", "dots", "bang", "zz", "z1", "heart", "flower", "cup", "sausage", "fries",
             "fry_hand", "sweat", "steam", "puff", "mini", "paper", "crumbs", "dust_px", "stars", "dust",
             "motion")
VIEW_CODE = {"front": 0, "q": 1, "side": 2}


def frame_record(p, mirror):
    """[hx, hy, ey, flags, view] for one frame. MARK_SIDE / MARK_TOP come from diffing the frame
    against the same frame rendered without any mark or prop key (1x, same pipeline)."""
    img, (hx, hy, ey) = render(p, mirror, scale=1)
    bare, _ = render({k: v for k, v in p.items() if k not in MARK_KEYS}, mirror, scale=1)
    rot = p.get("rot", 0)
    lid = p.get("lid", 0)
    flags = 0
    if not (p.get("nightcap") or p.get("headphones") or abs(rot) > 15 or lid > 0):
        flags |= F_HAT_OK
    if not abs(rot) > 15:
        flags |= F_EMOTE_OK
    eyes = p.get("eyes", "open")
    el, er = p.get("eyes_l", eyes), p.get("eyes_r", eyes)
    cup_face = "cup" in p and p["cup"][1]
    sausage_face = "sausage" in p and p["sausage"][1]
    if (el in FACE_EYES and er in FACE_EYES and p.get("view", "front") == "front" and lid == 0
            and "mag" not in p and "shades" not in p and not cup_face and not sausage_face):
        flags |= F_FACE_OK
    if mirror:
        flags |= F_MIRRORED
    if p.get("tint"):
        flags |= F_TINTED
    a, b = img.load(), bare.load()
    for y in range(LH):
        for x in range(LW):
            if a[x, y] == b[x, y]:
                continue
            if (hx + 17 <= x <= hx + 33 or hx - 33 <= x <= hx - 17) and hy - 12 <= y <= hy + 2:
                flags |= F_MARK_SIDE
            if hx - 8 <= x <= hx + 8 and hy - 16 <= y <= hy - 2:
                flags |= F_MARK_TOP
    # deviation from the §3.2 HAT_OK rule (Gate 2 QA): a baked mark in the top-emote box (the sad
    # rain cloud, the head_r sweat on dangle-scared / busted, the dizzy stars) sits exactly where a
    # head hat goes, and the hat overlay would bury it. MARK_TOP frames therefore carry no HAT_OK.
    if flags & F_MARK_TOP:
        flags &= ~F_HAT_OK
    return [hx, hy, ey, flags, VIEW_CODE[p.get("view", "front")]]


HAT_BLINK_MS = 240   # a HAT_OK run shorter than this, with hat-off frames on both sides, is a blink

# lead decision 1 (Gates 1+2): frames whose gag a hat would cover, beyond the lid / MARK_TOP rules.
# cool f0-f2: the shades fall in from above the head.
HAT_OFF_FRAMES = {"cool": (0, 1, 2)}


def clear_hat_frames(name, recs):
    for i in HAT_OFF_FRAMES.get(name, ()):
        recs[i][3] &= ~F_HAT_OK
    return recs


def deflicker_hat(name, recs):
    """Clear HAT_OK on short on-runs that sit between hat-off frames in the order the row plays
    (one-shots linearly; loops cyclically over loopStart..loopEnd), so a hat never flashes for one
    90-ms frame (chomp f4 between the lid frames f3 and f5). Rows without contract timings are left
    as they are (rows 0-21 keep the plain §3.2 rule)."""
    info = CONTRACT["rows"].get(name)
    if not info:
        return recs
    dur = info["frameDurations"]
    on = [bool(r[3] & F_HAT_OK) for r in recs]
    if info.get("loop", True):
        a, b = info.get("loopStart", 0), info.get("loopEnd", len(recs) - 1)
        order, cyclic = list(range(a, b + 1)), True
    else:
        order, cyclic = list(range(len(recs))), False
    n = len(order)
    if all(on[i] for i in order) or not any(on[i] for i in order):
        return recs
    k = 0
    while k < n:
        if not on[order[k]]:
            k += 1
            continue
        j = k
        while j + 1 < n and on[order[j + 1]]:
            j += 1
        run = order[k:j + 1]
        left = k - 1 if k > 0 else (n - 1 if cyclic else None)
        right = j + 1 if j + 1 < n else (0 if cyclic else None)
        bounded = (left is not None and not on[order[left]]) and (right is not None and not on[order[right]])
        if bounded and sum(dur[i] for i in run) < HAT_BLINK_MS:
            for i in run:
                recs[i][3] &= ~F_HAT_OK
        k = j + 1
    return recs


# ── emote sheet (§3.5): one row per emote; cols 0 seed, 1 overshoot, 2 settle, 3-7 loop ──
EMOTE_COLS = {
    "bang": [("bang", "seed"), ("bang", "over"), ("bang", "settle"), ("bang", "lean_r"), ("bang", "lean_l")],
    "question": [("question", "seed"), ("question", "over"), ("question", "settle"), ("question", "up")],
    "bangq": [("bangq", "seed"), ("bangq", "over"), ("bangq", "settle")],
    "sweat": [("sweat2", "seed"), ("sweat2", "over"), ("sweat2", 0), ("sweat2", 0), ("sweat2", 1),
              ("sweat2", 2)],
    "hearts": [("hearts", "seed"), ("hearts", "over"), ("hearts", "settle")] + [("hearts", f) for f in range(5)],
    "anger": [("anger", "seed"), ("anger", "over"), ("anger", "small"), ("anger", "small"), ("anger", "big")],
    "bulb": [("bulb", "seed"), ("bulb", "over"), ("bulb", "A"), ("bulb", "A"), ("bulb", "B")],
    "dots": [("dots", "seed"), ("dots", 1), ("dots", 2), ("dots", 3), ("dots", 0)],
    "note": [("note", "seed"), ("note", "over"), ("note", 0), ("note", 0), ("note", 1), ("note", 2), ("note", 3)],
    "sparkle": [("sparkle", "seed"), ("sparkle", "over"), ("sparkle", "settle"), ("sparkle", "settle"),
                ("sparkle", "small")],
    # deviation: the settle column (col 2) carries rain phase 0, not the bare cloud. A bare CLOUD
    # settle fails the §3.5 contrast gate on white (13/60 px >= 3:1, needs 15); with the rain it passes.
    # The overshoot (col 1) follows §3.5 "settle drawn 1 px higher", so it is phase 0 raised ("over0");
    # B.3's rain-less "over" stays on the sad row's f1.
    "rain": [("raincloud", "seed"), ("raincloud", "over0"), ("raincloud", 0), ("raincloud", 0),
             ("raincloud", 1), ("raincloud", 2)],
    "tool-read": [("tool-read", "seed"), ("tool-read", "over"), ("tool-read", "settle")],
    "tool-edit": [("tool-edit", "seed"), ("tool-edit", "over"), ("tool-edit", "settle")],
    "tool-shell": [("tool-shell", "seed"), ("tool-shell", "over"), ("tool-shell", "settle"), ("tool-shell", "off")],
    "tool-web": [("tool-web", "seed"), ("tool-web", "over"), ("tool-web", "settle")],
    "tool-agent": [("tool-agent", "seed"), ("tool-agent", "over"), ("tool-agent", "settle")],
    "tool-git": [("tool-git", "seed"), ("tool-git", "over"), ("tool-git", "settle")],
}
EM = 24   # emote cell, logical px


def build_emotes():
    lst = CONTRACT["emotes"]["list"]
    names = sorted(lst, key=lambda n: lst[n]["row"])
    sheet = Image.new("RGBA", (COLS * EM * SCALE, len(names) * EM * SCALE), (0, 0, 0, 0))
    report = {}
    for name in names:
        info = lst[name]
        layers = [mark_pixels(m, s) for m, s in EMOTE_COLS[name]]
        xs, ys = [], []
        for pix, drop in layers:
            pts = [(x, y) for x, y, _ in pix] + (shade_of(pix) if drop else [])
            xs += [x for x, _ in pts]
            ys += [y for _, y in pts]
        xmin, xmax, ymax, ymin = min(xs), max(xs), max(ys), min(ys)
        ox = 12 - (xmin + xmax) // 2 if info["anchor"] == "top" else -xmin
        oy = (EM - 1) - ymax
        union = Image.new("RGBA", (EM, EM), (0, 0, 0, 0))
        for c, (pix, drop) in enumerate(layers):
            cell = Image.new("RGBA", (EM, EM), (0, 0, 0, 0))
            paint_mark(cell, pix, drop, ox, oy)
            union.alpha_composite(cell)
            sheet.paste(cell.resize((EM * SCALE, EM * SCALE), Image.NEAREST),
                        (c * EM * SCALE, info["row"] * EM * SCALE))
        bb = union.getbbox()
        w = bb[2] if info["anchor"] == "side" else bb[2] - bb[0]
        report[name] = {"w": w, "h": bb[3] - bb[1], "left": bb[0], "bottom": bb[3] - 1}
        assert w == info["w"], (name, w, info["w"])
        assert bb[3] - bb[1] <= 14 and bb[3] - 1 == EM - 1, (name, bb)
        if info["anchor"] == "side":
            assert bb[0] == 0, (name, bb)
    return sheet, report


# ── hat sheet (§3.6, Appendix B.4): front column bitmaps; q / side / alt are derived ──
HATS = {  # id: (ox, oy, rows)
    "party": (-3, -11, ["..OOO..", "..OOO..", "...T...", "..TTT..", "..VVV..", "..TTT..", ".TTTTT.",
                        ".VVVVV.", ".TTTTT.", "TTTTTTT", "TTTTTTT"]),
    "tophat": (-7, -9, ["..kkkkkkkkkkk.."] * 6 + ["..RRRRRRRRRRR.."] * 2 + ["KKKKKKKKKKKKKKK"]),
    "crown": (-8, -7, ["G.......G.......G", "GG.....GGG.....GG", "GGG...GGGGG...GGG", "GGGGGGGGGGGGGGGGG",
                       "GGGEGGGGHGGGGEGGG", "GGGGGGGGGGGGGGGGG", "ggggggggggggggggg"]),
    "beanie": (-12, -6, ["...........WWW...........", "...........WWW...........",
                         ".......EEEEEEEEEEE.......", ".....EEEEEEEEEEEEEEE.....",
                         "...EEEEEEEEEEEEEEEEEEE...", "..EEEEEEEEEEEEEEEEEEEEE..",
                         ".eeeeeeeeeeeeeeeeeeeeeee.", "eeeeeeeeeeeeeeeeeeeeeeeee",
                         "eeeeeeeeeeeeeeeeeeeeeeeee"]),
    "santa": (-11, -8, ["..............RRRR.....", "...........RRRRRRRR....", "........RRRRRRRRRRRR...",
                        "......RRRRRRRRRRRR.RRww", ".....RRRRRRRRRRRRR...ww", "....RRRRRRRRRRRRRR.....",
                        "...RRRRRRRRRRRRRRRR....", ".wwwwwwwwwwwwwwwwwwwww.", "wwwwwwwwwwwwwwwwwwwwwww"]),
    "wizard": (-8, -14, ["............I....", "...........II....", "..........iII....", ".........iIII....",
                         "........iIIII....", ".......iIIIII....", "......iIIYIII....", ".....iIIYYYII....",
                         ".....iIIIYIIII...", "....iIIIIIIIII...", "...iIIIIIIIIIII..", "..IIIIIIIIIIIIII.",
                         "IIIIIIIIIIIIIIIII", "IIIIIIIIIIIIIIIII"]),
    "catears": (-14, -7, [".C.........................C.", ".CC.......................CC.",
                          ".CPC.....................CPC.", ".CPPC...................CPPC.",
                          ".CPPCC.................CCPPC.", ".CCPPCC...............CCPPCC.",
                          ".CCCCCCC.............CCCCCCC."]),
    "bow": (6, -4, ["PP.....PP", "PPP.H.PPP", "PPPHHHPPP", "PPP.H.PPP", "PP.....PP"]),
    "hardhat": (-15, -6, ["..........GGGGGGGGGGG..........", "........GGGWGGGGGGGGGGG........",
                          ".......GGGGGGGGGGGGGGGGG.......", "......GGGGGGGGGGGGGGGGGGG......",
                          "......GGGGGGGGGGGGGGGGGGG......", "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
                          "ggggggggggggggggggggggggggggggg"]),
    "headband": (-20, 0, ["...................................", ".AAAAAWWWAWWWWWWWAWWWWWWWAWWWWWWWAW",
                          ".....AWWWAWWWWWWWAWWWWWWWAWWWWWWWAW", "..AAAAWWWAWWWWWWWAWWWWWWWAWWWWWWWAW",
                          "..................................."]),
    "halo": (-6, -8, [".OOOOOOOOOOO.", "O...........O", ".OOOOOOOOOOO."]),
    "shades": (-14, 0, SHADES_ROWS),
}
HEADBAND_B = [".AAA...............................", "....AAWWWAWWWWWWWAWWWWWWWAWWWWWWWAW",
              ".....AWWWAWWWWWWWAWWWWWWWAWWWWWWWAW", "....AAWWWAWWWWWWWAWWWWWWWAWWWWWWWAW",
              ".AAA..............................."]
HW, HH, HPX, HPY = 40, 32, 20, 24   # hat cell (logical) and pivot


def build_hats():
    lst = CONTRACT["hats"]["list"]
    names = sorted(lst, key=lambda n: lst[n]["row"])
    sheet = Image.new("RGBA", (4 * HW * SCALE, len(names) * HH * SCALE), (0, 0, 0, 0))
    for hid in names:
        ox, oy, rows = HATS[hid]
        bm_check(rows)
        assert max(0, -oy) == lst[hid]["height"], (hid, oy)   # meta height == -oy of B.4
        front = Image.new("RGBA", (HW, HH), (0, 0, 0, 0))
        blit(front, rows, HPX + ox, HPY + oy)
        if hid == "shades":
            for gx, gy in SHADES_GLINT[0]:
                put(front, HPX + ox + gx, HPY + oy + gy, CREAM)
        q = Image.new("RGBA", (HW, HH), (0, 0, 0, 0))
        q.paste(front, (2, 0))
        side = Image.new("RGBA", (HW, HH), (0, 0, 0, 0))
        if not lst[hid].get("hideInSide"):
            src = front.load()
            for c in range(HW):
                c2 = HPX + round((c - HPX) * 0.66) + 1
                for r in range(HH):
                    if src[c, r][3] and 0 <= c2 < HW:
                        side.putpixel((c2, r), src[c, r])
        alt = Image.new("RGBA", (HW, HH), (0, 0, 0, 0))
        if hid == "headband":
            blit(alt, bm_check(HEADBAND_B), HPX + ox, HPY + oy)
        elif hid == "halo":
            alt.paste(front, (0, -1))
        else:
            alt.paste(front, (0, 0))
        for c, im in enumerate((front, q, side, alt)):
            assert im.getbbox() is None or (im.getbbox()[0] >= 0 and im.getbbox()[2] <= HW), hid
            sheet.paste(im.resize((HW * SCALE, HH * SCALE), Image.NEAREST),
                        (c * HW * SCALE, lst[hid]["row"] * HH * SCALE))
    return sheet


# ── meta (§3.1, §3.2) ──
def build_meta(anchors, with_overlays=True):
    c = CONTRACT
    meta = {"version": c["version"], "sheet": c["sheet"], "rows": c["rows"], "aliases": c["aliases"],
            "expr": c["expr"], "shakeFrames": c["shakeFrames"], "anchorFields": c["anchorFields"],
            "flags": c["flags"], "anchors": anchors}
    if with_overlays:
        meta["emotes"] = c["emotes"]
        meta["hats"] = c["hats"]
    return meta


def meta_text(meta):
    """readable JSON: one line per row / alias / anchor row / emote / hat"""
    def dump(v):
        return json.dumps(v, separators=(",", ":"), ensure_ascii=False)

    out = ["{"]
    keys = list(meta)
    for i, k in enumerate(keys):
        v = meta[k]
        tail = "," if i < len(keys) - 1 else ""
        if k in ("rows", "aliases", "anchors"):
            out.append("  %s: {" % dump(k))
            sub = list(v)
            for j, s in enumerate(sub):
                out.append("    %s: %s%s" % (dump(s), dump(v[s]), "," if j < len(sub) - 1 else ""))
            out.append("  }" + tail)
        elif k in ("emotes", "hats"):
            out.append("  %s: {" % dump(k))
            sub = list(v)
            for j, s in enumerate(sub):
                sep = "," if j < len(sub) - 1 else ""
                if s == "list":
                    out.append("    \"list\": {")
                    ids = list(v["list"])
                    for m, e in enumerate(ids):
                        out.append("      %s: %s%s" % (dump(e), dump(v["list"][e]), "," if m < len(ids) - 1 else ""))
                    out.append("    }" + sep)
                else:
                    out.append("    %s: %s%s" % (dump(s), dump(v[s]), sep))
            out.append("  }" + tail)
        else:
            out.append("  %s: %s%s" % (dump(k), dump(v), tail))
    out.append("}")
    return "\n".join(out)


def check_rows_against_contract():
    names = [n for n, _, _ in ROWS_SPEC]
    for name, info in CONTRACT["rows"].items():
        idx = names.index(name)
        assert idx == info["row"], (name, idx, info["row"])
        n = len(ROWS_SPEC[idx][1])
        assert n == info["frames"] == len(info["frameDurations"]), (name, n)
    assert len(ROWS_SPEC) == CONTRACT["sheet"]["rows"]
    for a, info in CONTRACT["aliases"].items():
        base = ROWS_SPEC[names.index(info["of"])][1]
        assert all(0 <= i < len(base) for i in info["frameIndices"]), a
        assert len(info["frameIndices"]) == len(info["frameDurations"]), a


def main():
    args = sys.argv[1:]
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.abspath(os.path.join(here, "..", "renderer"))
    check_rows_against_contract()

    sheet = Image.new("RGBA", (COLS * CW, ROWS * CH), (0, 0, 0, 0))
    anchors = {}
    for row, (name, frames, mirror) in enumerate(ROWS_SPEC):
        recs = []
        for col, p in enumerate(frames):
            img, _anc = render(p, mirror)
            sheet.paste(img, (col * CW, row * CH))
            recs.append(frame_record(p, mirror))
        anchors[name] = deflicker_hat(name, clear_hat_frames(name, recs))
        print(f"row {row} {name}: {len(frames)} frames")

    webp_path = os.path.join(out_dir, "spritesheet.webp")
    sheet.save(webp_path, "WEBP", lossless=True)
    print("saved:", webp_path, sheet.size)

    emotes, report = build_emotes()
    emotes.save(os.path.join(out_dir, "emotes.webp"), "WEBP", lossless=True)
    print("saved:", os.path.join(out_dir, "emotes.webp"), emotes.size)
    for n, r in report.items():
        print(f"  emote {n}: w={r['w']} h={r['h']}")
    hats = build_hats()
    hats.save(os.path.join(out_dir, "hats.webp"), "WEBP", lossless=True)
    print("saved:", os.path.join(out_dir, "hats.webp"), hats.size)

    meta = build_meta(anchors)
    text = meta_text(meta)
    assert json.loads(text) == meta
    with open(os.path.join(out_dir, "clawd_meta.json"), "w", encoding="utf-8", newline="\n") as f:
        f.write(text + "\n")
    with open(os.path.join(out_dir, "clawd_meta.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write("// generated by assets/make_clawd_sprites.py -- do not edit by hand\n")
        f.write("window.CLAWD_META = " + text + ";\n")
    print("saved:", os.path.join(out_dir, "clawd_meta.js"), "+ .json")

    if "--icons" in args:          # off by default: icons are never rewritten in this build
        make_icons(here)

    preview = os.environ.get("CRAB_PREVIEW")
    if preview:
        sheet.save(preview, "PNG")
        print("preview:", preview)


if __name__ == "__main__":
    main()
