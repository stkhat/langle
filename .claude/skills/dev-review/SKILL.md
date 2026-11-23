---
name: dev-review
description: Langle's recurring review of how development itself went — reads the Claude Code transcripts, git history, tests and GitHub Actions runs since the last review, finds where time, tokens, CI minutes and failures went, and turns the top causes into merged improvements (refactors, test fixes, CI/CD changes, workflow and prompt changes, token savings that keep quality). Runs every 3 days from a Desktop scheduled task and by hand with /dev-review. Use it whenever the user says "dev review", "開発の振り返り", "効率化の見直し", "トークンの使い方を見直して", "CIを見直して", or asks why sessions are slow or costly. Not for the quality of what Langle shows learners (that is language-cycle / real-content-quality).
---

# The dev review

Every 3 days: **measure the window, fix the few biggest causes, log the rest**. Areas: sessions (friction and tokens), code (refactoring), tests, CI/CD.

State: [docs/notes/dev-reviews.md](../../../docs/notes/dev-reviews.md) (Current, Queue, one section per review). Token background: [docs/notes/token-usage.md](../../../docs/notes/token-usage.md). Signal meanings and false positives: [references/signals.md](references/signals.md).

## Rules (user decisions, 2026-11-22)
- **Performance over savings.** A token saving that is pure waste goes in. One that trades quality (model, effort, context cap, fewer judges or checks) needs evidence that quality holds; if a big drop is expected, drop it and log why; otherwise ask with the numbers at the end.
- Safe improvements go through to merged PRs without asking (memory: no confirmation; PR workflow). Design calls and trades are asked together at the end with one AskUserQuestion; never block the other steps on them.
- **Low priority on the machine.** Other sessions come first. Before anything heavy (`npm run verify`, test runs, builds, `--tests`), check `uptime` and the test lock (signals.md "Machine load"); if busy, do light steps first and come back.
- Triage and fix design on Opus (you); mechanical edits, CI fix-ups and doc sync in `model: "sonnet"` subagents.

## Step 0 — Orient
1. Read the log's "Current". A review in flight → resume at its recorded step.
2. Scheduled run and the last finished review is < 3 days old → add nothing, say so in one line, stop. A manual run always runs and resets the clock.
3. Start `r<NNN>`: `git fetch`, worktree from `origin/main` for the log PR; window = the last review's date → today (first review: 2026-11-20). Write "Current: r<NNN> in flight, step 1" in the log (uncommitted is fine).

## Step 1 — Collect (scripts; outputs to the scratchpad `r<NNN>/`)
```
python3 -I scripts/token-usage.py sessions --since <from>
python3 -I scripts/token-usage.py subagents --since <from>
python3 -I scripts/token-usage.py friction --since <from> --out <dir>/friction.json
python3 -I .claude/skills/dev-review/scripts/code-stats.py --since <from> --out <dir> [--tests]
python3 -I .claude/skills/dev-review/scripts/ci-stats.py --since <from> --out <dir>   # sandbox off (gh TLS)
```
- Compare with the previous review's numbers in the log (cost, Sonnet share, top subagents' turns and average context, errors, refusals, edit loops, wall time in verify/waits, CI runs per merged PR, CI failures).
- `--tests` (per-file test durations) only when the machine is quiet, at most every other review.

## Step 2 — Triage (you)
1. For each lead, open the real thing (the transcript lines via `jq`/`grep` on the jsonl, the code, the failed CI log) before believing it. Name the cause, not the symptom: a refusal storm is a brief or a path rule, an edit loop is a missing script, a slow test is a fixture.
2. Areas and what counts as a fix:
   - **Sessions**: CLAUDE.md, skill or brief text, a script that replaces a manual loop, a hook, settings, agent definitions.
   - **Code**: behaviour-preserving refactors of hot spots (high churn × size, repeated fix commits, duplicated logic); tests unchanged and passing.
   - **Tests**: slow or flaky tests, missing coverage where bugs came back, tests that pin implementation instead of behaviour (docs/testing.md).
   - **CI/CD**: reruns, failures, runs per PR, duration, cache misses, workflows nobody runs.
   - **Tokens**: classify each idea Waste or Trade (Rules).
3. Rank by expected saving (hours, tokens, CI minutes, failures avoided) × confidence ÷ cost. Pick at most 3, plus anything that got worse since the last review. Merge the rest into the log's Queue (no near-duplicates). Write the picks into the log now.

## Step 3 — Fix (one cause per PR)
- One background subagent per pick, its own worktree from `origin/main`, brief with the cause, evidence, files, done-when, and how to measure before → after. Model per Rules. Stop at ~150 turns / ~250k context with a handoff note.
- Draft PR → `npm run verify` (when the machine allows) → `gh pr ready` → `~/.claude/scripts/merge-when-green.sh --cleanup`. Before → after numbers in the PR body.
- Settings outside the repo (`~/.claude/settings.json`) and memory files: edit directly when the change is Waste; a Trade waits for the user's answer.
- A pick that cannot show a gain is recorded as Dropped with its numbers.

## Step 4 — Log and finish
1. The review section: window, the numbers table vs last review, picks with PRs and before → after, Dropped with reasons, Queue, "Current" back to idle with the date.
2. `docs/notes/token-usage.md` when the token picture changed; `docs/development.md` when a workflow changed.
3. The log PR: commit, push, draft PR, verify, ready, merge-when-green.
4. Trades and design calls → one AskUserQuestion with the measured options.
5. Clean up merged worktrees and branches, fast-forward local main, end with a short Japanese summary (what was found, what merged, what is queued, what needs the user).
