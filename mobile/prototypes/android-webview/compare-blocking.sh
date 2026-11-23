#!/bin/sh
# Open each URL with ad blocking off, then on, and print what loaded. Screenshots go to $OUT.
# Usage (from the repository root, emulator running, app installed):
#   OUT=<dir> sh mobile/prototypes/android-webview/compare-blocking.sh <url>...
. scripts/mobile/env.sh
PKG=dev.langle.probe.webview
OUT=${OUT:-$TMPDIR}
MEASURE='(() => {
  const r = performance.getEntriesByType("resource");
  const hosts = new Set(r.map((x) => new URL(x.name).hostname));
  const iframes = [...document.querySelectorAll("iframe")].filter((f) => f.offsetWidth > 50 && f.offsetHeight > 30);
  const style = document.getElementById("langle-cosmetic");
  return { resources: r.length, hosts: hosts.size, visibleIframes: iframes.length,
    cosmeticRules: style?.sheet?.cssRules.length ?? 0, textChars: document.body.innerText.length };
})()'
for url in "$@"; do
  for mode in off on; do
    adb shell am force-stop $PKG
    adb logcat -c
    adb shell am start -n $PKG/.MainActivity --es url "$url" --es block $mode >/dev/null
    sleep 20
    adb shell input swipe 540 1800 540 700 300
    sleep 4
    blocked=$(adb logcat -d -s LangleProbe:* | grep -c "blocked #")
    printf '%s %s blockedLogged=%s ' "$mode" "$url" "$blocked"
    node mobile/prototypes/cdp.mjs $PKG "$MEASURE" | tr -d '\n '
    echo
    adb exec-out screencap -p >"$OUT/block-$mode-$(echo "$url" | cut -d/ -f3).png"
  done
done
