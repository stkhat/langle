# Dev reviews

Log of the `dev-review` skill ([.claude/skills/dev-review/SKILL.md](../../.claude/skills/dev-review/SKILL.md)): every 3 days, where development time, tokens, CI minutes and failures went, and what was changed.

## Current
r001 in flight, step 3 (fix): pick 1 below is not started yet (the machine was busy on 2026-11-22). Next review due 2026-11-25.

## Queue
- **Edit loops on one source file** (r001): one cloud-sync agent edited `src/background/term-store.ts` 60 times. Look at whether a test-first loop or one rewrite would have done; a lead only if it repeats.
- **Sonnet share is low** (r001: 3.8% of weighted cost; pair builds `tr-1`, `ko-1`, `th-1` ran ~265–297 Opus turns each). Which parts of a pair build are mechanical (rebuild with a decided recipe, doc sync) and could be split into a Sonnet step without losing the judgement steps? Trade: measure before proposing.
- **Inline-script tracebacks** (r001: 64 failed `python3` calls, mostly `python3 - <<EOF` one-offs). Covered by the step-brief change in r001; recheck in r002.

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
1. **Worktree-safe data paths** (Sessions, Waste): raw data read from the main checkout when the worktree has none, study and step outputs written inside the agent's own worktree, the step brief without the symlink instruction. Not started (machine busy).
2. **Step-brief Bash habits** (Sessions, Waste): scripts through Write and run as files, no heredocs or `cd … && git`, no `sleep` polling. Done in the PR that adds this skill.
3. **The flaky click test** (Tests): the press now ends where it was last seen pressed (stkhat/langle#224). Isolated Firefox runs 5/7 → 8/8 passing; full `verify` 0/2 → passing. Recheck its failures in r002's transcripts.

Dropped: none. Trades to ask: none yet.
