// The Playwright Docker image for the @playwright/test locked in package-lock.json: its
// browsers are the builds that version drives. CI runs in it: the `image` job in
// .github/workflows/ci.yml and cache.yml runs this file and passes the line it prints to
// the job's container, so a Playwright bump needs no workflow edit. It reads the lockfile
// (not node_modules) so that job needs no `npm ci`.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function playwrightVersion(): string {
  const lock = JSON.parse(
    readFileSync(join(import.meta.dirname, "../package-lock.json"), "utf8"),
  ) as { packages: Record<string, { version?: string }> };
  const version = lock.packages["node_modules/@playwright/test"]?.version;
  if (!version) throw new Error("@playwright/test is not in package-lock.json");
  return version;
}

export function playwrightImage(): string {
  return `mcr.microsoft.com/playwright:v${playwrightVersion()}-noble`;
}

if (import.meta.main) console.log(playwrightImage());
