# -*- coding: utf-8 -*-
"""Appendix B.4 hat bitmaps (front column) and the palette letters they use, copied from the spec
(_work/anim_plan_20260926.md). check_contract.py compares hats.webp against these pixel by pixel."""

PAL = {
    "O": (232, 170, 56),    # OCHRE
    "T": (226, 122, 146),   # TONGUE / party rose
    "V": (123, 92, 168),    # VIOLET
    "k": (52, 50, 60),      # LAPTOP_DK
    "R": (200, 50, 60),     # SANTA_RED
    "K": (26, 20, 18),      # INK
    "G": (242, 197, 61),    # GOLD
    "g": (217, 169, 46),    # GOLD_SH
    "E": (58, 156, 152),    # TEAL
    "e": (47, 125, 122),    # TEAL_DK
    "H": (226, 71, 110),    # HEART
    "W": (255, 245, 226),   # CREAM
    "w": (248, 248, 250),   # CAP_WHITE
    "I": (47, 60, 122),     # INDIGO
    "i": (70, 86, 160),     # INDIGO_LT
    "Y": (255, 217, 90),    # POLLEN
    "C": (217, 119, 87),    # CORAL
    "P": (242, 140, 177),   # PETAL
    "A": (216, 57, 78),     # ANGER
    "N": (42, 39, 64),      # SHADE
}

HEADBAND_A = [
    "...................................",
    ".AAAAAWWWAWWWWWWWAWWWWWWWAWWWWWWWAW",
    ".....AWWWAWWWWWWWAWWWWWWWAWWWWWWWAW",
    "..AAAAWWWAWWWWWWWAWWWWWWWAWWWWWWWAW",
    "...................................",
]
HEADBAND_B = [
    ".AAA...............................",
    "....AAWWWAWWWWWWWAWWWWWWWAWWWWWWWAW",
    ".....AWWWAWWWWWWWAWWWWWWWAWWWWWWWAW",
    "....AAWWWAWWWWWWWAWWWWWWWAWWWWWWWAW",
    ".AAA...............................",
]

SHADES = [
    "NNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
    "...NNNNNNN.......NNNNNNN.....",
    "...NNNNNNN.......NNNNNNN.....",
    "....NNNNN.........NNNNN......",
]
# glint 0 baked into the hat-layer version: CREAM at (5,0) and (4,1)
SHADES_G0 = [r for r in SHADES]
SHADES_G0[0] = SHADES_G0[0][:5] + "W" + SHADES_G0[0][6:]
SHADES_G0[1] = SHADES_G0[1][:4] + "W" + SHADES_G0[1][5:]

# id -> (ox, oy, front bitmap)
HATS = {
    "party": (-3, -11, [
        "..OOO..", "..OOO..", "...T...", "..TTT..", "..VVV..", "..TTT..",
        ".TTTTT.", ".VVVVV.", ".TTTTT.", "TTTTTTT", "TTTTTTT"]),
    "tophat": (-7, -9, ["..kkkkkkkkkkk.."] * 6 + ["..RRRRRRRRRRR.."] * 2 + ["KKKKKKKKKKKKKKK"]),
    "crown": (-8, -7, [
        "G.......G.......G",
        "GG.....GGG.....GG",
        "GGG...GGGGG...GGG",
        "GGGGGGGGGGGGGGGGG",
        "GGGEGGGGHGGGGEGGG",
        "GGGGGGGGGGGGGGGGG",
        "ggggggggggggggggg"]),
    "beanie": (-12, -6, [
        "...........WWW...........",
        "...........WWW...........",
        ".......EEEEEEEEEEE.......",
        ".....EEEEEEEEEEEEEEE.....",
        "...EEEEEEEEEEEEEEEEEEE...",
        "..EEEEEEEEEEEEEEEEEEEEE..",
        ".eeeeeeeeeeeeeeeeeeeeeee.",
        "eeeeeeeeeeeeeeeeeeeeeeeee",
        "eeeeeeeeeeeeeeeeeeeeeeeee"]),
    "santa": (-11, -8, [
        "..............RRRR.....",
        "...........RRRRRRRR....",
        "........RRRRRRRRRRRR...",
        "......RRRRRRRRRRRR.RRww",
        ".....RRRRRRRRRRRRR...ww",
        "....RRRRRRRRRRRRRR.....",
        "...RRRRRRRRRRRRRRRR....",
        ".wwwwwwwwwwwwwwwwwwwww.",
        "wwwwwwwwwwwwwwwwwwwwwww"]),
    "wizard": (-8, -14, [
        "............I....",
        "...........II....",
        "..........iII....",
        ".........iIII....",
        "........iIIII....",
        ".......iIIIII....",
        "......iIIYIII....",
        ".....iIIYYYII....",
        ".....iIIIYIIII...",
        "....iIIIIIIIII...",
        "...iIIIIIIIIIII..",
        "..IIIIIIIIIIIIII.",
        "IIIIIIIIIIIIIIIII",
        "IIIIIIIIIIIIIIIII"]),
    "catears": (-14, -7, [
        ".C.........................C.",
        ".CC.......................CC.",
        ".CPC.....................CPC.",
        ".CPPC...................CPPC.",
        ".CPPCC.................CCPPC.",
        ".CCPPCC...............CCPPCC.",
        ".CCCCCCC.............CCCCCCC."]),
    "bow": (6, -4, ["PP.....PP", "PPP.H.PPP", "PPPHHHPPP", "PPP.H.PPP", "PP.....PP"]),
    "hardhat": (-15, -6, [
        "..........GGGGGGGGGGG..........",
        "........GGGWGGGGGGGGGGG........",
        ".......GGGGGGGGGGGGGGGGG.......",
        "......GGGGGGGGGGGGGGGGGGG......",
        "......GGGGGGGGGGGGGGGGGGG......",
        "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG",
        "ggggggggggggggggggggggggggggggg"]),
    "headband": (-20, 0, HEADBAND_A),
    "halo": (-6, -8, [".OOOOOOOOOOO.", "O...........O", ".OOOOOOOOOOO."]),
    "shades": (-14, 0, SHADES_G0),
}

HAT_ALT = {
    "headband": (-20, 0, HEADBAND_B),
    "halo": (-6, -9, HATS["halo"][2]),
}

PIVOT = (20, 24)


def expected_cell(hid, col="front", w=40, h=32):
    """{(x, y): rgb} expected in the logical 40x32 hat cell for the front (or alt) column."""
    ox, oy, bm = (HAT_ALT.get(hid) if col == "alt" and hid in HAT_ALT else HATS[hid])
    out = {}
    for r, line in enumerate(bm):
        for c, ch in enumerate(line):
            if ch == ".":
                continue
            x, y = PIVOT[0] + ox + c, PIVOT[1] + oy + r
            if 0 <= x < w and 0 <= y < h:
                out[(x, y)] = PAL[ch]
    return out
