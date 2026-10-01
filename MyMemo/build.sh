#!/bin/bash
# MyMemo.app 빌드 스크립트: ./build.sh  →  build/MyMemo.app
set -euo pipefail
cd "$(dirname "$0")"
swift build -c release
BIN="$(swift build -c release --show-bin-path)/MyMemo"
APP=build/MyMemo.app
rm -rf "$APP" build/MyMemo.iconset
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/MyMemo"
cp "$(dirname "$BIN")/MyMemoMCP" "$APP/Contents/MacOS/MyMemoMCP"
cp Resources/Info.plist "$APP/Contents/Info.plist"
swift scripts/make_icon.swift build/MyMemo.iconset
iconutil -c icns build/MyMemo.iconset -o "$APP/Contents/Resources/AppIcon.icns"
codesign --force --sign - "$APP"
echo "완료: $(pwd)/$APP"
