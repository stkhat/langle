#!/bin/sh
# Builds the `langle-app` WXT target and bundles it into the Android app's assets.
#
#   bundle-build.sh          production build (npm run build:app)
#   bundle-build.sh check    check build (wxt --mode check): the error log, the settings channel
#
# The build lands in mobile/android/app/src/main/assets/langle-app/ (git-ignored); the app serves
# it on its origin (AppOrigin.kt). Run `./gradlew :app:assembleDebug` after it.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
android=$(dirname "$here")
repo=$(cd "$android/../.." && pwd)
dest="$android/app/src/main/assets/langle-app"

case "${1:-}" in
check)
  (cd "$repo" && npx wxt build -b langle-app --mode check)
  out="$repo/.output/langle-app-mv3-check"
  ;;
"")
  (cd "$repo" && npm run build:app)
  out="$repo/.output/langle-app-mv3"
  ;;
*)
  echo "usage: bundle-build.sh [check]" >&2
  exit 2
  ;;
esac

rm -rf "$dest"
mkdir -p "$dest"
cp -R "$out/." "$dest/"
echo "bundled $out -> $dest"
