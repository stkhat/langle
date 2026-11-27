// Builds the phone app's ad-blocking crate (mobile/adblock/, docs/specs/mobile-app.md "M6: ad
// blocking") for both shells: a .so per Android ABI (arm64-v8a and armeabi-v7a for phones,
// x86_64 for x86 emulators and ChromeOS) and an iOS XCFramework (device and Apple-silicon
// Simulator). The outputs are
// git-ignored, under mobile/adblock/build/:
//   android/jniLibs/<abi>/liblangle_adblock.so
//   ios/LangleAdblock.xcframework   (module LangleAdblock, include/langle_adblock.h)
// It installs nothing: when cargo, a Rust target, cargo-ndk, the NDK or Xcode is missing it
// says so with the command that installs it (docs/development.md "Mobile app").
// Usage: npm run mobile:adblock [-- android | ios]   (runs under scripts/mobile/env.sh)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const CRATE = resolve(import.meta.dirname, "../../mobile/adblock");
const OUT = join(CRATE, "build");
const LIB = "liblangle_adblock";

/**
 * The Android ABIs and their Rust targets: every ABI an Android 10 (minSdk 29) device runs apps
 * in, but 32-bit x86, which no phone of that age uses (notes/mobile.md "Device checks (M6e,
 * Android)"). An APK with native libraries but none for a device's ABIs does not install there
 * (INSTALL_FAILED_NO_MATCHING_ABIS). The app's build checks the same list
 * (mobile/android/app/build.gradle.kts, `checkAdblockLibrary`).
 */
const ANDROID = {
  "arm64-v8a": "aarch64-linux-android",
  "armeabi-v7a": "armv7-linux-androideabi",
  x86_64: "x86_64-linux-android",
};
/** The app's minSdk (mobile/android/app/build.gradle.kts). */
const ANDROID_API = "29";
const IOS = ["aarch64-apple-ios", "aarch64-apple-ios-sim"];
export const TARGETS = [...Object.values(ANDROID), ...IOS];

export interface Tools {
  /** `cargo --version` ran. */
  readonly cargo: boolean;
  /** `rustup target list --installed`. */
  readonly targets: readonly string[];
  readonly cargoNdk: boolean;
  /** ANDROID_NDK_HOME, when that folder exists. */
  readonly ndk: string | undefined;
  readonly xcodebuild: boolean;
}

/** What is missing for `platforms`, each with the command that installs it. */
export function missingTools(
  tools: Tools,
  platforms: readonly ("android" | "ios")[],
): string[] {
  const missing: string[] = [];
  if (!tools.cargo)
    missing.push(
      "cargo: `brew install rustup` and `rustup default stable` (Homebrew's rustup is keg-only; scripts/mobile/env.sh puts it on PATH)",
    );
  const wanted = [
    ...(platforms.includes("android") ? Object.values(ANDROID) : []),
    ...(platforms.includes("ios") ? IOS : []),
  ].filter((t) => !tools.targets.includes(t));
  if (tools.cargo && wanted.length > 0)
    missing.push(`Rust targets: \`rustup target add ${wanted.join(" ")}\``);
  if (platforms.includes("android")) {
    if (!tools.cargoNdk) missing.push("cargo-ndk: `cargo install cargo-ndk`");
    if (!tools.ndk)
      missing.push(
        'the Android NDK: `scripts/mobile/env.sh sdkmanager "ndk;30.0.16248370"` (or set ANDROID_NDK_HOME)',
      );
  }
  if (platforms.includes("ios") && !tools.xcodebuild)
    missing.push(
      'xcodebuild: full Xcode (docs/development.md "Mobile app" › iOS)',
    );
  return missing;
}

const ran = (cmd: string, args: string[]) =>
  spawnSync(cmd, args, { encoding: "utf8" }).status === 0;

function probe(): Tools {
  const targets = spawnSync("rustup", ["target", "list", "--installed"], {
    encoding: "utf8",
  });
  const ndk = process.env.ANDROID_NDK_HOME;
  return {
    cargo: ran("cargo", ["--version"]),
    targets:
      targets.status === 0 ? targets.stdout.split("\n").filter(Boolean) : [],
    cargoNdk: ran("cargo", ["ndk", "--version"]),
    ndk: ndk && existsSync(ndk) ? ndk : undefined,
    xcodebuild: ran("xcodebuild", ["-version"]),
  };
}

function run(cmd: string, args: string[]) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: CRATE, stdio: "inherit" });
  if (r.status !== 0)
    throw new Error(`${cmd} failed (${r.status ?? r.signal})`);
}

const size = (path: string) => `${(statSync(path).size / 1e6).toFixed(2)} MB`;

function buildAndroid() {
  const out = join(OUT, "android/jniLibs");
  rmSync(out, { recursive: true, force: true });
  const abis = Object.keys(ANDROID).flatMap((abi) => ["-t", abi]);
  run("cargo", [
    "ndk",
    ...abis,
    "-P",
    ANDROID_API,
    "-o",
    out,
    "build",
    "--release",
    "--lib",
  ]);
  for (const abi of Object.keys(ANDROID)) {
    const so = join(out, abi, `${LIB}.so`);
    console.log(`${so}: ${size(so)}`);
  }
}

function buildIos() {
  const out = join(OUT, "ios/LangleAdblock.xcframework");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(OUT, "ios"), { recursive: true });
  const libraries = IOS.flatMap((target) => {
    run("cargo", ["build", "--release", "--lib", "--target", target]);
    return [
      "-library",
      join(CRATE, "target", target, "release", `${LIB}.a`),
      "-headers",
      join(CRATE, "include"),
    ];
  });
  run("xcodebuild", ["-create-xcframework", ...libraries, "-output", out]);
  console.log(`${out}: built`);
}

function main() {
  const asked = process.argv.slice(2);
  const platforms = (asked.length > 0 ? asked : ["android", "ios"]) as (
    "android" | "ios"
  )[];
  const missing = missingTools(probe(), platforms);
  if (missing.length > 0) {
    console.error(
      `Missing for the ad-blocking crate (nothing was installed):\n${missing.map((m) => `- ${m}`).join("\n")}`,
    );
    process.exit(1);
  }
  if (platforms.includes("android")) buildAndroid();
  if (platforms.includes("ios")) buildIos();
}

if (import.meta.main) main();
