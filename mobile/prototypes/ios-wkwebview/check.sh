#!/bin/sh
# Drive the WKWebView prototype on the booted simulator (run outside the sandbox: simctl).
#   check.sh install <path/to/LangleProbe.app>
#   check.sh open <url> [extra launch args, e.g. -ua safari -block off]   # relaunches the app
#   check.sh cmd <variants|captions|captionsJa|state|measure>
#   check.sh log [seconds]   # probe log lines since the last open
set -eu
id=dev.langle.probe.wk
out="${TMPDIR:-/tmp}/langle-probe-ios.log"
case "$1" in
  install) xcrun simctl install booted "$2" ;;
  open)
    url="$2"; shift 2
    xcrun simctl terminate booted "$id" 2>/dev/null || true
    pkill -f "log stream.*dev.langle.probe" 2>/dev/null || true
    : >"$out"
    xcrun simctl spawn booted log stream --level info --style compact \
      --predicate 'subsystem == "dev.langle.probe"' >>"$out" 2>&1 &
    sleep 1
    xcrun simctl launch booted "$id" -url "$url" "$@" >/dev/null
    echo "log: $out" ;;
  cmd) xcrun simctl spawn booted notifyutil -p "dev.langle.probe.$2" ;;
  translate)
    # A fresh launch on a video, the English track, then the player's own Japanese translation;
    # prints each timedtext response size and the parameters of its request.
    shift; "$0" open "https://m.youtube.com/watch?v=iG9CE55wbtY" "$@" >/dev/null
    n() { grep -c '"type":"timedtext"' "$out" || true; }
    until [ "$(n)" -ge 1 ]; do sleep 2; done; "$0" cmd captions
    until [ "$(n)" -ge 2 ]; do sleep 2; done; "$0" cmd captionsJa
    until [ "$(n)" -ge 3 ]; do sleep 2; done; "$0" cmd urls
    until grep -q "cmd urls" "$out"; do sleep 1; done
    grep '"type":"timedtext"' "$out" | grep -o '"bytes":[0-9]*' | tr '\n' ' '; echo
    grep "cmd urls" "$out" | sed 's/.*cmd urls //' | tr ',' '\n' ;;
  log) sleep "${2:-0}"; grep -v '^Filtering\|^Timestamp' "$out" | cut -c1-600 ;;
  *) echo "unknown: $1" >&2; exit 2 ;;
esac
