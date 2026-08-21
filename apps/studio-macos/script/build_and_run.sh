#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="StudioTimeMachine"
BUNDLE_ID="com.pluginradar.studiotimemachine"
MIN_SYSTEM_VERSION="14.0"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_MACOS="$APP_CONTENTS/MacOS"
APP_RESOURCES="$APP_CONTENTS/Resources"
APP_BINARY="$APP_MACOS/$APP_NAME"
INFO_PLIST="$APP_CONTENTS/Info.plist"
SOURCE_ICON="$ROOT_DIR/Sources/StudioTimeMachine/Resources/Brand/StudioAppIcon1024.png"
ICONSET_DIR="$DIST_DIR/StudioTimeMachine.iconset"
APP_ICON="$APP_RESOURCES/StudioTimeMachine.icns"

case "$MODE" in
  build|--build|run|--sample|sample|--sample-live-insert|sample-live-insert|--debug|debug|--logs|logs|--telemetry|telemetry|--verify|verify)
    ;;
  *)
    echo "usage: $0 [--build|run|--sample|--sample-live-insert|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac

cd "$ROOT_DIR"
swift build --product "$APP_NAME"
BUILD_BINARY="$(swift build --show-bin-path)/$APP_NAME"

if [[ "$APP_BUNDLE" != "$ROOT_DIR/dist/$APP_NAME.app" ]]; then
  echo "Refusing to stage an unexpected app bundle path: $APP_BUNDLE" >&2
  exit 1
fi

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_MACOS" "$APP_RESOURCES"
cp "$BUILD_BINARY" "$APP_BINARY"
chmod +x "$APP_BINARY"

if [[ ! -f "$SOURCE_ICON" ]]; then
  echo "Missing app icon source: $SOURCE_ICON" >&2
  exit 1
fi
mkdir -p "$APP_RESOURCES/Brand"
cp "$ROOT_DIR/Sources/StudioTimeMachine/Resources/Brand/StudioMarkWhite.png" \
  "$APP_RESOURCES/Brand/StudioMarkWhite.png"
cp "$SOURCE_ICON" "$APP_RESOURCES/Brand/StudioAppIcon1024.png"
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"
sips -z 16 16 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$SOURCE_ICON" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
cp "$SOURCE_ICON" "$ICONSET_DIR/icon_512x512@2x.png"
iconutil -c icns "$ICONSET_DIR" -o "$APP_ICON"
rm -rf "$ICONSET_DIR"

cat >"$INFO_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>$APP_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleName</key>
  <string>Studio Time Machine</string>
  <key>CFBundleIconFile</key>
  <string>StudioTimeMachine.icns</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>$MIN_SYSTEM_VERSION</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
PLIST

plutil -lint "$INFO_PLIST" >/dev/null
codesign --force --deep --sign - "$APP_BUNDLE" >/dev/null

open_app() {
  /usr/bin/open -n "$APP_BUNDLE"
}

open_sample() {
  /usr/bin/open -n "$APP_BUNDLE" --args --sample-library
}

open_live_insert_sample() {
  /usr/bin/open -n "$APP_BUNDLE" --args --sample-live-insert
}

stop_app() {
  pkill -x "$APP_NAME" >/dev/null 2>&1 || true
}

case "$MODE" in
  build|--build)
    codesign --verify --deep --strict "$APP_BUNDLE"
    ;;
  run)
    stop_app
    open_app
    ;;
  --sample|sample)
    stop_app
    open_sample
    ;;
  --sample-live-insert|sample-live-insert)
    stop_app
    open_live_insert_sample
    ;;
  --debug|debug)
    stop_app
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    stop_app
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    stop_app
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify|verify)
    stop_app
    open_app
    sleep 2
    pgrep -x "$APP_NAME" >/dev/null
    ;;
esac
