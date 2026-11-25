import { describe, expect, it } from "vitest";
import { createBrowserEnv } from "./browser-env";

describe("createBrowserEnv", () => {
  it("names Chrome and its sync for the chrome build", () => {
    const env = createBrowserEnv("chrome", {});
    expect(env.name).toBe("Chrome");
    expect(env.sync).toEqual({ kind: "browser", name: "Chrome sync" });
  });

  it("names Firefox and its sync for the firefox build", () => {
    const env = createBrowserEnv("firefox", {});
    expect(env.name).toBe("Firefox");
    expect(env.sync).toEqual({ kind: "browser", name: "Firefox Sync" });
  });

  it("uses Chrome's names for other Chromium build targets", () => {
    expect(createBrowserEnv("edge", {}).sync).toEqual({
      kind: "browser",
      name: "Chrome sync",
    });
  });

  it("keeps the data on the device where the app's host exists", () => {
    const appHost = { openPage: () => {} };
    expect(createBrowserEnv("langle-app", { appHost }).sync).toEqual({
      kind: "device",
    });
    expect(createBrowserEnv("chrome", { appHost }).sync).toEqual({
      kind: "device",
    });
  });

  it("defaults to the build target", () => {
    expect(createBrowserEnv().name).toBe(
      import.meta.env.BROWSER === "firefox" ? "Firefox" : "Chrome",
    );
  });

  it("detects the File System Access API on the given global", () => {
    expect(createBrowserEnv("chrome", {}).features).toEqual({
      fileSystemAccess: false,
    });
    expect(
      createBrowserEnv("chrome", { showDirectoryPicker: () => {} }).features,
    ).toEqual({ fileSystemAccess: true });
  });
});
