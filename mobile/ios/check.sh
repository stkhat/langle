#!/bin/sh
# Drives the iOS app on the booted Simulator (run outside Claude Code's sandbox).
#
#   check.sh build                  xcodebuild into mobile/ios/build (stage a build first:
#                                   scripts/bundle-build.sh [check])
#   check.sh install                installs the built app on the booted Simulator
#   check.sh launch [args…]         relaunches the app; args: -url <url>, -reset 1 (a first run)
#   check.sh cmd <name>             errors | clear-errors | state: the result goes to the log
#   check.sh eval <target> <js>     runs <js> (an async function body) in host | page | langle | sheet
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
eval)
  target="${2:?usage: check.sh eval <target> <js>}"
  source="${3:?usage: check.sh eval <target> <js>}"
  data=$(xcrun simctl get_app_container booted "$bundle" data)
  mkdir -p "$data/Documents"
  node -e 'process.stdout.write(JSON.stringify({target: process.argv[1], source: process.argv[2]}))' \
    "$target" "$source" >"$data/Documents/eval.json"
  xcrun simctl spawn booted notifyutil -p "$bundle.eval"
  ;;
log)
  xcrun simctl spawn booted log show --style compact --last "${2:-60}s" \
    --predicate "subsystem == \"$bundle\""
  ;;
kill)
  xcrun simctl terminate booted "$bundle"
  ;;
screenshot)
  xcrun simctl io booted screenshot "${2:?usage: check.sh screenshot <file.png>}"
  ;;
*)
  sed -n '2,15p' "$0"
  exit 2
  ;;
esac
