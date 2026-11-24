# Dev review signals

What each collected number means, when it is a lead, and known false positives.

## Machine load
- `uptime` load average above the core count (`sysctl -n hw.ncpu`) or another session's `verify` / Playwright running (`ps -Ao pcpu,command | sort -rn | head`) → the machine is busy. `sysctl` and `ps` need the sandbox off; `uptime` works inside it. `verify` takes a machine-wide lock (`scripts/test-lock.ts`) and a second run just waits, but a busy machine slows everyone's runs: do light steps first.
- Test durations measured on a busy machine are not comparable; note the load next to them.

## Sessions (`token-usage.py friction`)
- **Refusals** (`refusal` bucket: not permitted, denied, refused, sandbox, permission): a storm of the same refusal in subagents usually means a brief named a path outside the agent's worktree, or a script writes into the main checkout. Fix the brief template or the script's output path, not the agent.
- **Tool errors**: `Edit` "No changes to make" / "String not found" in bulk → the agent edits from stale memory of the file; `Bash script (python3)` tracebacks from inline `-c`/heredoc scripts → a script file worth keeping. MCP browser timeouts are site-side and only a lead when they repeat on the same step.
- **Edit loops** (≥ 20 edits of one file in one agent): iterating on a heuristic by hand; a scripted measure → edit → re-measure loop or one rewrite with Write is the fix.
- **Re-reads** (same file and offset ≥ 3): context pressure or a compaction lost it; few is normal.
- **Repeated failing calls** (same input failing ≥ 3 times): retrying instead of reading the error.
- **Long subagents** (> 150 turns or > 250k average context) and their compactions: 0 compactions above 300k means the auto-compact cap did not apply to that agent; find out why before anything else (agent type, model string, when the setting changed).
- **Wall time in tools**: `wait/poll loop` hours are sessions sleeping on CI or other agents; `verify` hours include waiting for the lock. Compare per merged PR, not in total.
- **Corrections** (parent sessions: 違う, やめて, interrupts …): read each; a real correction is a lead for CLAUDE.md or memory. Plain instructions that happen to match are false positives.
- **ToolSearch ≥ 3 in one agent**: tools loaded one by one; the brief should name the tools to load in one call.

## Tokens (`token-usage.py sessions|subagents`)
- Weighted shares compare like cost (docs/notes/token-usage.md). Watch: subagent share, Sonnet share, the top 20 subagents' turns and average context, median first context (start-up size).
- Waste vs Trade: Waste changes nothing the model decides (smaller outputs, fewer reloads, scripts instead of inline code, one rewrite instead of many edits). Trade changes the model, effort, context cap or the number of checks/judges; it needs a blind A/B (`judge` agent) on a past task or a strong argument, and the user's answer.

## Code (`code-stats.py`)
- **Hot spots**: churn × √size since the window start. A big file with many commits and fix commits is a refactor candidate only if the churn is spread across unrelated concerns (read the log); data recipes that grow by design are not.
- **Untested src files over 80 lines**: a lead only when bugs were fixed in them in the window or they hold logic (UI shells and test helpers are fine).

## Tests
- Per-file durations (`--tests`): the slowest files and those that grew most since the last measurement. A flaky test is one that failed and passed on the same commit (CI reruns, verify reruns in transcripts).

## CI/CD (`ci-stats.py`)
- `skipped` runs are drafts (the job's `if` skips them, ~2 s each); they are not counted as runs.
- Runs per merged PR above ~1.3 means pushes after `ready` re-ran CI; check whether those pushes were avoidable (fix-ups that verify would have caught).
- Failures: the failed step and whether `verify` should have caught it (then the gap is in `verify`, not CI).
- Billable minutes read 0 while the repository is public; then watch total minutes instead.
- Workflows with no runs for a long time are not a problem by themselves (manual ones are meant to be rare).
