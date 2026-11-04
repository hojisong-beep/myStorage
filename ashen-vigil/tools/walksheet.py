#!/usr/bin/env python3
"""Turn a 'walking in place' video into a looping walk sprite sheet.

  python3 tools/walksheet.py <video id> <sheet id> [frames=12] [cell height=320]

Reads assets/raw/video/<video id>.mp4, keys the flat background out of every
frame (postprocess.key), pins each frame by its feet (bottom of the figure,
horizontal centre of the lowest band) so the figure does not jitter, finds the
walk cycle whose end matches its start best, samples <frames> frames from it
and writes public/assets/props/<sheet id>.png (one row) plus
public/assets/props/<sheet id>.json {frames, cellW, cellH, aspect, anchor}.
Prints the loop quality numbers used to accept or reject the sheet.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from postprocess import ROOT, key  # noqa: E402


def frames_of(video):
    tmp = Path(tempfile.mkdtemp())
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), str(tmp / "f%04d.png")], check=True)
    return [Image.open(p).convert("RGB") for p in sorted(tmp.glob("f*.png"))]


def foot_anchor(a):
    """(x, y) of the feet: bottom row of the figure, centre of its lowest 12%."""
    ys, xs = np.nonzero(a > 0.5)
    top, bottom = ys.min(), ys.max()
    band = ys > bottom - 0.12 * (bottom - top)
    return float(xs[band].mean()), float(bottom), float(bottom - top)


def main():
    vid, sheet_id = sys.argv[1], sys.argv[2]
    n_out = int(sys.argv[3]) if len(sys.argv) > 3 else 12
    cell_h = int(sys.argv[4]) if len(sys.argv) > 4 else 320
    frames = frames_of(ROOT / "assets" / "raw" / "video" / f"{vid}.mp4")
    keyed = []
    for im in frames:
        rgba, alpha = key(im)
        a = np.asarray(alpha, dtype=np.float32) / 255
        keyed.append((rgba, a, foot_anchor(a)))
    heights = np.array([k[2][2] for k in keyed])
    print(f"{len(frames)} frames, figure height px: median {np.median(heights):.0f}, range {heights.min():.0f}-{heights.max():.0f}")

    # Pin every frame by its feet into a common canvas (small masks for matching).
    H = int(np.median(heights) * 1.25)
    W = int(H * 0.8)
    def pinned(i, size=None):
        rgba, a, (fx, fy, _) = keyed[i]
        c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        c.paste(rgba, (int(round(W / 2 - fx)), int(round(H * 0.97 - fy))), rgba)
        return c if size is None else c.resize(size, Image.BILINEAR)
    small = np.stack([np.asarray(pinned(i, (W // 4, H // 4)), dtype=np.float32) / 255 for i in range(len(keyed))])
    lower = small[:, int(small.shape[1] * 0.55):, :, 3]           # legs: where the walk shows
    full = small[..., 3]

    # Loop search: start s, period p (frames). Cost = how different the end is
    # from the start; reject loops where the legs barely move.
    n = len(keyed)
    best = None
    for p in range(12, min(40, n // 2)):
        for s in range(0, n - p):
            close = np.abs(full[s] - full[s + p]).mean()
            motion = np.abs(lower[s:s + p] - lower[s]).mean(axis=(1, 2)).max()
            score = close / max(motion, 1e-3)
            if best is None or score < best[0]:
                best = (score, s, p, close, motion)
    score, s, p, close, motion = best
    print(f"loop: start {s}, period {p} frames ({p / 24:.2f}s at 24fps), end-start diff {close:.4f}, leg motion {motion:.4f}, ratio {score:.3f}")
    # Frame-to-frame jitter of the upper body after pinning (should be small).
    upper = full[s:s + p, : int(full.shape[1] * 0.45)]
    jitter = np.abs(np.diff(upper, axis=0)).mean()
    print(f"upper-body change per frame {jitter:.4f} (leg change per frame {np.abs(np.diff(lower[s:s + p], axis=0)).mean():.4f})")

    picks = [s + round(i * p / n_out) for i in range(n_out)]
    cells = [pinned(i) for i in picks]
    # Crop all cells to the union bbox so the sheet is tight, keep the feet anchor.
    union = None
    for c in cells:
        bb = c.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()
        union = bb if union is None else (min(union[0], bb[0]), min(union[1], bb[1]), max(union[2], bb[2]), max(union[3], bb[3]))
    # symmetric about the centre line so the anchor stays at x = 0.5
    half_w = max(W / 2 - union[0], union[2] - W / 2)
    box = (int(W / 2 - half_w), union[1], int(W / 2 + half_w), int(H * 0.97) + 2)
    cells = [c.crop(box) for c in cells]
    cw = round(cells[0].width * cell_h / cells[0].height)
    cells = [c.resize((cw, cell_h), Image.LANCZOS) for c in cells]
    # Idle pose: the frame whose feet are closest together (narrowest bottom band).
    def foot_width(c):
        a = np.asarray(c.getchannel("A"))[int(c.height * 0.88):] > 128
        cols = np.nonzero(a.any(axis=0))[0]
        return cols.max() - cols.min() if len(cols) else 0
    idle = int(np.argmin([foot_width(c) for c in cells]))
    sheet = Image.new("RGBA", (cw * n_out, cell_h), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        sheet.paste(c, (i * cw, 0))
    out_dir = ROOT / "public" / "assets" / "props"
    sheet.save(out_dir / f"{sheet_id}.png")
    feet_y = 2 / (box[3] - box[1])  # feet sit 2px above the cell bottom
    meta = {"frames": n_out, "idle": idle, "cellW": cw, "cellH": cell_h, "aspect": round(cw / cell_h, 4), "anchor": [0.5, round(feet_y, 4)],
            "source": f"assets/raw/video/{vid}.mp4", "loop": {"start": s, "period": p, "endDiff": round(float(close), 4), "legMotion": round(float(motion), 4)}}
    (out_dir / f"{sheet_id}.json").write_text(json.dumps(meta, indent=1) + "\n")
    print("wrote", out_dir / f"{sheet_id}.png", sheet.size)


if __name__ == "__main__":
    main()
