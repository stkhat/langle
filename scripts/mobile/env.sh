#!/bin/sh
# Android and Rust tooling for the mobile app, macOS defaults (docs/development.md "Mobile app").
# Run a command with it:  `scripts/mobile/env.sh ./gradlew :core:test`  (exports, then execs the command).
# Or source it in the shell that builds or runs the app: `source scripts/mobile/env.sh`.
# Values already set in the environment win.
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
# Android Studio's bundled JDK; Gradle and the SDK tools need a JDK, macOS ships none.
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
# The NDK the ad-blocking crate is built with (npm run mobile:adblock, cargo-ndk).
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$ANDROID_HOME/ndk/30.0.16248370}"
# Homebrew's rustup is keg-only (not on the default PATH); cargo-ndk is in ~/.cargo/bin.
export RUSTUP_BIN="${RUSTUP_BIN:-/opt/homebrew/opt/rustup/bin}"
export CARGO_BIN="${CARGO_BIN:-$HOME/.cargo/bin}"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$JAVA_HOME/bin:$RUSTUP_BIN:$CARGO_BIN:$PATH"
# Wrapper mode only when executed (not sourced from a script that has its own arguments).
case "$0" in
*/env.sh | env.sh)
  if [ "$#" -gt 0 ]; then exec "$@"; fi
  ;;
esac
