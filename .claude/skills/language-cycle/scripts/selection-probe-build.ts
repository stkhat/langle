// A throwaway check build with the selection check's Nano probe (references/selection.md),
// copied into the folder that is loaded unpacked, and the plain check build back after.
//
//   npx jiti .claude/skills/language-cycle/scripts/selection-probe-build.ts \
//     --into=<folder of the loaded check build>
//   npx jiti .claude/skills/language-cycle/scripts/selection-probe-build.ts \
//     --into=<the same folder> --restore=1
//
// Builds the checkout it lies in: a prompt variant is a checkout with that prompt. The
// probe's entrypoint exists only while the build runs, and is never committed.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildId, syncBuild } from "../../../../scripts/build-check.ts";
import { readJson, setting, shortSha } from "../../real-content-quality/scripts/common.ts";

const REPO = resolve(import.meta.dirname, "../../../..");
const ENTRY = join(REPO, "src/entrypoints/selection-probe.content.ts");
const into = setting("into");
if (!into) throw new Error("Set --into");
const to = resolve(into);
const probe = setting("restore") === undefined;

// syncBuild deletes what the build does not have: only ever into a Langle build.
if (existsSync(to) && readdirSync(to).length > 0) {
  const manifest = join(to, "manifest.json");
  if (!existsSync(manifest) || (readJson(manifest) as { name?: string }).name !== "Langle")
    throw new Error(`${to} holds something other than a Langle build`);
}

// One left by a build that was killed would also get into a plain build.
rmSync(ENTRY, { force: true });
try {
  if (probe)
    writeFileSync(
      ENTRY,
      `// Throwaway (selection-probe-build.ts): never commit.
import { startProbe } from "../../.claude/skills/language-cycle/scripts/selection-probe";

export default defineContentScript({
  matches: ["http://127.0.0.1/run/*"],
  main: () => startProbe(),
});
`,
    );
  execFileSync(join(REPO, "node_modules/.bin/wxt"), ["build", "--mode", "check"], {
    cwd: REPO,
    stdio: "inherit",
  });
} finally {
  rmSync(ENTRY, { force: true });
}

const id = buildId(new Date(), `${shortSha(REPO)}${probe ? " selection-probe" : ""}`);
syncBuild(join(REPO, ".output/chrome-mv3-check"), to, id);
console.log(`${to} updated (build ${id})`);
