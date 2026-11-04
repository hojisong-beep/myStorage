#!/usr/bin/env python3
"""Generate game images with the xAI Grok image API from a spec file.

  python3 tools/gen_assets.py --list-models
  python3 tools/gen_assets.py assets/specs/m0.json            # every item without a raw file yet
  python3 tools/gen_assets.py assets/specs/m0.json icon_sword  # only these ids (regenerates)

Spec file (JSON):
  {
    "style": "shared style words appended to every prompt",
    "kinds": {"icon": "extra words for icons", ...},
    "items": [{"id": "icon_sword", "kind": "icon", "prompt": "A worn longsword ..."}, ...]
  }

Each result is saved as assets/raw/<id>.png. Items of kind "icon", "skill", "texture" and "prop" are then
passed through tools/postprocess.py (icons: background removal / frame crop, 128px;
textures: seam blending, 512px).

Env: XAI_API_KEY (optional if a host secret for api.x.ai is set), GROK_IMAGE_MODEL (default grok-imagine-image).
Standard library + Pillow only.
"""
import base64
import io
import json
import os
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "raw"
API = "https://api.x.ai/v1"


def ctx():
    c = ssl.create_default_context()
    bundle = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
    if os.path.exists(bundle):
        c.load_verify_locations(bundle)
    return c


def call(path, body=None):
    # The key comes from XAI_API_KEY if set. Otherwise no Authorization header
    # is sent and the environment's host-scoped secret for api.x.ai supplies it.
    headers = {"Content-Type": "application/json"}
    key = os.environ.get("XAI_API_KEY")
    if key:
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req, context=ctx(), timeout=300) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode(errors='replace')[:800]}")


def fetch_image(entry):
    if entry.get("b64_json"):
        return base64.b64decode(entry["b64_json"])
    url = entry.get("url")
    if not url:
        raise RuntimeError(f"no image in response: {list(entry)}")
    with urllib.request.urlopen(url, context=ctx(), timeout=120) as r:
        return r.read()


def generate(prompt, model):
    body = {"model": model, "prompt": prompt, "n": 1, "response_format": "b64_json"}
    try:
        data = call("/images/generations", body)
    except RuntimeError as e:
        if "response_format" not in str(e):
            raise
        body.pop("response_format")  # fall back to URL output
        data = call("/images/generations", body)
    return fetch_image(data["data"][0])


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    if args[0] == "--list-models":
        for path in ("/image-generation-models", "/models"):
            try:
                print(path, json.dumps(call(path), indent=1)[:3000])
            except RuntimeError as e:
                print(path, e)
        return 0
    spec = json.loads(Path(args[0]).read_text(encoding="utf-8"))
    only = set(args[1:])
    model = os.environ.get("GROK_IMAGE_MODEL", "grok-imagine-image")
    RAW.mkdir(parents=True, exist_ok=True)
    failed = 0
    for item in spec["items"]:
        iid = item["id"]
        out = RAW / f"{iid}.png"
        if only and iid not in only:
            continue
        if not only and out.exists():
            continue
        prompt = ", ".join(p for p in (item["prompt"], spec.get("kinds", {}).get(item.get("kind", ""), ""), spec.get("style", "")) if p)
        print(f"[{iid}] generating ...", flush=True)
        try:
            Image.open(io.BytesIO(generate(prompt, model))).convert("RGB").save(out)
        except Exception as e:  # keep going with the rest of the batch
            failed += 1
            print(f"[{iid}] FAILED: {e}")
            continue
        print(f"[{iid}] saved {out.relative_to(ROOT)}")
        if item.get("kind") in ("icon", "skill", "texture", "prop"):
            subprocess.run([sys.executable, str(ROOT / "tools" / "postprocess.py"), item["kind"], str(out), iid], check=True)
        if item.get("kind") == "texture":  # normal map from the processed texture
            subprocess.run([sys.executable, str(ROOT / "tools" / "postprocess.py"), "normal", iid], check=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
