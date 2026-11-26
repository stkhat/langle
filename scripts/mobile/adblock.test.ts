import { describe, expect, it } from "vitest";
import { missingTools, TARGETS, type Tools } from "./adblock.ts";

const all: Tools = {
  cargo: true,
  targets: TARGETS,
  cargoNdk: true,
  ndk: "/sdk/ndk/30.0.16248370",
  xcodebuild: true,
};

describe("missingTools", () => {
  it("is empty when everything is there", () => {
    expect(missingTools(all, ["android", "ios"])).toEqual([]);
  });

  it("names cargo with its install commands, and not the targets it cannot list", () => {
    const missing = missingTools({ ...all, cargo: false, targets: [] }, [
      "android",
    ]);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain("brew install rustup");
    expect(missing[0]).toContain("rustup default stable");
  });

  it("names only the targets the asked platforms need", () => {
    const tools = { ...all, targets: ["aarch64-apple-ios"] };
    expect(missingTools(tools, ["ios"])).toEqual([
      "Rust targets: `rustup target add aarch64-apple-ios-sim`",
    ]);
    expect(missingTools(tools, ["android"])).toEqual([
      "Rust targets: `rustup target add aarch64-linux-android x86_64-linux-android`",
    ]);
  });

  it("asks for cargo-ndk and the NDK only for Android, Xcode only for iOS", () => {
    const tools = {
      ...all,
      cargoNdk: false,
      ndk: undefined,
      xcodebuild: false,
    };
    const android = missingTools(tools, ["android"]);
    expect(android).toHaveLength(2);
    expect(android[0]).toContain("cargo install cargo-ndk");
    expect(android[1]).toContain('sdkmanager "ndk;30.0.16248370"');
    const ios = missingTools(tools, ["ios"]);
    expect(ios).toHaveLength(1);
    expect(ios[0]).toContain("Xcode");
  });
});
