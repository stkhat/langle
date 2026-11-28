// git pre-push hook: a branch may be pushed only once `npm run verify` passed on the tree
// it pushes (scripts/verify.ts records each tree it passed on). Tags and deletions pass.
// A push that changes only docs (docs/**, *.md: nothing a build or test reads) needs only
// their formatting and the CLAUDE.md line limit, checked on the pushed content.
// In an emergency, `git push --no-verify` skips it.
// stdin: one "<local ref> <local sha> <remote ref> <remote sha>" line per ref pushed.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { CLAUDE_MD_LIMIT, countLines } from "./check-claude-md.ts";
import { readVerified } from "./verify.ts";

const ZERO = /^0+$/;

interface Pushed {
  ref: string;
  sha: string;
  /** What the remote branch was, or null for a new branch. */
  remote: string | null;
}

/** The commits a push needs verified: branch updates that change something. */
export function pushedCommits(stdin: string): Pushed[] {
  const commits: Pushed[] = [];
  for (const line of stdin.split("\n")) {
    const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
    if (!localRef || !localSha || !remoteRef) continue;
    if (ZERO.test(localSha)) continue; // deleting a remote branch
    if (!remoteRef.startsWith("refs/heads/")) continue; // tags
    if (localSha === remoteSha) continue; // already there
    commits.push({
      ref: remoteRef.slice("refs/heads/".length),
      sha: localSha,
      remote: remoteSha && !ZERO.test(remoteSha) ? remoteSha : null,
    });
  }
  return commits;
}

/** A path no build or test reads. */
export const isDocPath = (path: string) =>
  path.startsWith("docs/") || path.endsWith(".md");

function gitRaw(args: string[]): string | null {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout : null;
}

const git = (args: string[]) => gitRaw(args)?.trim() ?? null;

const treeOf = (sha: string) => git(["rev-parse", `${sha}^{tree}`]);

/**
 * What the push changes against what was already accepted: the remote branch when the
 * push extends it (that push passed this hook), else where the branch left main.
 */
function changedFiles({ sha, remote }: Pushed): string[] | null {
  const extendsRemote =
    remote !== null &&
    spawnSync("git", ["merge-base", "--is-ancestor", remote, sha]).status === 0;
  const base = extendsRemote
    ? remote
    : (git(["merge-base", sha, "origin/main"]) ??
      git(["merge-base", sha, "main"]));
  if (!base) return null;
  const out = git(["diff", "--name-only", "--no-renames", base, sha]);
  return out === null ? null : out.split("\n").filter(Boolean);
}

/** Problems in the changed docs as pushed; deleted files have none. */
async function docProblems(sha: string, files: string[]): Promise<string[]> {
  const problems: string[] = [];
  for (const file of files) {
    const content = gitRaw(["show", `${sha}:${file}`]);
    if (content === null) continue;
    if (basename(file) === "CLAUDE.md" && countLines(content) > CLAUDE_MD_LIMIT)
      problems.push(`${file}: over ${CLAUDE_MD_LIMIT} lines`);
    const info = await prettier.getFileInfo(file, {
      ignorePath: ".prettierignore",
    });
    if (info.ignored || !info.inferredParser) continue;
    const options = await prettier.resolveConfig(file);
    if (!(await prettier.check(content, { ...options, filepath: file })))
      problems.push(`${file}: not formatted (npx prettier --write ${file})`);
  }
  return problems;
}

async function main(): Promise<number> {
  const verified = new Set(readVerified());
  let failed = false;
  for (const pushed of pushedCommits(readFileSync(0, "utf8"))) {
    const tree = treeOf(pushed.sha);
    if (tree && verified.has(tree)) continue;
    const files = changedFiles(pushed);
    const label = `${pushed.ref} (${pushed.sha.slice(0, 7)})`;
    if (files && files.every(isDocPath)) {
      const problems = await docProblems(pushed.sha, files);
      for (const problem of problems) console.error(`${label}: ${problem}`);
      failed ||= problems.length > 0;
      continue;
    }
    console.error(`${label}: npm run verify has not passed on this tree`);
    failed = true;
  }
  if (failed)
    console.error("Fix the above (or run `npm run verify`), then push again.");
  return failed ? 1 : 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(await main());
}
