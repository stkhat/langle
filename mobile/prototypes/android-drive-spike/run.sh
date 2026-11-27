#!/bin/sh
# Spike M7a on the running emulator (docs/notes/mobile.md "Drive sign-in (M7a)").
# From the repository root, with the sandbox off:
#   sh mobile/prototypes/android-drive-spike/run.sh install       (installs over dev.langle.app)
#   sh mobile/prototypes/android-drive-spike/run.sh start         (fresh start, log cleared)
#   sh mobile/prototypes/android-drive-spike/run.sh <cmd> [prompt] (connect, silent, drive, probe, clear, old, bad, forget, revoke)
#   sh mobile/prototypes/android-drive-spike/run.sh log           (result lines so far)
PKG=dev.langle.app
ACT=$PKG/dev.langle.spike.drive.MainActivity
DIR=mobile/prototypes/android-drive-spike
ENV=scripts/mobile/env.sh
case "$1" in
  install)
    (cd $DIR && ../../../$ENV ./gradlew -q assembleDebug) && $ENV adb install -r $DIR/app/build/outputs/apk/debug/app-debug.apk
    ;;
  start)
    $ENV adb shell am force-stop $PKG
    $ENV adb logcat -c
    $ENV adb shell am start -n $ACT >/dev/null
    ;;
  log)
    $ENV adb logcat -d -s LangleM7a:I | grep ' M7A ' | sed 's/.* M7A //'
    ;;
  *)
    if [ -n "$2" ]; then
      $ENV adb shell am start -n $ACT --es cmd "$1" --es prompt "$2" >/dev/null
    else
      $ENV adb shell am start -n $ACT --es cmd "$1" >/dev/null
    fi
    ;;
esac
