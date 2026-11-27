#!/bin/sh
# Drive spike M8b-0 on the booted Simulator (run outside the sandbox: xcodebuild, simctl).
#   check.sh build | install | launch | kill
#   check.sh mode <both|ctx|chain|chain-late|none>   the extension's mode (mode.txt in the group)
#   check.sh log                                     log.txt from the group container (both processes)
#   check.sh clear                                   empties log.txt, removes shared.json
#   check.sh group                                   prints the group container's path and files
#   check.sh syslog [seconds]                        the unified log, subsystem dev.langle.spike
#   check.sh sign                                    the entitlements in the built app and extension
set -eu
cd "$(dirname "$0")"
id=dev.langle.spike.share
group=group.dev.langle.spike.share
app=build/Build/Products/Debug-iphonesimulator/ShareSpike.app
dir() { xcrun simctl get_app_container booted "$id" "$group"; }
case "$1" in
  build)
    xcodebuild -project ShareSpike.xcodeproj -scheme ShareSpike -configuration Debug \
      -destination 'generic/platform=iOS Simulator' -derivedDataPath build -quiet build ;;
  install) xcrun simctl install booted "$app" ;;
  launch) xcrun simctl launch booted "$id" ;;
  kill) xcrun simctl terminate booted "$id" 2>/dev/null || true ;;
  mode) printf '%s\n' "$2" >"$(dir)/mode.txt"; echo "mode=$2" ;;
  prep)  # prep <mode> [cold]: set the mode, clear the log; cold also terminates the app
    printf '%s\n' "$2" >"$(dir)/mode.txt"; : >"$(dir)/log.txt"; rm -f "$(dir)/shared.json"
    [ "${3:-}" = cold ] && { xcrun simctl terminate booted "$id" 2>/dev/null || true; }
    echo "mode=$2 ${3:-warm}" ;;
  result)  # waits 5 s for a share to finish, then prints the log and what is left in the group
    sleep 5; cat "$(dir)/log.txt"; ls "$(dir)" | grep shared.json || echo "(no shared.json left)" ;;
  log) cat "$(dir)/log.txt" 2>/dev/null || echo "(no log.txt)" ;;
  clear) : >"$(dir)/log.txt"; rm -f "$(dir)/shared.json" ;;
  group) d=$(dir); echo "$d"; ls -la "$d" ;;
  syslog)
    xcrun simctl spawn booted log show --last "${2:-120}s" --info --style compact \
      --predicate 'subsystem == "dev.langle.spike"' | grep -v '^Filtering\|^Timestamp' | cut -c1-600 ;;
  sign)
    codesign -d --entitlements - "$app" 2>&1 | tail -n +1
    codesign -d --entitlements - "$app/PlugIns/ShareExt.appex" 2>&1 | tail -n +1 ;;
  *) echo "unknown: $1" >&2; exit 2 ;;
esac
