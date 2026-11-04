#!/usr/bin/env python3
"""Image-to-video with the xAI Grok video API (asynchronous: submit, then poll).

  python3 tools/gen_video.py <out id> <input image> "<prompt>" [seconds] [resolution] [model]

Saves assets/raw/video/<out id>.mp4 and prints the reported cost.
The result is also stored in the xAI Files API (expires after a day) and
downloaded from api.x.ai, because the video CDN host may not be reachable
from restricted networks.
Defaults: 4 seconds, 480p, grok-imagine-video. Uses tools/gen_assets.py for auth/TLS.
"""
import base64
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_assets as g  # noqa: E402

TICKS_PER_USD = 10_000_000_000


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    out_id, image, prompt = sys.argv[1:4]
    seconds = int(sys.argv[4]) if len(sys.argv) > 4 else 4
    res = sys.argv[5] if len(sys.argv) > 5 else "480p"
    model = sys.argv[6] if len(sys.argv) > 6 else "grok-imagine-video"
    src = g.ROOT / image
    mime = "image/png" if src.suffix == ".png" else "image/jpeg"
    body = {
        "model": model, "prompt": prompt, "duration": seconds, "resolution": res,
        "storage_options": {"filename": f"{out_id}.mp4", "expires_after": 86400},
        "image": {"url": f"data:{mime};base64," + base64.b64encode(src.read_bytes()).decode()},
    }
    t0 = time.time()
    rid = g.call("/videos/generations", body)["request_id"]
    print("request", rid, flush=True)
    (g.ROOT / "assets" / "raw" / "video").mkdir(parents=True, exist_ok=True)
    with open(g.ROOT / "assets" / "raw" / "video" / "requests.log", "a") as log:
        log.write(f"{out_id} {rid}\n")
    while True:
        time.sleep(5)
        r = g.call(f"/videos/{rid}")
        st = r.get("status")
        if st == "done":
            break
        if st not in ("pending", None) or r.get("error"):
            print("FAILED", r)
            return 1
        print(f"  {st} {r.get('progress')}% {time.time() - t0:.0f}s", flush=True)
    video = r["video"]
    out = g.ROOT / "assets" / "raw" / "video" / f"{out_id}.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    file_id = (video.get("file_output") or {}).get("file_id")
    if file_id:
        req = urllib.request.Request(f"{g.API}/files/{file_id}/content")
        key = g.os.environ.get("XAI_API_KEY")
        if key:
            req.add_header("Authorization", f"Bearer {key}")
    else:
        req = video["url"]
    with urllib.request.urlopen(req, context=g.ctx(), timeout=300) as f:
        out.write_bytes(f.read())
    cost = (r.get("usage") or {}).get("cost_in_usd_ticks")
    print(f"saved {out.relative_to(g.ROOT)} in {time.time() - t0:.0f}s, cost "
          + (f"${cost / TICKS_PER_USD:.3f}" if cost is not None else "not reported"), {k: v for k, v in r.items() if k != "video"}, "file", file_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
