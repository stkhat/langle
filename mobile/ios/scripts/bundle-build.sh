#!/bin/sh
# Builds the `langle-app` WXT target and stages it for the iOS app.
#
#   bundle-build.sh           production build (npm run build:app)
#   bundle-build.sh check     check build (wxt --mode check): the error log, the settings channel
#   bundle-build.sh --copy-into <dir>
#                             Xcode's build phase: copies the staged build into the app bundle
#   bundle-build.sh --copy-share-into <dir>
#                             the share extension's build phase: native-strings-en.json and
#                             the mark (icon/128.png as LangleMark.png) into the extension
#
# The staged build sits in mobile/ios/build-output/langle-app/ (git-ignored), and next to it
# native-strings-en.json: the shell's built-in English, en.json's `app.` keys
# (scripts/mobile/native-strings-en.ts), copied into the app bundle beside langle-app/.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
ios=$(dirname "$here")
repo=$(cd "$ios/../.." && pwd)
staged="$ios/build-output/langle-app"
english="$ios/build-output/native-strings-en.json"

case "${1:-}" in
--copy-into)
  dest="${2:?usage: bundle-build.sh --copy-into <dir>}"
  if [ ! -f "$staged/manifest.json" ] || [ ! -f "$english" ]; then
    echo "error: no langle-app build staged; run mobile/ios/scripts/bundle-build.sh first" >&2
    exit 1
  fi
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "$staged/." "$dest/"
  cp "$english" "$(dirname "$dest")/native-strings-en.json"
  exit 0
  ;;
--copy-share-into)
  # The share extension's build phase: its own English and Langle's mark (LangleMark.png).
  dest="${2:?usage: bundle-build.sh --copy-share-into <dir>}"
  if [ ! -f "$staged/icon/128.png" ] || [ ! -f "$english" ]; then
    echo "error: no langle-app build staged; run mobile/ios/scripts/bundle-build.sh first" >&2
    exit 1
  fi
  mkdir -p "$dest"
  cp "$english" "$dest/native-strings-en.json"
  cp "$staged/icon/128.png" "$dest/LangleMark.png"
  exit 0
  ;;
check)
  (cd "$repo" && npx wxt build -b langle-app --mode check)
  out="$repo/.output/langle-app-mv3-check"
  ;;
"")
  (cd "$repo" && npm run build:app)
  out="$repo/.output/langle-app-mv3"
  ;;
*)
  echo "usage: bundle-build.sh [check] | --copy-into <dir> | --copy-share-into <dir>" >&2
  exit 2
  ;;
esac

rm -rf "$staged"
mkdir -p "$staged"
cp -R "$out/." "$staged/"
(cd "$repo" && node scripts/mobile/native-strings-en.ts "$english")
echo "staged $out -> $staged"
