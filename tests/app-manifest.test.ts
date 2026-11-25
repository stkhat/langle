import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// The phone app reads only these parts of the build's manifest and refuses a build that
// asks for more (docs/specs/mobile-app.md "The langle-app build target").
const DIR = ".output/langle-app-mv3";
const CONTENT_SCRIPT_KEYS = ["matches", "js", "run_at", "world", "css"];
const APP_PERMISSIONS = ["storage", "alarms", "identity"];

type Manifest = {
  manifest_version: number;
  permissions?: string[];
  host_permissions?: string[];
  background?: { service_worker?: string };
  content_scripts?: Record<string, unknown>[];
};

function readManifest(): Manifest {
  const path = `${DIR}/manifest.json`;
  if (!existsSync(path))
    throw new Error(`${path} not found. Build first: npm run build:app`);
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

describe("langle-app manifest", () => {
  test("is Manifest V3 with a background script", () => {
    const manifest = readManifest();
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background?.service_worker).toBe("background.js");
    expect(existsSync(`${DIR}/background.js`)).toBe(true);
  });

  test("has content scripts the app can inject: top frame only, no CSS", () => {
    const scripts = readManifest().content_scripts ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(
        Object.keys(script).filter((key) => !CONTENT_SCRIPT_KEYS.includes(key)),
      ).toEqual([]);
      expect(script.all_frames ?? false).toBe(false);
      expect((script.css as string[] | undefined) ?? []).toEqual([]);
      for (const file of script.js as string[])
        expect(existsSync(`${DIR}/${file}`)).toBe(true);
    }
  });

  test("has no Netflix scripts", () => {
    const matches = (readManifest().content_scripts ?? []).flatMap(
      (script) => script.matches as string[],
    );
    expect(matches.filter((match) => match.includes("netflix"))).toEqual([]);
  });

  test("has the m.youtube.com scripts and none for www.youtube.com", () => {
    const scripts = (readManifest().content_scripts ?? []).map((script) => ({
      matches: script.matches,
      js: script.js,
      world: script.world,
    }));
    expect(
      scripts.filter((script) =>
        (script.matches as string[]).some((match) => match.includes("youtube")),
      ),
    ).toEqual([
      {
        matches: ["*://m.youtube.com/*"],
        js: ["content-scripts/youtube-mobile-main.js"],
        world: "MAIN",
      },
      {
        matches: ["*://m.youtube.com/*"],
        js: ["content-scripts/youtube-mobile.js"],
        world: undefined,
      },
    ]);
  });

  test("ships the shim", () => {
    expect(existsSync(`${DIR}/langle-shim.js`)).toBe(true);
  });

  test("ships Home, the app's first screen", () => {
    expect(existsSync(`${DIR}/home.html`)).toBe(true);
  });

  test("asks only for permissions the app has", () => {
    const manifest = readManifest();
    expect(
      (manifest.permissions ?? []).filter((p) => !APP_PERMISSIONS.includes(p)),
    ).toEqual([]);
    expect(manifest.host_permissions).toBeUndefined();
  });
});
