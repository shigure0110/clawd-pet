# -*- coding: utf-8 -*-
"""Labelled grid of PNG captures (used by shot.ps1 and dev/scenarios.sh).

  python tools/qa/montage.py <png dir> <out.png> [--cols 6] [--scale 1] [--title "..."] [--labels labels.tsv]

Images are placed in file-name order on a light checker (so transparent areas show). labels.tsv
(optional) maps "<file name>\t<caption>"; otherwise the file name is the caption.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qa_common as Q  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--title", default="")
    ap.add_argument("--labels", default="")
    a = ap.parse_args()
    files = sorted(f for f in os.listdir(a.src) if f.lower().endswith(".png") and os.path.join(a.src, f) != os.path.abspath(a.out))
    if not files:
        print("montage: no PNGs in %s" % a.src)
        return 1
    labels = {}
    if a.labels and os.path.exists(a.labels):
        with open(a.labels, encoding="utf-8-sig") as f:
            for line in f:
                if "\t" in line:
                    k, v = line.rstrip("\n").split("\t", 1)
                    labels[k] = v
    imgs = []
    for f in files:
        try:
            im = Image.open(os.path.join(a.src, f)).convert("RGBA")
        except Exception as e:  # noqa: BLE001
            print("montage: skip %s (%s)" % (f, e))
            continue
        if a.scale != 1.0:
            im = im.resize((int(im.width * a.scale), int(im.height * a.scale)), Image.NEAREST)
        imgs.append((f, im))
    tw = max(i.width for _, i in imgs)
    th = max(i.height for _, i in imgs)
    cols = max(1, min(a.cols, len(imgs)))
    rows = (len(imgs) + cols - 1) // cols
    cap = 30
    top = 30 if a.title else 6
    out = Image.new("RGBA", (cols * (tw + 8) + 8, top + rows * (th + cap + 8)), (250, 250, 248, 255))
    d = ImageDraw.Draw(out)
    if a.title:
        Q.text(d, (8, 6), a.title, size=14)
    for i, (f, im) in enumerate(imgs):
        x = 8 + (i % cols) * (tw + 8)
        y = top + (i // cols) * (th + cap + 8)
        out.alpha_composite(Q.checker(im.width, im.height, sq=10), (x, y))
        out.alpha_composite(im, (x, y))
        d.rectangle([x - 1, y - 1, x + im.width, y + im.height], outline=(170, 170, 180, 255))
        lab = labels.get(f, os.path.splitext(f)[0])
        Q.text(d, (x, y + im.height + 2), lab[:60], size=10)
        if len(lab) > 60:
            Q.text(d, (x, y + im.height + 14), lab[60:120], size=10)
    Q.ensure_dir(os.path.dirname(os.path.abspath(a.out)))
    out.save(a.out)
    print("montage: %d images -> %s" % (len(imgs), a.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
