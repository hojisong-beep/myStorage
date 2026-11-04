#!/usr/bin/env python3
"""Find the ember hand (bright orange pixels) in the hero images and record
where it is, so the game can lay a live flame over the painted one.

  python3 tools/hand_anchor.py

Writes "hand": [u, v] (0..1 across the image, v measured up from the bottom)
into public/assets/props/props.json for hero_front / hero_back, and
"hand": [[u, v], ...] per frame into walk_front.json / walk_back.json.
A frame where no ember is found repeats the previous frame's anchor.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

PROPS = Path(__file__).resolve().parent.parent / "public" / "assets" / "props"


def ember(rgba):
    a = np.asarray(rgba.convert("RGBA"), dtype=np.float32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    m = (al > 128) & (r > 190) & (g > 70) & (g < 215) & (b < 110) & (r - b > 120)
    ys, xs = np.nonzero(m)
    if len(xs) < 6:
        return None
    # weight by brightness so the hot core wins over stray orange specks
    w = r[ys, xs] + g[ys, xs]
    h, wd = m.shape
    return [round(float((xs * w).sum() / w.sum()) / wd, 4), round(1 - float((ys * w).sum() / w.sum()) / h, 4), int(len(xs))]


def main():
    meta_path = PROPS / "props.json"
    meta = json.loads(meta_path.read_text())
    for name in ("hero_front", "hero_back", "hero_side"):
        e = ember(Image.open(PROPS / f"{name}.png"))
        print(name, e)
        if e:
            meta[name]["hand"] = e[:2]
    meta_path.write_text(json.dumps(dict(sorted(meta.items())), indent=1) + "\n")
    for name in ("walk_front", "walk_back", "walk_side"):
        jp = PROPS / f"{name}.json"
        sj = json.loads(jp.read_text())
        sheet = Image.open(PROPS / f"{name}.png")
        cw = sheet.width // sj["frames"]
        hands, last = [], None
        for i in range(sj["frames"]):
            e = ember(sheet.crop((i * cw, 0, (i + 1) * cw, sheet.height)))
            last = e[:2] if e else last
            hands.append(last)
        hands = [h or next(x for x in hands if x) for h in hands]
        sj["hand"] = hands
        jp.write_text(json.dumps(sj, indent=1) + "\n")
        print(name, hands)


if __name__ == "__main__":
    main()
