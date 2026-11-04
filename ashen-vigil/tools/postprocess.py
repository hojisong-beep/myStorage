#!/usr/bin/env python3
"""Turn raw Grok images into game-ready icons.

  python3 tools/postprocess.py split <grid.jpg> <id1> <id2> <id3> <id4>
      Split a 2x2 grid into four raw images named by id (assets/raw/<id>.png).
  python3 tools/postprocess.py icon <raw image> <id> [size]
      Remove the dark background, crop, pad to square, resize
      (default 128px) -> public/assets/icons/<id>.png
  python3 tools/postprocess.py skill <raw image> <id> [size]
      Cut away a flat border / rounded frame the model drew around the art,
      crop to a square and resize -> public/assets/icons/<id>.png
  python3 tools/postprocess.py prop <raw image> <id> [max width]
      Cut a world prop out of its flat background (black or grey; the colour
      is read from the border) (only background connected
      to the image border is removed, so dark stone inside stays opaque),
      remove the dark fringe, crop, scale to at most 384px wide ->
      public/assets/props/<id>.png; size and anchor go to props/props.json.
  python3 tools/postprocess.py texture <raw image> <id> [size]
      Make the image wrap without seams (blend with a half-offset copy near
      the edges), resize (default 512px) -> public/assets/textures/<id>.jpg

  python3 tools/postprocess.py normal <texture id> [strength]
      Build a tangent-space normal map from a texture's brightness
      (wraps at the edges, so seamless textures stay seamless)
      -> public/assets/textures/<id>_n.png

Background removal assumes a dark, fairly even background (the prompts ask
for "plain black background"). Pixels close to the background colour become
transparent with a soft edge.
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

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


def frame_bbox(im):
    """Box of the picture inside a flat border (the border colour is read from the corners)."""
    g = im.convert("L")
    w, h = g.size
    corners = [g.getpixel((x, y)) for x in (2, w - 3) for y in (2, h - 3)]
    bg = sorted(corners)[1]
    diff = g.point(lambda v: 1 if abs(v - bg) > 8 else 0)
    # Walk in from each side along the middle half of the edge; the frame
    # ends at the first line where most of that band differs from the border.
    def edge(n, frac_at):
        for i in range(n // 3):
            if frac_at(i) > 0.5:
                return i
        return 0
    def col_frac(x):
        return sum(diff.getpixel((x, y)) for y in range(h // 4, 3 * h // 4, 2)) / (h // 4)
    def row_frac(y):
        return sum(diff.getpixel((x, y)) for x in range(w // 4, 3 * w // 4, 2)) / (w // 4)
    x0 = edge(w, col_frac)
    x1 = w - edge(w, lambda i: col_frac(w - 1 - i))
    y0 = edge(h, row_frac)
    y1 = h - edge(h, lambda i: row_frac(h - 1 - i))
    return x0, y0, x1, y1


def skill(src, name, size=128):
    im = Image.open(src).convert("RGB")
    x0, y0, x1, y1 = frame_bbox(im)
    # Step inside the rounded corners of the frame.
    inset = int(0.06 * min(x1 - x0, y1 - y0))
    x0, y0, x1, y1 = x0 + inset, y0 + inset, x1 - inset, y1 - inset
    side = min(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{name}.png"
    im.crop(box).resize((size, size), Image.LANCZOS).save(out)
    print("wrote", out, "crop", box)


def key(im):
    """Key a flat background (colour read from the border) out of an RGB
    image. Returns (RGBA image, alpha image). See prop()."""
    import numpy as np
    from PIL import ImageDraw

    rgb = np.asarray(im, dtype=np.float32)
    # Background colour = median of the border pixels; works for the black
    # backgrounds and for a flat grey one (keying dark objects, which would
    # vanish into black). Distance = largest per-channel difference from it.
    border = np.concatenate([rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3), rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)])
    bg_rgb = np.median(border, axis=0)
    dist = np.abs(rgb - bg_rgb).max(axis=2)
    noise = float(np.percentile(np.abs(border - bg_rgb).max(axis=1), 95))
    # A tight band above the background's own noise; a wide one leaks into
    # the object through shadowed paths.
    lo, hi = noise + 3, noise + 14
    lum = dist
    # Background candidates, flood-filled from the border. Very dark parts of
    # the object (shadowed carving, wood grain) can touch the background
    # through thin gaps, so the object mask is first closed (gaps up to
    # ~2*r px sealed), filled, and the fill is then grown back r px into
    # background-dark pixels so the outline itself stays tight.
    r = 6
    obj = Image.fromarray(((lum > hi) * 255).astype(np.uint8))
    sealed = obj.filter(ImageFilter.MaxFilter(2 * r + 1)).filter(ImageFilter.MinFilter(2 * r + 1))
    cand = Image.fromarray(np.pad(255 - np.asarray(sealed), 1, constant_values=255)).copy()  # floodfill needs its own buffer
    ImageDraw.floodfill(cand, (0, 0), 128)
    outside = Image.fromarray(((np.asarray(cand)[1:-1, 1:-1] == 128) * 255).astype(np.uint8))
    grown = np.asarray(outside.filter(ImageFilter.MaxFilter(2 * r + 1))) > 0
    outside = (np.asarray(outside) > 0) | (grown & (lum <= hi))
    ramp = np.clip((lum - lo) / (hi - lo), 0, 1)
    a = np.where(outside, ramp, 1.0)
    alpha = Image.fromarray((a * 255).astype(np.uint8))
    # Pull the edge in by a pixel and soften it, which drops the dark halo.
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    a = np.asarray(alpha, dtype=np.float32) / 255
    rgb = np.asarray(im, dtype=np.float32)
    rgba = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA")
    return rgba, alpha


def prop(src, name, max_w=384):
    import json

    im = Image.open(src).convert("RGB")
    rgba, alpha = key(im)
    bbox = alpha.point(lambda v: 255 if v > 16 else 0).getbbox()
    rgba = rgba.crop(bbox)
    if rgba.width > max_w:
        rgba = rgba.resize((max_w, round(rgba.height * max_w / rgba.width)), Image.LANCZOS)
    out_dir = ROOT / "public" / "assets" / "props"
    out_dir.mkdir(parents=True, exist_ok=True)
    rgba.save(out_dir / f"{name}.png")
    meta_path = out_dir / "props.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    # Anchor: bottom centre of the image sits on the ground.
    meta[name] = {"w": rgba.width, "h": rgba.height, "aspect": round(rgba.width / rgba.height, 4), "anchor": [0.5, 0.0]}
    meta_path.write_text(json.dumps(dict(sorted(meta.items())), indent=1) + "\n")
    print("wrote", out_dir / f"{name}.png", rgba.size)


def repeat_crop(im):
    """If the model painted the pattern twice across (a common habit), return
    one period cut along a dark mortar line, which wraps by itself; else None."""
    import numpy as np

    a = np.asarray(im.convert("L"), dtype=np.float32)
    h, w = a.shape
    def period(axis):
        n = a.shape[axis]
        errs = {}
        for p in range(int(n * 0.45), int(n * 0.55)):
            errs[p] = np.abs(a[: n - p] - a[p:]).mean() if axis == 0 else np.abs(a[:, : n - p] - a[:, p:]).mean()
        best = min(errs, key=errs.get)
        base = np.abs(a[: n - n // 30] - a[n // 30:]).mean() if axis == 0 else np.abs(a[:, : n - n // 30] - a[:, n // 30:]).mean()
        return best, errs[best] / base
    py, ry = period(0)
    px, rx = period(1)
    if max(ry, rx) > 0.6:
        return None
    rows, cols = a.mean(1), a.mean(0)
    y0 = int(np.argmin(rows[h // 5: h // 5 + py // 3])) + h // 5
    x0 = int(np.argmin(cols[w // 5: w // 5 + px // 3])) + w // 5
    return im.crop((x0, y0, x0 + px, y0 + py))


def texture(src, name, size=512):
    im = Image.open(src).convert("RGB")
    out_dir = ROOT / "public" / "assets" / "textures"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{name}.jpg"
    tile = repeat_crop(im)
    if tile is not None:
        tile.resize((size, size), Image.LANCZOS).save(out, quality=88)
        print("wrote", out, "(one repeat period, cut on a mortar line)")
        return
    im = im.resize((size, size), Image.LANCZOS)
    shifted = ImageChops.offset(im, size // 2, size // 2)  # its edges are the original's centre
    # Weight: 255 in the middle, falling to 0 at the edges, so the result's
    # edges come from the shifted copy and wrap continuously.
    ramp = [min(255, int(255 * min(i, size - 1 - i) / (size * 0.25))) for i in range(size)]
    wx = Image.new("L", (size, 1)); wx.putdata(ramp)
    wy = Image.new("L", (1, size)); wy.putdata(ramp)
    mask = ImageChops.multiply(wx.resize((size, size)), wy.resize((size, size)))
    Image.composite(im, shifted, mask).save(out, quality=88)
    print("wrote", out)


def normal(name, strength=3.0):
    import numpy as np

    src = ROOT / "public" / "assets" / "textures" / f"{name}.jpg"
    im = Image.open(src).convert("L").filter(ImageFilter.GaussianBlur(1.2))
    h = np.asarray(im, dtype=np.float32) / 255.0
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5  # image y points down
    n = np.stack([-dx * strength, dy * strength, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    out = src.with_name(f"{name}_n.png")
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(out)
    print("wrote", out)


if __name__ == "__main__":
    if len(sys.argv) >= 7 and sys.argv[1] == "split":
        split(sys.argv[2], sys.argv[3:7])
    elif len(sys.argv) >= 4 and sys.argv[1] == "icon":
        icon(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 128)
    elif len(sys.argv) >= 4 and sys.argv[1] == "prop":
        prop(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 384)
    elif len(sys.argv) >= 4 and sys.argv[1] == "texture":
        texture(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 512)
    elif len(sys.argv) >= 3 and sys.argv[1] == "normal":
        normal(sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 3.0)
    elif len(sys.argv) >= 4 and sys.argv[1] == "skill":
        skill(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 128)
    else:
        print(__doc__)
        sys.exit(2)
