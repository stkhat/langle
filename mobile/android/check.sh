#!/bin/sh
# Drives the Android app on the running emulator (run outside Claude Code's sandbox).
#
#   check.sh build [check]          bundles the langle-app build (check: the check build) and
#                                   builds the debug APK
#   check.sh install                installs the debug APK
#   check.sh launch [url]           restarts the app (clears logcat), opening <url>
#   check.sh reset                  clears the app's data: the next launch is a first run
#   check.sh cmd <name>             errors | clear-errors | state, and prints the result
#   check.sh js <target> <js>       runs <js> (an async function body) in host | page | langle |
#                                   sheet, and prints what it returns
#   check.sh fullscreen             the page's fullscreen, the screen and a test element in the
#                                   player (mobile/check/fullscreen.js), then the shell's state
#   check.sh log                    the app's log lines so far (check results, console errors and
#                                   warnings, bridge errors, the shell's own lines)
#   check.sh kill                   stops the app
#   check.sh screenshot <file.png>  saves a screenshot of the emulator
#
# Commands reach the debug build as launch intents (CheckCommands.kt); results are logcat lines
# with the tag LangleCheck. `launch` forwards the E2E server's port (`node e2e/serve.ts`) to the
# emulator, e.g. `check.sh launch http://localhost:4719/article-en.html` (10.0.2.2 does not reach
# it). A cold start shows the article's highlights after about 20 s on the emulator.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
. "$here/../../scripts/mobile/env.sh"
pkg=dev.langle.app
activity="$pkg/.MainActivity"
apk="$here/app/build/outputs/apk/debug/app-debug.apk"

result() {
  # Waits for the command's line, at most 10 s.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    if adb logcat -d -s LangleCheck:I | grep -q " $1 "; then break; fi
  done
  adb logcat -d -s LangleCheck:I | sed -n "s/.*LangleCheck: //p" | grep "^$1 \|^… " | tail -n 20
  adb logcat -c
}

case "${1:-}" in
build)
  sh "$here/scripts/bundle-build.sh" ${2:-}
  (cd "$here" && ./gradlew -q :app:assembleDebug)
  ;;
install)
  adb install -r "$apk"
  ;;
launch)
  adb shell am force-stop "$pkg"
  # A start while the old process is still dying is cancelled by the system.
  sleep 1
  while adb shell ps -A -o NAME | grep -q "^$pkg\$"; do sleep 1; done
  adb reverse tcp:4719 tcp:4719 >/dev/null
  adb logcat -c
  if [ -n "${2:-}" ]; then
    adb shell am start -n "$activity" --es url "'$2'" >/dev/null
  else
    adb shell am start -n "$activity" >/dev/null
  fi
  ;;
reset)
  adb shell pm clear "$pkg"
  ;;
cmd)
  name="${2:?usage: check.sh cmd <name>}"
  adb logcat -c
  adb shell am start -n "$activity" --es check "$name" >/dev/null
  result "$name"
  ;;
js)
  target="${2:?usage: check.sh js <target> <js>}"
  source=$(printf %s "${3:?usage: check.sh js <target> <js>}" | base64 | tr -d '\n')
  adb logcat -c
  adb shell am start -n "$activity" --es check eval --es target "$target" --es source64 "$source" >/dev/null
  result eval
  ;;
fullscreen)
  # The probe is a function; the script calls it.
  source=$( { cat "$here/../check/fullscreen.js"; printf "\nreturn fullscreenProbe();\n"; } | base64 | tr -d "\n")
  adb logcat -c
  adb shell am start -n "$activity" --es check eval --es target langle --es source64 "$source" >/dev/null
  result eval
  adb shell am start -n "$activity" --es check state >/dev/null
  result state
  ;;
log)
  adb logcat -d -s Langle:V LangleCheck:V LangleConsole:V LangleBridge:V
  ;;
kill)
  adb shell am force-stop "$pkg"
  ;;
screenshot)
  adb exec-out screencap -p >"${2:?usage: check.sh screenshot <file.png>}"
  ;;
*)
  sed -n '2,22p' "$0"
  exit 2
  ;;
esac
