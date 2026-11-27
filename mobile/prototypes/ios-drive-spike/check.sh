#!/bin/sh
# Spike M7a on a Simulator (docs/notes/mobile.md "Drive sign-in (M7a)"); outside the sandbox.
# The device defaults to the iPhone 17e so the real app on the iPhone 17 is left alone
# (the spike's bundle id is dev.langle.app, the iOS OAuth client's).
#   check.sh build | install
#   check.sh launch <cmd,cmd…>   (terminates the app, launches it with -cmds; e.g. refresh,drive)
#   check.sh log [minutes]       (the result lines of the last minutes, default 5)
set -eu
cd "$(dirname "$0")"
device="${SPIKE_DEVICE:-iPhone 17e}"
id=dev.langle.app
case "$1" in
  build)
    cp ../drive-spike-web/drive.html ../drive-spike-web/drive.js LangleDriveSpike/
    xcodebuild -project LangleDriveSpike.xcodeproj -scheme LangleDriveSpike -configuration Debug \
      -destination 'generic/platform=iOS Simulator' -derivedDataPath build -quiet build ;;
  install) xcrun simctl install "$device" build/Build/Products/Debug-iphonesimulator/LangleDriveSpike.app ;;
  launch)
    xcrun simctl terminate "$device" "$id" 2>/dev/null || true
    xcrun simctl launch "$device" "$id" -cmds "$2" >/dev/null ;;
  log)
    xcrun simctl spawn "$device" log show --last "${2:-5}m" --style compact --info \
      --predicate 'subsystem == "dev.langle.spike"' | grep ' M7A ' | sed 's/.* M7A //' | cut -c1-2000 ;;
  *) echo "unknown: $1" >&2; exit 2 ;;
esac
