# Dev reviews

Log of the `dev-review` skill ([.claude/skills/dev-review/SKILL.md](../../.claude/skills/dev-review/SKILL.md)): every 3 days, where development time, tokens, CI minutes and failures went, and what was changed.

## Current
Idle. r002 finished on 2026-11-25. Next review due 2026-11-28.

## Queue
- **Edit loops on one source file** (r001, repeated in r002): r001 one agent edited `src/background/term-store.ts` 60 times; r002 the M3d video-UI agent edited `src/content/video/VideoUi.tsx` 58, `mount.tsx` 48 and `Transcript.tsx` 40 times (layout tuning against device screenshots). Two reviews in a row: next time read that agent's loop and see whether a scripted screenshot → compare step (one call per round) or a rewrite per round would cut it.
- **Sonnet share is low** (r001 4.0%, r002 4.8% of weighted cost; the mobile milestones M0–M4 ran 100–528 Opus turns per agent, 10 agents over 150). Which parts are mechanical (device check runs, doc sync, PR fix-ups) and could be a Sonnet step without losing the judgement steps? Trade: measure before proposing.
- **`en-ja` does not rebuild as committed** (found in r001): `node scripts/data/ejdict.ts` on main at 8348933, on inputs identical to the main checkout's, changes `quarter horse`'s short meaning and moves `unionism` across a shard boundary (`dict-3.json`, `dict-4.json`, `index.json`). Find the change that was not followed by a rebuild; consider a check for it.
- **`--cleanup` deletes git-ignored study data** (r001): `merge-when-green.sh` removes a worktree that is clean to `git status --porcelain`, which hides `data/raw/quality`. The briefs now say copy first; a check in the script itself (outside the repository) would be safer.
- **A browser crash leaves `core` in the checkout** (r001: one Firefox crash in Docker while another session's Android emulator started). The Firefox lane is gone since stkhat/langle#262, so this waits until a Chromium crash shows it again; the fix would still be `--ulimit core=0` in the container.

## r002 — 2026-11-25 (window 2026-11-22 → 2026-11-25)
22 sessions, 112 subagents. Mostly the mobile app (M0–M4f, ~17 PRs) and language-cycle c001–c003. main's history was rewritten on 2026-11-25 to drop recorded caption fixtures (PRs on the old history were closed).

| | r002 | r001 |
| --- | --- | --- |
| Weighted tokens | 194M (71% subagents) | 342M (90% subagents) |
| Sonnet + Haiku share | 5.0% | 4.0% |
| Top subagents | 100–528 turns, ~170–194k avg / 268k max context, every agent over 150 turns compacted | ~170k avg / 267k max |
| Tool errors / refusals | 370 / 27 | 599 / 74 |
| Worktree-guard refusals in subagents | 141 (60 too-complex commands, 47 git in complex commands, 12 `source`/`.`/`eval`, 11 writes to the shared checkout, 4 `cd` to it) | ~270 |
| Refused writes to the main checkout's `data/raw` | 11 | 135 |
| Failed inline `python3` scripts | 23 | 64 |
| Wall time sleeping in poll loops | 1.7 h (443 calls) | 4.5 h |
| CI runs per merged PR | 0.90 (46 real runs, 42 skipped drafts, 51 PRs), median 4.9 min, 4 failures | 1.07, 3.6 min, 2 failures |

Findings:
- **r001's picks held.** Worktree-safe raw data (stkhat/langle#237) cut refused `data/raw` writes 135 → 11; the step-brief habits cut failed inline scripts 64 → 23; the flaky click test is gone with the Firefox lane (stkhat/langle#262).
- **The remaining guard refusals come from briefs without the habits.** They are spread 3–9 per agent across ~40 agents, mostly orchestrator-written briefs (mobile app, language expansion) that never saw `step-brief.md`; 12 are `source scripts/mobile/env.sh`, which docs/development.md tells agents to run.
- **Every CI failure was the Dependabot npm group** (stkhat/langle#245, 4 runs): it bumps `@playwright/test`, but the container image tag is written by hand in two workflows, so the image check fails until someone edits them.
- **Untracked local notes break `verify`**: `MANUAL-TASKS.md` / `HANDOFF.md` in a checkout fail `prettier --check .` (4 runs).
- CI median rose 3.6 → 4.9 min with the `langle-app` build and phone E2E; not a lead yet.
- Code: hot spots are the new mobile UI (`Home.tsx`, `Welcome.tsx`, `VideoUi.tsx`) and big browser test files, all new work by design. `dictionary.ts` had no fix commits this window, so it leaves the radar.

Picks:
1. **CI image from the lockfile** (CI/CD, Waste): a first `image` job prints the tag from `package-lock.json` and `ci` / `cache.yml` run in `${{ needs.image.outputs.image }}`; the hand-written tags and their check step are gone (stkhat/langle#282). Before: each Playwright bump needed 4 lines edited in 2 workflows and failed CI until then (4 failed runs); after: 0, for 27 s of extra job per run. A real Dependabot bump has not gone through yet; recheck in r003.
2. **Worktree-safe Bash habits for every agent** (Sessions, Waste): a "Bash in a worktree" rule in CLAUDE.md (every agent reads it, not only step briefs), `scripts/mobile/env.sh <command>` runs a command with the Android env instead of being sourced, and `MANUAL-TASKS.md` / `HANDOFF.md` git-ignored (stkhat/langle#281). Before: 141 guard refusals in 3 days (~3.5 per worktree agent); after: counted in r003.

Dropped: none. Trades to ask: none.

## r001 — 2026-11-22 (window 2026-11-20 → 2026-11-22)
First review; baseline for the next ones. 14 sessions, 322 subagents.

| | r001 | before (2026-11-07 → 11-20) |
| --- | --- | --- |
| Weighted tokens | 342M (90% subagents) | 80% subagents |
| Sonnet + Haiku share | 4.0% | < 1% |
| Top subagents after the 300k cap | ~170k avg / 267k max context, 2 compactions each | 300–490k avg, peaks 600–800k |
| Tool errors / refusals | 599 / 74 | – |
| Worktree-guard refusals in subagents | ~270 (158 writes outside the worktree, 111 commands too complex to check) | – |
| Wall time sleeping in poll loops | 4.5 h (24 `sleep` calls blocked) | – |
| CI runs per merged PR | 1.07 (94 real runs, 70 skipped drafts, 88 PRs), median 3.6 min, 2 failures | – |

Findings:
- **The 300k auto-compact works.** The three subagents that ran to 600–685k without a compaction all started before the setting changed on 2026-11-20 (05:36 and 09:35 UTC); every long agent since compacts at ~267k.
- **Briefs send subagents outside their worktree.** The step brief says to keep step outputs in `data/raw/quality/<study>/steps/…` and to symlink the main checkout's `data/raw`, but agents in their own worktree may neither write to the main checkout (158 refused writes: learner findings, packets, step outputs) nor create the link (refused). `scripts/data/common.ts` resolves `RAW_DIR` from the checkout itself, so a worktree without the link has no raw data.
- **Heredoc scripts and `cd … && git` are refused by the worktree guard** (111): `cat > f <<EOF`, `python3 - <<EOF`, `S=… ; …`. Writing the script with Write and running the file passes.
- **Polling with `sleep`** is blocked and wastes turns; background runs notify on their own.
- **A flaky Firefox browser test** (`VideoPanel.browser.test.tsx`, a word's click after hover/unhover) failed in about 31 `verify` runs across 15 sessions and agents since the word-selection change of 2026-11-19, and in both of this review's first `verify` runs. Cause: `text-selection.ts` ended a press at the position of a `pointermove` without the button, and Firefox can deliver the approach move after the press, so the click became a drag and was swallowed.
- **CI is healthy**: drafts are skipped in ~2 s, almost every PR runs CI once, failures were 1 E2E and 1 browser test, plus 2 `packs.yml` publish failures.
- Code: hot spots are the data recipes (`scripts/data/recipes/recipe.ts`, `learning-kaikki.ts`) and `src/core/lexicon/dictionary.ts` (23 commits, 4 fix commits in the window). No refactor picked this time: the recipe churn is language growth by design; `dictionary.ts` goes to the next review if the fix commits continue.

Picks:
1. **Worktree-safe data paths** (Sessions, Waste): raw data read from the main checkout when the worktree has none, study and step outputs written inside the agent's own worktree, the step brief without the symlink instruction. Done (stkhat/langle#237), with clones rather than a fallback path, so no data script changed and no script writes into the main checkout: `npm run data:raw` gives a worktree copy-on-write copies of the raw files (353 files, 36 GB, in 1.0 s with no disk used). A probe Write to `data/raw/quality/…/steps/` from a worktree session passed; the drop from 135 refusals is not measured until r002.
2. **Step-brief Bash habits** (Sessions, Waste): scripts through Write and run as files, no heredocs or `cd … && git`, no `sleep` polling. Done in the PR that adds this skill.
3. **The flaky click test** (Tests): the press now ends where it was last seen pressed (stkhat/langle#224). Isolated Firefox runs 5/7 → 8/8 passing; full `verify` 0/2 → passing. Recheck its failures in r002's transcripts.

Dropped: none. Trades to ask: none yet.
