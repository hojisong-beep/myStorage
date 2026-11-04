#!/usr/bin/env python3
"""Ask xAI Grok a question (e.g. a second-opinion code review).

Usage:
  python3 tools/ask_grok.py "질문"                    # 질문만
  python3 tools/ask_grok.py "이 코드 리뷰해줘" src/a.cpp src/b.cpp
  git diff | python3 tools/ask_grok.py "이 변경 리뷰해줘" -

Env:
  XAI_API_KEY  (required) xAI API key
  GROK_MODEL   (optional) model name, default "grok-4"
Standard library only.
"""
import json
import os
import ssl
import sys
import urllib.error
import urllib.request

API_URL = "https://api.x.ai/v1/chat/completions"
MAX_FILE_CHARS = 200_000


def build_prompt(question, paths):
    parts = [question]
    for p in paths:
        if p == "-":
            parts.append("--- stdin ---\n" + sys.stdin.read()[:MAX_FILE_CHARS])
        else:
            with open(p, encoding="utf-8", errors="replace") as f:
                parts.append(f"--- {p} ---\n" + f.read()[:MAX_FILE_CHARS])
    return "\n\n".join(parts)


def ssl_context():
    ctx = ssl.create_default_context()
    bundle = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
    if os.path.exists(bundle):
        ctx.load_verify_locations(bundle)
    return ctx


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    key = os.environ.get("XAI_API_KEY")
    if not key:
        print("XAI_API_KEY is not set.", file=sys.stderr)
        return 2
    body = {
        "model": os.environ.get("GROK_MODEL", "grok-4"),
        "messages": [
            {"role": "system", "content": "You are a senior engineer giving a concise, concrete second opinion."},
            {"role": "user", "content": build_prompt(sys.argv[1], sys.argv[2:])},
        ],
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, context=ssl_context(), timeout=300) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode(errors='replace')}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"Connection failed: {e.reason}", file=sys.stderr)
        return 1
    print(data["choices"][0]["message"]["content"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
