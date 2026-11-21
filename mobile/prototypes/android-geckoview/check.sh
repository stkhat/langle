#!/bin/sh
# GeckoView prototype checks, from the repository root with the emulator running and the app built:
#   sh mobile/prototypes/android-geckoview/check.sh article <url>   # blocking off vs on
#   sh mobile/prototypes/android-geckoview/check.sh restart         # the extension reconnects after a restart
. scripts/mobile/env.sh
PKG=dev.langle.probe.gecko
log() { adb logcat -d -s LangleProbe:*; }
open() {
  adb shell am force-stop $PKG
  adb logcat -c
  adb shell "am start -n $PKG/.MainActivity --es url '$1' --es block $2" >/dev/null
}
case $1 in
  article)
    for mode in off on; do
      open "$2" $mode
      sleep 30
      adb shell "am start -n $PKG/.MainActivity --es cmd measure" >/dev/null 2>&1
      sleep 3
      echo "$mode blocked=$(log | grep -c '"type":"blocked"') $(log | grep '"cmd":"measure"' | grep -oE '"resources":[0-9]+,"hosts":[0-9]+,"textChars":[0-9]+')"
      log | grep -iE 'insertCSS|failed' | head -2 | cut -c32-200
    done
    ;;
  restart)
    open "https://m.youtube.com/watch?v=iG9CE55wbtY" on
    sleep 25
    log | grep -E 'ready|playerResponse' | cut -c32-200
    ;;
esac
