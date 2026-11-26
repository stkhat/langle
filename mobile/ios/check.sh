#!/bin/sh
# Drives the iOS app on the booted Simulator (run outside Claude Code's sandbox).
#
#   check.sh build                  xcodebuild into mobile/ios/build (stage a build first:
#                                   scripts/bundle-build.sh [check]; the ad-blocking library:
#                                   npm run mobile:adblock -- ios)
#   check.sh install                installs the built app on the booted Simulator
#   check.sh launch [args…]         relaunches the app; args: -url <url>, -reset 1 (a first run)
#   check.sh cmd <name>             errors | clear-errors | state | translate-state | adblock |
#                                   adblock-update, or a native
#                                   control: home | words | settings | back-home | edge-back |
#                                   langle | close-sheet | more (⋮) | more-ads (⋮'s "Block ads
#                                   on this site"); the result goes to the log
#   check.sh js <target> <js|@file>  runs <js> (an async function body) in host | page | langle |
#                                   sheet | first (the first run) | tab (the shown tab's page)
#   check.sh fullscreen             the page's fullscreen, the screen and a test element in the
#                                   player (mobile/check/fullscreen.js), then the shell's state
#   check.sh log [seconds]          the app's log for the last <seconds> (default 60)
#   check.sh kill                   terminates the app
#   check.sh screenshot <file.png>  saves a screenshot of the Simulator
#
# Commands reach the app as Darwin notifications (DEBUG builds only, CheckCommands.swift);
# results are in the unified log, subsystem dev.langle.app, category "check".
set -eu

here=$(cd "$(dirname "$0")" && pwd)
bundle=dev.langle.app
app="$here/build/Build/Products/Debug-iphonesimulator/Langle.app"

case "${1:-}" in
build)
  # Xcode's own error names the missing framework but not how to make it.
  if [ ! -f "$here/../adblock/build/ios/LangleAdblock.xcframework/Info.plist" ]; then
    echo "error: no mobile/adblock/build/ios/LangleAdblock.xcframework; run npm run mobile:adblock -- ios" >&2
    exit 1
  fi
  xcodebuild -project "$here/Langle.xcodeproj" -scheme Langle -configuration Debug \
    -destination 'generic/platform=iOS Simulator' -derivedDataPath "$here/build" -quiet build
  ;;
install)
  xcrun simctl install booted "$app"
  ;;
launch)
  shift
  xcrun simctl terminate booted "$bundle" 2>/dev/null || true
  xcrun simctl launch booted "$bundle" "$@"
  ;;
cmd)
  xcrun simctl spawn booted notifyutil -p "$bundle.${2:?usage: check.sh cmd <name>}"
  ;;
js)
  target="${2:?usage: check.sh js <target> <js>}"
  source="${3:?usage: check.sh js <target> <js>}"
  # @file: the script is in that file.
  case "$source" in @*) source=$(cat "${source#@}") ;; esac
  data=$(xcrun simctl get_app_container booted "$bundle" data)
  mkdir -p "$data/Documents"
  node -e 'process.stdout.write(JSON.stringify({target: process.argv[1], source: process.argv[2]}))' \
    "$target" "$source" >"$data/Documents/eval.json"
  xcrun simctl spawn booted notifyutil -p "$bundle.eval"
  ;;
fullscreen)
  # The probe is a function; the script calls it. Then the shell's state, and both results.
  probe=$(cat "$here/../check/fullscreen.js")
  sh "$0" js langle "$probe
return fullscreenProbe();"
  sleep 1
  xcrun simctl spawn booted notifyutil -p "$bundle.state"
  sleep 1
  xcrun simctl spawn booted log show --info --style compact --last 10s \
    --predicate "subsystem == \"$bundle\" && category == \"check\"" | grep -o "check] .*"
  ;;
log)
  xcrun simctl spawn booted log show --info --debug --style compact --last "${2:-60}s" \
    --predicate "subsystem == \"$bundle\""
  ;;
kill)
  xcrun simctl terminate booted "$bundle"
  ;;
screenshot)
  xcrun simctl io booted screenshot "${2:?usage: check.sh screenshot <file.png>}"
  ;;
*)
  sed -n '2,17p' "$0"
  exit 2
  ;;
esac
