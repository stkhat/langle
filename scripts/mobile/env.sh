# Android tooling for the mobile app, macOS defaults (docs/development.md "Mobile app").
# Source it in the shell that builds or runs the app: `source scripts/mobile/env.sh`.
# Values already set in the environment win.
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
# Android Studio's bundled JDK; Gradle and the SDK tools need a JDK, macOS ships none.
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$JAVA_HOME/bin:$PATH"
