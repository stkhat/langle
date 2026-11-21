#!/bin/sh
# The player's own Japanese translation without a burst of refetches (docs/notes/mobile.md):
# a fresh launch on a video, the English track, then the translated track, one request at a
# time. Prints each timedtext response size and the parameters of its request.
# From the repository root:  sh mobile/prototypes/android-webview/translate.sh [video id]
. scripts/mobile/env.sh
PKG=dev.langle.probe.webview
VIDEO=${1:-iG9CE55wbtY}
CDP="node mobile/prototypes/cdp.mjs $PKG"
count() { adb logcat -d -s LangleProbe | grep -c '"type":"timedtext"'; }
adb shell am force-stop $PKG
adb logcat -c
adb shell "am start -n $PKG/.MainActivity --es url 'https://m.youtube.com/watch?v=$VIDEO'" >/dev/null
until [ "$(count)" -ge 1 ]; do sleep 2; done
# Switch to English if the page chose another track (no request when it is English already).
$CDP 'document.querySelector("#movie_player").setOption("captions", "track", { languageCode: "en" })' >/dev/null
sleep 5
before=$(count)
$CDP 'document.querySelector("#movie_player").setOption("captions", "track", { languageCode: "en",
  translationLanguage: { languageCode: "ja", languageName: "Japanese" } })' >/dev/null
until [ "$(count)" -gt "$before" ]; do sleep 2; done
adb logcat -d -s LangleProbe | grep '"type":"timedtext"' | grep -o '"bytes":[0-9]*' | tr '\n' ' '
echo
$CDP 'window.__langleProbe.timedtext.map((e) => { const q = new URL(e).searchParams;
  return ["lang", "tlang", "cbr", "c"].map((k) => k + "=" + (q.get(k) ?? "")).join("&"); })' | tr -d '\n'
echo
