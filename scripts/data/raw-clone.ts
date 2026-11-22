// Gives a worktree its own data/raw: copy-on-write clones of the main checkout's raw
// files, which take no space and no time until written to. A link to the main checkout's
// folder would put whatever the worktree writes there (study outputs, rebuilt caches)
// into the main checkout.
//
// Usage: npm run data:raw   (in the worktree; again later adds only the files it lacks)
// Study data (data/raw/quality) is not cloned: read it in the main checkout, and write
// this worktree's own outputs under its own data/raw/quality.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ROOT } from "./common.ts";

// Node's COPYFILE_FICLONE does not clone on macOS, so `cp` does it.
const CLONE = process.platform === "darwin" ? "-c" : "--reflink=auto";

/** Clones the files under `from` that `to` lacks; returns how many. Overwrites none. */
export function cloneRaw(from: string, to: string): number {
  if (lstatSync(to, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new Error(`${to} is a link: remove the link, then run this again`);
  let cloned = 0;
  const clone = (dir: string) => {
    for (const entry of readdirSync(join(from, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (path === "quality" || entry.name === ".DS_Store") continue;
      if (entry.isDirectory()) {
        clone(path);
      } else if (!existsSync(join(to, path))) {
        mkdirSync(dirname(join(to, path)), { recursive: true });
        execFileSync("cp", [CLONE, join(from, path), join(to, path)]);
        cloned++;
      }
    }
  };
  clone("");
  return cloned;
}

function main() {
  const common = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  const checkout = dirname(common);
  if (resolve(checkout) === ROOT) {
    console.log("This is the main checkout: its data/raw is the original");
    return;
  }
  const from = join(checkout, "data", "raw");
  const to = join(ROOT, "data", "raw");
  console.log(`${cloneRaw(from, to)} files cloned from ${from}`);
}

if (import.meta.main) main();
