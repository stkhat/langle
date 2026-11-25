import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

type Manifest = {
  manifest_version: number;
  permissions?: string[];
  host_permissions?: string[];
  content_scripts?: {
    matches: string[];
    js?: string[];
    world?: string;
    run_at?: string;
  }[];
  browser_specific_settings?: { gecko?: { id?: string } };
  background?: { service_worker?: string; scripts?: string[] };
  icons?: Record<string, string>;
  key?: string;
  oauth2?: { client_id: string; scopes: string[] };
};

function readManifest(dir: string): Manifest {
  const path = `.output/${dir}/manifest.json`;
  if (!existsSync(path)) {
    throw new Error(`${path} not found. Build first: npm run build`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

/** The production builds: Chrome's only, while Firefox is paused (docs/notes/firefox-paused.md). */
const BUILDS = ["chrome-mv3"];

// Exact equality on purpose: adding a permission or host must be a deliberate edit of this test.
describe.each(BUILDS)("%s manifest", (dir) => {
  const manifest = () => readManifest(dir);

  test("is Manifest V3", () => {
    expect(manifest().manifest_version).toBe(3);
  });

  // alarms (retrying language data downloads) and identity (signing in to the user's
  // own cloud storage) add no install warning in Chrome, unlike host permissions: the
  // mirrors and Google Drive's API send CORS headers, so neither needs any.
  test("requests only the storage, alarms and identity permissions", () => {
    expect(manifest().permissions).toEqual(["storage", "alarms", "identity"]);
  });

  test("has the colored toolbar icon in every size", () => {
    const icons = manifest().icons;
    expect(icons).toEqual({
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      128: "icon/128.png",
    });
    for (const file of Object.values(icons ?? {}))
      expect(existsSync(`.output/${dir}/${file}`)).toBe(true);
  });

  test("ships the gray toolbar icon shown while Langle is off, in every size", () => {
    for (const size of [16, 32, 48, 128])
      expect(existsSync(`.output/${dir}/icon-off/${size}.png`)).toBe(true);
  });

  // The build finds the packages it ships itself (scripts/licenses.ts) and fails for one
  // without a license text; here, the file is in the build with every dependency.
  test("ships the licenses of the packages it bundles, the fonts' with the full OFL", () => {
    const file = readFileSync(
      `.output/${dir}/THIRD_PARTY_LICENSES.txt`,
      "utf8",
    );
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    for (const name of Object.keys(pkg.dependencies))
      expect(file).toMatch(new RegExp(`^${name} \\S+ \\(.+\\)$`, "m"));
    expect(file).toContain("Copyright 2014 The Nunito Project Authors");
    expect(file).toContain("Copyright 2016 The Inter Project Authors");
    expect(file).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });

  test("has no source maps", () => {
    const maps = readdirSync(`.output/${dir}`, { recursive: true }).filter(
      (file) => String(file).endsWith(".map"),
    );
    expect(maps).toEqual([]);
    expect(scriptsOf(dir)).not.toContain("sourceMappingURL");
  });

  test("leaves out the phone app's shim", () => {
    expect(existsSync(`.output/${dir}/langle-shim.js`)).toBe(false);
  });

  test("leaves out the phone app's Home", () => {
    expect(existsSync(`.output/${dir}/home.html`)).toBe(false);
  });

  test("requests no host permissions", () => {
    expect(manifest().host_permissions).toBeUndefined();
  });

  test("injects the article script everywhere and the video scripts on their sites only", () => {
    expect(
      manifest().content_scripts?.map(({ matches, js, world, run_at }) => ({
        matches,
        js,
        world,
        run_at,
      })),
    ).toEqual([
      {
        matches: ["<all_urls>"],
        js: ["content-scripts/content.js"],
        world: undefined,
        run_at: undefined,
      },
      // The page-world hooks must run before the sites' own scripts.
      {
        matches: ["*://www.netflix.com/*"],
        js: ["content-scripts/netflix-main.js"],
        world: "MAIN",
        run_at: "document_start",
      },
      {
        matches: ["*://www.netflix.com/*"],
        js: ["content-scripts/netflix.js"],
        world: undefined,
        run_at: "document_start",
      },
      {
        matches: ["*://www.youtube.com/*"],
        js: ["content-scripts/youtube-main.js"],
        world: "MAIN",
        run_at: "document_start",
      },
      // The mobile site, in every build (mobile-app.md "M3: m.youtube.com and touch").
      {
        matches: ["*://m.youtube.com/*"],
        js: ["content-scripts/youtube-mobile-main.js"],
        world: "MAIN",
        run_at: "document_start",
      },
      {
        matches: ["*://m.youtube.com/*"],
        js: ["content-scripts/youtube-mobile.js"],
        world: undefined,
        run_at: "document_start",
      },
      {
        matches: ["*://www.youtube.com/*"],
        js: ["content-scripts/youtube.js"],
        world: undefined,
        run_at: "document_start",
      },
    ]);
  });
});

describe("chrome-mv3 manifest specifics", () => {
  test("has a service worker and no Gecko settings", () => {
    const m = readManifest("chrome-mv3");
    expect(m.background?.service_worker).toBeDefined();
    expect(m.browser_specific_settings).toBeUndefined();
  });
});

/** Every script of the build, joined. */
const scriptsOf = (dir: string) =>
  readdirSync(`.output/${dir}`, { recursive: true, withFileTypes: true })
    .filter((file) => file.isFile() && file.name.endsWith(".js"))
    .map((file) => readFileSync(join(file.parentPath, file.name), "utf8"))
    .join("\n");

// Google's Web client lists the sign-in redirect of one extension id
// (src/background/sync/google-clients.ts).
describe("Google sign-in", () => {
  test("development and check builds keep the id dgabnakfehpeammboohlkafhhdegbffe", async () => {
    for (const dir of ["chrome-mv3-check", "langle-check"]) {
      const { key } = readManifest(dir);
      expect(key, dir).toBeDefined();
      // Chrome's id: the first 128 bits of the key's SHA-256, as letters a–p.
      const digest = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          Uint8Array.from(atob(key!), (c) => c.charCodeAt(0)),
        ),
      );
      const id = [...digest.slice(0, 16)]
        .flatMap((byte) => [byte >> 4, byte & 15])
        .map((n) => String.fromCharCode(97 + n))
        .join("");
      expect(id, dir).toBe("dgabnakfehpeammboohlkafhhdegbffe");
    }
  });

  // Every browser signs in through launchWebAuthFlow, so no build names a client for
  // getAuthToken, which would sign in only the browser profile's own account.
  test("the check build has no oauth2 and the development Web client", () => {
    expect(readManifest("chrome-mv3-check").oauth2).toBeUndefined();
    expect(scriptsOf("chrome-mv3-check")).toContain(
      "191564468385-i9mvko6iu5qpq1o8pkhtufudvu72nc36.apps.googleusercontent.com",
    );
  });

  // Production takes its id from the store, and the Web client lists that id's redirect.
  test.each(BUILDS)(
    "%s (production) has no key, no oauth2 and the Web client",
    (dir) => {
      const m = readManifest(dir);
      expect(m.key).toBeUndefined();
      expect(m.oauth2).toBeUndefined();
      expect(scriptsOf(dir)).toContain(
        "191564468385-i9mvko6iu5qpq1o8pkhtufudvu72nc36.apps.googleusercontent.com",
      );
    },
  );
});

// The self-reload (src/background/self-reload.ts), the error log and the settings
// channel (src/check/) of `npm run build:check` are dev only.
describe("check build", () => {
  const backgroundOf = (dir: string) =>
    readFileSync(`.output/${dir}/background.js`, "utf8");

  test.each(BUILDS)(
    "%s (production) has no self-reload and no build id",
    (dir) => {
      expect(backgroundOf(dir)).not.toContain("build-id");
      expect(existsSync(`.output/${dir}/build-id.txt`)).toBe(false);
    },
  );

  test.each(BUILDS)("%s (production) has no error log", (dir) => {
    const scripts = scriptsOf(dir);
    expect(scripts).not.toContain("langle:check-errors");
    expect(scripts).not.toContain("checkErrorLog");
  });

  test.each(BUILDS)("%s (production) has no settings channel", (dir) => {
    const scripts = scriptsOf(dir);
    expect(scripts).not.toContain("langle:check-settings");
    // Its refusal text, so a renamed message type cannot slip through.
    expect(scripts).not.toContain("is not an offered pair");
    // Nor the switch that refuses YouTube's tlang (src/check/refuse-tlang.ts).
    expect(scripts).not.toContain("checkRefuseTlang");
  });

  test("the check build answers settings requests in every content script", () => {
    for (const file of [
      "content-scripts/content.js",
      "content-scripts/youtube.js",
      "content-scripts/youtube-mobile.js",
      "content-scripts/netflix.js",
    ])
      expect(
        readFileSync(`.output/langle-check/${file}`, "utf8"),
        file,
      ).toContain("langle:check-settings");
    for (const file of [
      "content-scripts/youtube.js",
      "content-scripts/youtube-mobile.js",
    ])
      expect(
        readFileSync(`.output/langle-check/${file}`, "utf8"),
        file,
      ).toContain("checkRefuseTlang");
  });

  test("the check build records errors in the worker, every content script and the pages", () => {
    const dir = ".output/langle-check";
    const has = (file: string) =>
      readFileSync(`${dir}/${file}`, "utf8").includes("langle:check-errors");
    for (const file of [
      "background.js",
      "content-scripts/content.js",
      "content-scripts/youtube.js",
      "content-scripts/youtube-mobile.js",
      "content-scripts/netflix.js",
    ])
      expect(has(file), file).toBe(true);
    // The pages share their chunks: one of the popup's scripts has it.
    const popup = readFileSync(`${dir}/popup.html`, "utf8");
    const scripts = [...popup.matchAll(/(?:src|href)="\/([^"]+\.js)"/g)].map(
      (m) => m[1]!,
    );
    expect(scripts.some(has)).toBe(true);
  });

  test("npm run build:check writes the build id into .output/langle-check", () => {
    const path = ".output/langle-check/build-id.txt";
    if (!existsSync(path)) {
      throw new Error(`${path} not found. Build first: npm run build:check`);
    }
    expect(readFileSync(path, "utf8")).toMatch(/^\d{4}-\d\d-\d\dT\S+ \S+\n$/);
    expect(backgroundOf("langle-check")).toContain("build-id.txt");
    expect(readManifest("langle-check").manifest_version).toBe(3);
  });
});
