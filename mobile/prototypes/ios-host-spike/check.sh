#!/bin/sh
# Drive spike S1 on the booted Simulator (run outside the sandbox: xcodebuild, simctl).
#   check.sh build | install
#   check.sh run <wipe|write|read|clear|timer|worlds> [-origin scheme|file] [-host hidden|alpha|detached|visible]
#                [-page <url>] [-seconds 120]      # relaunches the app, prints its log lines until DONE
#   check.sh kill                                  # SIGKILL the app: no clean exit
set -eu
cd "$(dirname "$0")"
id=dev.langle.spike.host
out="${TMPDIR:-/tmp}/langle-host-spike.log"
case "$1" in
  build)
    xcodebuild -project LangleHostSpike.xcodeproj -scheme LangleHostSpike -configuration Debug \
      -destination 'generic/platform=iOS Simulator' -derivedDataPath build -quiet build ;;
  install) xcrun simctl install booted build/Build/Products/Debug-iphonesimulator/LangleHostSpike.app ;;
  run)
    mode="$2"; shift 2
    xcrun simctl terminate booted "$id" 2>/dev/null || true
    : >"$out"
    xcrun simctl spawn booted log stream --level info --style compact \
      --predicate 'subsystem == "dev.langle.spike"' >>"$out" 2>&1 &
    stream=$!
    sleep 1
    xcrun simctl launch booted "$id" -mode "$mode" "$@" >/dev/null
    i=0
    until grep -q "DONE" "$out" || [ "$i" -ge 400 ]; do sleep 1; i=$((i + 1)); done
    kill "$stream" 2>/dev/null || true
    grep -v '^Filtering\|^Timestamp' "$out" | sed 's/^\([0-9:. -]*\).*\[dev.langle.spike:host\]/\1/' | cut -c1-1200 ;;
  kill) pkill -9 -f 'LangleHostSpike.app/LangleHostSpike' ;;
  *) echo "unknown: $1" >&2; exit 2 ;;
esac
