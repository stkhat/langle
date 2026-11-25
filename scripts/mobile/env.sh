#!/bin/sh
# Android tooling for the mobile app, macOS defaults (docs/development.md "Mobile app").
# Run a command with it:  `scripts/mobile/env.sh ./gradlew :core:test`  (exports, then execs the command).
# Or source it in the shell that builds or runs the app: `source scripts/mobile/env.sh`.
# Values already set in the environment win.
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
# Android Studio's bundled JDK; Gradle and the SDK tools need a JDK, macOS ships none.
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$JAVA_HOME/bin:$PATH"
# Wrapper mode only when executed (not sourced from a script that has its own arguments).
case "$0" in
*/env.sh | env.sh)
  if [ "$#" -gt 0 ]; then exec "$@"; fi
  ;;
esac
