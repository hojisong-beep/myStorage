#!/usr/bin/env python3
"""Turn raw Grok images into game-ready icons.

  python3 tools/postprocess.py split <grid.jpg> <id1> <id2> <id3> <id4>
      Split a 2x2 grid into four raw images named by id (assets/raw/<id>.png).
  python3 tools/postprocess.py icon <raw image> <id> [size]
      Remove the dark background, crop, pad to square, resize
      (default 128px) -> public/assets/icons/<id>.png

Background removal assumes a dark, fairly even background (the prompts ask
for "plain black background"). Pixels close to the background colour become
transparent with a soft edge.
"""
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "raw"
OUT = ROOT / "public" / "assets" / "icons"


def split(grid_path, ids):
    im = Image.open(grid_path).convert("RGB")
    w, h = im.size
    boxes = [(0, 0, w // 2, h // 2), (w // 2, 0, w, h // 2), (0, h // 2, w // 2, h), (w // 2, h // 2, w, h)]
    for box, name in zip(boxes, ids):
        im.crop(box).save(RAW / f"{name}.png")
        print("wrote", RAW / f"{name}.png")


def background_level(im):
    """Brightness of the background, taken from the image border."""
    g = im.convert("L")
    w, h = g.size
    px = [g.getpixel((x, y)) for x in range(0, w, 4) for y in (0, 1, h - 2, h - 1)]
    px += [g.getpixel((x, y)) for y in range(0, h, 4) for x in (0, 1, w - 2, w - 1)]
    px.sort()
    return px[int(len(px) * 0.9)]  # upper edge of the border brightness


def icon(src, name, size=128):
    im = Image.open(src).convert("RGB")
    # Local background estimate: heavy blur of the image is dominated by the
    # dark backdrop near the edges; use a global border level plus a margin.
    bg = background_level(im)
    lum = im.convert("L")
    lo, hi = bg + 6, bg + 34  # soft ramp from transparent to opaque
    alpha = lum.point(lambda v: 0 if v <= lo else 255 if v >= hi else int((v - lo) * 255 / (hi - lo)))
    # Fill small holes inside the object, then soften the edge a little.
    alpha = alpha.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.8))
    rgba = im.copy()
    rgba.putalpha(alpha)
    bbox = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    side = int(max(rgba.size) * 1.08)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(rgba, ((side - rgba.width) // 2, (side - rgba.height) // 2))
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{name}.png"
    canvas.resize((size, size), Image.LANCZOS).save(out)
    print("wrote", out)


if __name__ == "__main__":
    if len(sys.argv) >= 7 and sys.argv[1] == "split":
        split(sys.argv[2], sys.argv[3:7])
    elif len(sys.argv) >= 4 and sys.argv[1] == "icon":
        icon(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 128)
    else:
        print(__doc__)
        sys.exit(2)
