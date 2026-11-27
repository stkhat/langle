import { describe, expect, it } from "vitest";
import { createBrowserEnv } from "./browser-env";

describe("createBrowserEnv", () => {
  it("names Chrome and its sync for the chrome build", () => {
    const env = createBrowserEnv("chrome", {});
    expect(env.name).toBe("Chrome");
    expect(env.sync).toEqual({ kind: "browser", browser: "Chrome" });
  });

  it("names Firefox and its sync for the firefox build", () => {
    const env = createBrowserEnv("firefox", {});
    expect(env.name).toBe("Firefox");
    expect(env.sync).toEqual({ kind: "browser", browser: "Firefox" });
  });

  it("uses Chrome's names for other Chromium build targets", () => {
    expect(createBrowserEnv("edge", {}).sync).toEqual({
      kind: "browser",
      browser: "Chrome",
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
      appHost: false,
      appGoogleAuth: false,
    });
    expect(
      createBrowserEnv("chrome", { showDirectoryPicker: () => {} }).features,
    ).toEqual({ fileSystemAccess: true, appHost: false, appGoogleAuth: false });
  });

  it("detects the phone app by its appHost, whatever the build", () => {
    const appHost = { openPage: () => {} };
    expect(createBrowserEnv("chrome", { appHost }).features.appHost).toBe(true);
    expect(createBrowserEnv("langle-app", {}).features.appHost).toBe(false);
  });

  it("detects the app's Google sign-in by appHost.googleAuth", () => {
    const googleAuth = { token: async () => ({}), forget: async () => {} };
    expect(
      createBrowserEnv("langle-app", { appHost: { googleAuth } }).features
        .appGoogleAuth,
    ).toBe(true);
    expect(
      createBrowserEnv("langle-app", { appHost: { openPage: () => {} } })
        .features.appGoogleAuth,
    ).toBe(false);
  });
});
