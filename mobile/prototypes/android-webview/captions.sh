#!/bin/sh
# Open a YouTube video in the WebView prototype, ask the player for English captions, and print
# the sizes of the caption variants (docs/notes/mobile.md). From the repository root:
#   sh mobile/prototypes/android-webview/captions.sh [video id] [default|nowv]
. scripts/mobile/env.sh
PKG=dev.langle.probe.webview
VIDEO=${1:-iG9CE55wbtY}
UA=${2:-default}
adb shell am force-stop $PKG
adb shell "am start -n $PKG/.MainActivity --es url 'https://m.youtube.com/watch?v=$VIDEO' --es ua $UA" >/dev/null
sleep 25
node mobile/prototypes/cdp.mjs $PKG '(() => { const p = document.querySelector("#movie_player");
  p.loadModule?.("captions"); p.setOption("captions", "track", { languageCode: "en" });
  return { ua: navigator.userAgent.slice(0, 50), state: p.getPlayerState() }; })()' | tr -d '\n'
echo
sleep 6
node mobile/prototypes/cdp.mjs $PKG 'window.__langleProbeVariants()' | tr -d '\n'
echo
