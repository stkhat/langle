#!/bin/sh
# Builds the `langle-app` WXT target and stages it for the iOS app.
#
#   bundle-build.sh           production build (npm run build:app)
#   bundle-build.sh check     check build (wxt --mode check): the error log, the settings channel
#   bundle-build.sh --copy-into <dir>
#                             Xcode's build phase: copies the staged build into the app bundle
#
# The staged build sits in mobile/ios/build-output/langle-app/ (git-ignored).
set -eu

here=$(cd "$(dirname "$0")" && pwd)
ios=$(dirname "$here")
repo=$(cd "$ios/../.." && pwd)
staged="$ios/build-output/langle-app"

case "${1:-}" in
--copy-into)
  dest="${2:?usage: bundle-build.sh --copy-into <dir>}"
  if [ ! -f "$staged/manifest.json" ]; then
    echo "error: no langle-app build staged; run mobile/ios/scripts/bundle-build.sh first" >&2
    exit 1
  fi
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "$staged/." "$dest/"
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
  echo "usage: bundle-build.sh [check] | --copy-into <dir>" >&2
  exit 2
  ;;
esac

rm -rf "$staged"
mkdir -p "$staged"
cp -R "$out/." "$staged/"
echo "staged $out -> $staged"
