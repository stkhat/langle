// The builds E2E loads, each as a copy whose manifest grants the test server's host.
// Langle runs articles only on hosts the user turned on (architecture.md "Site access"),
// and Playwright cannot answer Chrome's prompt (docs/notes/site-access.md "8"): a host
// in `host_permissions` is granted from the install, so the background registers the
// article script there at start-up as it would after the prompt. 127.0.0.1 serves the
// same pages without a grant.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Which build to load: `npm run build` (production), `wxt build --mode check` (the
 * build loaded in your own Chrome, with WXT's dev logging and the self-reload), or
 * `npm run build:check-download` (the check build without the self-reload, whose
 * language data comes from the local mirror in serve.ts; see .env.check-download). The
 * other builds download from the lock's mirrors, which pack-mirrors.ts answers.
 * Production closes the shadow roots of Langle's UI on web pages, so Playwright cannot
 * reach into it there: tests that drive the UI use a check build.
 */
export type Build = "production" | "check" | "download";

export const BUILDS: Record<Build, { dir: string; command: string }> = {
  production: { dir: "chrome-mv3", command: "npm run build" },
  check: { dir: "chrome-mv3-check", command: "wxt build --mode check" },
  download: {
    dir: "chrome-mv3-check-download",
    command: "npm run build:check-download",
  },
};

/** The hosts the copies grant: the test server's, and the real sites' when they run. */
export const GRANTED_HOSTS = [
  "*://localhost/*",
  ...(process.env.LANGLE_REAL_SITES
    ? ["*://en.wikipedia.org/*", "*://www.bbc.com/*"]
    : []),
];

const OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.output",
);

/** The built folder. */
const builtPathOf = (build: Build) => path.join(OUTPUT, BUILDS[build].dir);

/** The copy E2E loads (`grantTestHosts`). */
export const extensionPathOf = (build: Build) =>
  path.join(OUTPUT, "e2e", BUILDS[build].dir);

/**
 * Copies each build there is into `.output/e2e/`, with `GRANTED_HOSTS` as its
 * `host_permissions`. Playwright's global setup, so the copies follow the last build.
 */
export default function grantTestHosts(): void {
  for (const build of Object.keys(BUILDS) as Build[]) {
    const from = builtPathOf(build);
    const to = extensionPathOf(build);
    fs.rmSync(to, { recursive: true, force: true });
    if (!fs.existsSync(path.join(from, "manifest.json"))) continue;
    fs.cpSync(from, to, { recursive: true });
    const file = path.join(to, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
      string,
      unknown
    >;
    manifest.host_permissions = GRANTED_HOSTS;
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  }
}
