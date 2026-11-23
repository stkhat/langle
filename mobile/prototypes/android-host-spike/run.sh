#!/bin/sh
# Drive spike S2 on the running emulator and print its result lines (docs/notes/mobile.md
# "Android extension host spike (S2)"). From the repository root, with the sandbox off:
#   sh mobile/prototypes/android-host-spike/run.sh install
#   sh mobile/prototypes/android-host-spike/run.sh <seconds> <am start extras…>
#     e.g. run.sh 12 --es mode world
#          run.sh 20 --es mode store --es op write
#          run.sh 130 --es mode timer
#   sh mobile/prototypes/android-host-spike/run.sh send <seconds> <extras…>   (no restart)
#   sh mobile/prototypes/android-host-spike/run.sh log                        (lines so far)
. scripts/mobile/env.sh
PKG=dev.langle.spike.host
DIR=mobile/prototypes/android-host-spike
case "$1" in
  install)
    (cd $DIR && ./gradlew -q assembleDebug) && adb install -r $DIR/app/build/outputs/apk/debug/app-debug.apk
    exit ;;
  log)
    adb logcat -d -s LangleS2:I | grep ' S2 ' | sed 's/.* S2 //'
    exit ;;
  send)
    shift; WAIT=$1; shift
    adb shell am start -n $PKG/.MainActivity "$@" >/dev/null
    sleep "$WAIT"
    adb logcat -d -s LangleS2:I | grep ' S2 ' | sed 's/.* S2 //'
    exit ;;
esac
WAIT=$1; shift
adb shell am force-stop $PKG
adb logcat -c
adb shell am start -n $PKG/.MainActivity "$@" >/dev/null
sleep "$WAIT"
adb logcat -d -s LangleS2:I | grep ' S2 ' | sed 's/.* S2 //'
