import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { expect, it } from "vitest";
import { playwrightImage } from "./playwright-image.ts";

const workflows = join(import.meta.dirname, "../.github/workflows");
const require = createRequire(import.meta.url);

it("names the image of the installed @playwright/test", () => {
  const { version } = require("@playwright/test/package.json") as {
    version: string;
  };
  expect(playwrightImage()).toBe(
    `mcr.microsoft.com/playwright:v${version}-noble`,
  );
});

// The image comes from the lockfile at run time; a literal tag would go stale on the
// next Playwright bump (Dependabot cannot edit workflows).
it("no workflow hard-codes a Playwright image tag", () => {
  for (const file of readdirSync(workflows))
    expect(readFileSync(join(workflows, file), "utf8")).not.toMatch(
      /mcr\.microsoft\.com\/playwright:/,
    );
});
