# -*- coding: utf-8 -*-
"""Self-test for the QA tools: builds a MOCK renderer folder under tmp/c/mock_renderer
(43-row sheet made from recoloured/shifted old frames, meta with rough anchors, placeholder emotes,
hats from Appendix B.4) so check_contract.py and contact_sheet.py can be exercised before executor A
has produced real output. The mock is NOT a design and is never written into renderer/.

  "E:/Vibegaming playground/30_Tools/py311/python.exe" tools/qa/selftest_mock.py
  then:  CLAWD_QA_RENDERER=tmp/c/mock_renderer CLAWD_QA_OUT=tmp/c/out  python tools/qa/check_contract.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qa_common as Q  # noqa: E402
import spec_bitmaps as SB  # noqa: E402
import check_contract as CC  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

MOCK = os.path.join(Q.TMP, "c", "mock_renderer")
REAL_SHEET = os.path.join(Q.REPO, "renderer", "spritesheet.webp")


def recolour(img, tint):
    body, legs = Q.TINTS[tint]
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            p = px[x, y]
            if p[:3] == Q.CORAL:
                px[x, y] = body + (255,)
            elif p[:3] == (192, 98, 68):
                px[x, y] = legs + (255,)
    return img


def main():
    os.makedirs(MOCK, exist_ok=True)
    c = Q.load_contract()
    base = Image.open(os.path.join(Q.BASELINE if os.path.exists(Q.BASELINE) else REAL_SHEET)).convert("RGBA")
    sheet = Image.new("RGBA", (1536, 43 * Q.CH), (0, 0, 0, 0))
    sheet.paste(base.crop((0, 0, 1536, 22 * Q.CH)), (0, 0))
    tint_of = {"sad": "sad", "love": "rosy", "furious": "flush", "dangle": "pale"}
    for name, r in c["rows"].items():
        for f in range(r["frames"]):
            src = Q.cell(base, 0, f % 6).copy()
            if name == "trot":
                src = Q.cell(base, 1, f).copy()
            if name in tint_of and (name != "dangle" or f >= 4):
                src = recolour(src, tint_of[name])
            dy = -4 * (f % 3) if name in ("hop", "dance") else 0
            sheet.alpha_composite(src, (f * Q.CW, r["row"] * Q.CH + dy)) if dy == 0 else \
                sheet.paste(src.crop((0, -dy, Q.CW, Q.CH)), (f * Q.CW, r["row"] * Q.CH))
    sheet.save(os.path.join(MOCK, "spritesheet.webp"), "WEBP", lossless=True)

    # anchors: silhouette top at column 24
    anchors = {}
    for name, row, frames, _d in Q.all_rows(c):
        arr = []
        for f in range(frames):
            lg = Q.cell_logical(sheet, row, f)
            px = lg.load()
            hy = next((y for y in range(Q.LH) if px[24, y][3] > 0), 22)
            fl = Q.FLAGS["HAT_OK"] | Q.FLAGS["EMOTE_OK"] | Q.FLAGS["FACE_OK"]
            vw = CC.VIEW_EXPECT.get(name, [0] * 8)[f]
            if name in CC.HAT_OFF and f in CC.frames_set(CC.HAT_OFF[name], frames):
                fl &= ~Q.FLAGS["HAT_OK"]
            if name in CC.FACE_ON and not CC.FACE_ON[name][f]:
                fl &= ~Q.FLAGS["FACE_OK"]
            if vw:
                fl &= ~Q.FLAGS["FACE_OK"]
            if name in CC.TINTED_EXPECT and f in CC.frames_set(CC.TINTED_EXPECT[name], frames):
                fl |= Q.FLAGS["TINTED"]
            if name == "running-left":
                fl |= Q.FLAGS["MIRRORED"]
            if name in CC.MARKED_ROWS:
                fl |= Q.FLAGS["MARK_SIDE"]
            if name in CC.MARK_TOP_EXPECT and f in CC.frames_set(CC.MARK_TOP_EXPECT[name], frames):
                fl |= Q.FLAGS["MARK_TOP"]
            if name == "backflip" and 1 <= f <= 6:
                fl &= ~Q.FLAGS["HAT_OK"]
            arr.append([24, hy, hy + 4, fl, vw])
        anchors[name] = arr
    meta = {k: c[k] for k in ("version", "sheet", "rows", "aliases", "expr", "shakeFrames")}
    meta["anchors"] = anchors
    meta["emotes"] = c["emotes"]
    meta["hats"] = c["hats"]
    with open(os.path.join(MOCK, "clawd_meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f)
    with open(os.path.join(MOCK, "clawd_meta.js"), "w", encoding="utf-8") as f:
        f.write("window.CLAWD_META = " + json.dumps(meta) + ";\n")

    # emotes: a placeholder block per emote, sized w x 8, drop-shade-free
    em = Image.new("RGBA", (24 * 8, 24 * 17), (0, 0, 0, 0))
    d = ImageDraw.Draw(em)
    for name, e in c["emotes"]["list"].items():
        used = sorted(set([0, 1, 2] + e["loop"]))
        w = e["w"]
        x0 = 0 if e["anchor"] == "side" else 12 - w // 2
        for col in used:
            lift = 1 if col == 1 else 0
            y1 = 23 - lift
            d.rectangle([col * 24 + x0, e["row"] * 24 + y1 - 7, col * 24 + x0 + w - 1, e["row"] * 24 + y1],
                        fill=(70, 130, 190, 255))
            d.rectangle([col * 24 + x0 + 1, e["row"] * 24 + y1 - 5, col * 24 + x0 + w - 2, e["row"] * 24 + y1 - 3],
                        fill=(255, 245, 226, 255))
        if name != "dots":
            pass
    Q.up(em, 4).save(os.path.join(MOCK, "emotes.webp"), "WEBP", lossless=True)

    hats = Image.new("RGBA", (40 * 4, 32 * 12), (0, 0, 0, 0))
    for hid, h in c["hats"]["list"].items():
        for col, cname in ((0, "front"), (3, "alt")):
            for (x, y), rgb in SB.expected_cell(hid, cname).items():
                hats.putpixel((col * 40 + x, h["row"] * 32 + y), rgb + (255,))
                if col == 0 and x + 2 < 40:
                    hats.putpixel((40 + x + 2, h["row"] * 32 + y), rgb + (255,))
                if col == 0 and not h.get("hideInSide"):
                    xs = 20 + round((x - 20) * 0.66) + 1
                    hats.putpixel((80 + xs, h["row"] * 32 + y), rgb + (255,))
    Q.up(hats, 4).save(os.path.join(MOCK, "hats.webp"), "WEBP", lossless=True)
    print("mock written to", MOCK)


if __name__ == "__main__":
    main()
