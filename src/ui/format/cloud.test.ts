import { describe, expect, it } from "vitest";
import type { CloudStatus } from "../../messaging/protocol";
import { appCloud, cloudConnectedDesc, cloudView } from "./cloud";

describe("cloudConnectedDesc", () => {
  it("names the account once it is known", () => {
    expect(
      cloudConnectedDesc({ account: "alex.kim@gmail.com" }, "Google Drive"),
    ).toBe(
      "Google Drive (alex.kim@gmail.com). Everything is saved there, in a folder only Langle can open.",
    );
  });

  it("names the provider alone until then", () => {
    expect(cloudConnectedDesc({}, "Google Drive")).toBe(
      "Google Drive. Everything is saved there, in a folder only Langle can open.",
    );
  });
});

describe("appCloud", () => {
  const features = (appGoogleAuth: boolean) => ({ appGoogleAuth });

  it("is the app's Google sign-in on this device only", () => {
    expect(
      appCloud({ sync: { kind: "device" }, features: features(true) }),
    ).toEqual({ googleAuth: true });
    expect(
      appCloud({
        sync: { kind: "browser", browser: "chrome" },
        features: features(true),
      }),
    ).toBeUndefined();
  });
});

describe("cloudView", () => {
  const OFFERED: CloudStatus = {
    available: ["googleDrive"],
    bytes: 0,
    devices: 0,
  };
  const CHOSEN = { cloudProvider: "googleDrive" } as const;

  it("asks the browser to connect on this device too", () => {
    expect(cloudView(OFFERED, CHOSEN)).toMatchObject({ kind: "too" });
  });

  it("only offers it in the app, which cannot learn of other devices' choice", () => {
    expect(cloudView(OFFERED, CHOSEN, { googleAuth: true })).toMatchObject({
      kind: "offer",
      name: "Google Drive",
    });
  });

  it("offers nothing in an app that cannot sign in to Google", () => {
    expect(cloudView(OFFERED, CHOSEN, { googleAuth: false })).toEqual({
      kind: "unavailable",
    });
    expect(
      cloudView({ ...OFFERED, provider: "googleDrive" }, CHOSEN, {
        googleAuth: false,
      }),
    ).toEqual({ kind: "unavailable" });
  });

  it("shows the connection in the app", () => {
    expect(
      cloudView({ ...OFFERED, provider: "googleDrive" }, CHOSEN, {
        googleAuth: true,
      }),
    ).toMatchObject({ kind: "connected", provider: "googleDrive" });
  });
});
