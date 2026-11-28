---
name: refactor
description: Whole-codebase refactoring and clean-up for Langle with no change in behaviour — delete dead code, tidy directories, share and simplify functions, untangle messy logic, speed up hot paths, cut comments to the decisions, move what unit tests can cover out of E2E, trim stale or bloated docs, and sort Claude's project memory into what moves to the repo and what stays. Runs by hand with /refactor, optionally with an area (e.g. /refactor src/content, /refactor tests). Use it whenever the user says "リファクタリングして", "コードを整理して", "クリーンアップして", "デッドコードを消して", "メモリを整理して", or asks for a general tidy of the code, tests or docs. Not the per-language rule tidy (language-cycle) or the hot-spot fixes of a dev review (dev-review).
---

# Refactor and clean up

**Nothing a user can see or do changes.** The goal is code that is easier to maintain and, where it is measured, faster. Tests are the safety net, so don't be afraid to simplify or delete: if behaviour stays the same and the tests pass, smaller wins.

Scope: the whole repo, or only the area given as the argument.

## What to do
- **Dead code**: delete unused exports, files, branches, flags and fallbacks (`npm run check` runs knip; also look for code only tests reach).
- **Structure**: tidy directories so the layout matches [architecture](../../../docs/specs/architecture.md); update that doc if the layout moves.
- **Sharing and simplicity**: merge duplicate logic into one function, flatten tangled conditionals, replace special cases with the general rule (CLAUDE.md "Fix the class").
- **Performance**: only on paths that matter (page load, hover, subtitle updates, pack loading). Measure before and after; keep a change only if it is faster or the same and simpler.
- **Comments**: super succinct. Delete any comment that says what the code already says. Keep only decisions, reasons, and facts the code cannot show (measured site behaviour, browser quirks, why not the obvious way).
- **Tests**: anything a unit test can check goes in a unit test; keep E2E and browser tests to what needs a real browser, and make them lighter. Making a test faster while it checks the same things (shorter waits, shared setup, E2E → unit) needs no asking. Removing a test or narrowing what it checks is the user's call (see "Slow tests that give little").
- **Docs**: update stale docs; cut old content out of long ones, or split them so a session reads only what it needs (keep CLAUDE.md under its limit).
- **Claude's memory**: sort the project memory (see "Memory: repo or memory").

## How to run it
1. **Check for overlap.** List the other sessions and open PRs (`mcp__ccd_session_mgmt__list_sessions`, `gh pr list`). If one is already working on docs or on the files in scope, leave those out and say so.
2. **Survey and plan.** Read the area, then write a short plan of phases, one theme per phase (e.g. dead code → shared helpers → tests → docs), each small enough for one PR. Put phases that touch the same files in order; phases that don't can run in parallel (≤3).
3. **One phase per subagent** to keep the context clean (memory: orchestrator + subagents). Give each its phase brief plus the rules above. Use `model: "sonnet"` for mechanical work (deleting, moving, renaming, doc trims) and Opus for redesigning logic. Each subagent works on its own branch, runs the touched tests while iterating and `npm run verify` before pushing, opens a draft PR, and stops at `gh pr ready`.
4. **Merge** each green PR (memory: PR workflow), rebase the next phase on top, and clean up worktrees and branches.
5. **Ask** about slow tests and memory moves (below) once, at the end, with one AskUserQuestion; never hold the other phases for it. Apply the answers as one more phase.
6. **Report** in chat (Japanese): what each phase removed or changed (lines, files, test time before → after), what was left and why.

## Slow tests that give little
Time the suites: Vitest per file with `python3 -I .claude/skills/dev-review/scripts/code-stats.py --since <date> --out <dir> --tests` (heavy: check the machine first), Playwright per test with its JSON reporter. For each test that costs a lot of time, gather:
- its time (and share of the suite);
- what it checks, and whether another test already checks the same;
- whether it ever failed on a real bug (git history: the fix commit that made it pass), counted apart from flaky failures;
- the proposal — delete, simplify (say what stops being checked), or keep — and what would be lost.

Candidates go to the user as that list; nothing is deleted or narrowed without a yes.

## Memory: repo or memory
The project memory is the folder named in the system prompt's "Memory" section (index `MEMORY.md`, loaded every session, so keep it short). Read every file and sort each one:
- **Move to the repo** when it is about the project and any session or contributor needs it: workflow rules, test policy, conventions, design decisions, measured site behaviour. Its home is the doc that owns the topic (CLAUDE.md, docs/development.md, docs/testing.md, docs/specs/, docs/notes/), in English; then the memory file goes, or keeps only what is private.
- **Keep in memory** what is about the user and how they work with Claude (preferences, corrections, what they approve without asking), and anything private or not for a public repo: personal details, accounts and profiles, emails, name and trademark searches, store or business plans.
- **Trim or delete** what the repo already says (CLAUDE.md, docs, git history), finished work that only repeats PR history, and facts that are no longer true (check the files and flags they name).

Merging duplicates, fixing facts checked against the repo, and shortening `MEMORY.md` lines need no asking. Moving a memory into the repo (it is public) or deleting one is the user's call: list each with its file, the proposal, the target doc, and one line on why. Edit memory files with Write/Edit (the sandbox blocks shell writes there) in the main session; moves into docs ride in a docs-only PR.

## Don'ts
- No new features, no UI or copy changes, no changes to stored data formats (sync, IndexedDB, export).
- Don't touch per-language rule data in packs (that is the language-cycle tidy).
- Don't loosen or delete a test without the user's yes, unless what it checks is covered elsewhere; then say where.
