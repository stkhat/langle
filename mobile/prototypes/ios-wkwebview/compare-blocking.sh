#!/bin/sh
# Load each URL with blocking off, then on, and compare what the page loaded (run outside the
# sandbox). "listed" counts loaded hosts that EasyList's ||host^ rules name (or a parent of them).
#   compare-blocking.sh <url>...
set -eu
here=$(dirname "$0")
out="${TMPDIR:-/tmp}/langle-probe-ios.log"
list="$(xcrun simctl get_app_container booted dev.langle.probe.wk data)/Library/Caches/easylist.txt"
for url in "$@"; do
  for mode in off on; do
    if [ "$mode" = off ]; then "$here/check.sh" open "$url" -block off >/dev/null; else "$here/check.sh" open "$url" >/dev/null; fi
    until grep -q pageFinished "$out"; do sleep 2; done
    sleep 10
    "$here/check.sh" cmd measure
    "$here/check.sh" cmd hosts
    until grep -q "cmd hosts" "$out"; do sleep 1; done
    hosts=$(grep "cmd hosts" "$out" | sed 's/.*cmd hosts "//; s/"$//')
    resources=$(grep "cmd measure" "$out" | grep -o '"resources":[0-9]*' | cut -d: -f2)
    listed=$(echo "$hosts" | tr ' ' '\n' | python3 -c '
import sys
rules = {l[2:].split("^")[0] for l in open(sys.argv[1]) if l.startswith("||") and l.rstrip().endswith(("^", "^$third-party"))}
def listed(h):
    parts = h.split(".")
    return any(".".join(parts[i:]) in rules for i in range(len(parts) - 1))
hs = [h for h in sys.stdin.read().split() if listed(h)]
print(len(hs), " ".join(hs[:8]))' "$list")
    echo "$url block=$mode resources=$resources hosts=$(echo "$hosts" | wc -w | tr -d ' ') listed=$listed"
  done
done
