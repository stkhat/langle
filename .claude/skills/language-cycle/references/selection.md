# The selection check

When a learner selects several words: is the expression found, is its meaning right, and should the on-device AI's prompt change? No UI evaluation (layout, flicker, latency): out of scope by the user's choice (2026-11-22).

`S` below is `data/raw/quality/cycles/<cycle>/selection` in this session's checkout (git-ignored; judges write only there). Run everything from the checkout's root; `K` is `.claude/skills/language-cycle/scripts`.

## When
- **Offline part and judged sample**: every cycle.
- **On-device AI part**: when the prompt (`src/core/explain/prompt.ts`), the phrase data or the matcher changed, or every other cycle. Chrome not connected: skip it and say so in the log.

## Items (frozen; remade only with a new corpus)
```
npx jiti $K/selection-items.ts --units=<a sweep's units folder> --findings=<a sim folder> --out=$S/items [--from=<previous cycle>/selection/items]
```
Per learning language, seeded: dictionary phrases selected exactly, with a word too many, shifted by a word, with a word missing; controls no phrase touches; expressions learners reported as `missed-expression`, whole and off by a word. With `--from`, the previous items stay and only new reports are added. A split by expression: 30% dev, 70% test.

## Offline
```
npx jiti $K/selection-check.ts --items=$S/items --out=$S/offline
python3 -I $K/selection-packets.py make --run offline=$S/offline --tag offline --out $S
# one judge agent per packet: packet path, RUBRIC.txt path, result path (packets/result-<packet file>)
python3 -I $K/selection-packets.py tally --tag offline --out $S
python3 -I $K/selection-compare.py --before <previous cycle>/selection --after $S --out $S/compare.md
```
Langle's own snapping, `matchSelection` and card over every offered pair, one after another (about 10 s). Read `offline/summary.md` (with "Why not" and examples) and `judged-offline.md`. WORSE (exit 2) becomes a pick; CHECK is looked at in the rows first. Causes become queue candidates by layer, as in step 3.

What the numbers do not say:
- Exact selections and controls are right **by construction** on the commit the items were made on (the matcher made them): they guard against regressions. Whether a matched phrase is really that expression in its sentence is only in the judged sample.
- "Checker would take the phrase" is the most a proposal could recover, not what the model does.
- Literal machine translations are counted, not judged (the browser makes them). An English definition is judged for its sense, not as translated.
- The judged sample is one judge and 50 rows per pair, mostly exact selections: a few points are noise.

## On-device AI (the user's Chrome, Claude in Chrome)
Eight pairs: the offered ones whose native is ja, en, es, de or fr. Only English learning asks for a phrase proposal (`selectedNote`); the other pairs measure the meaning only.

1. Batches, if not there yet: `npx jiti $K/selection-nano.ts --do=batches --offline=$S/offline --out=$S/nano`
2. Probe build into the folder loaded in Chrome (it reloads itself; like step 7 it writes to the main checkout, so with the sandbox off):
   `npx jiti $K/selection-probe-build.ts --into=<main checkout>/.output/langle-check`
3. Server, in the background with the sandbox off (it binds 127.0.0.1:8766):
   `python3 -I $K/selection-server.py --dir $S/nano`
4. In Claude in Chrome, in a new tab: `http://127.0.0.1:8766/` lists the batches. Open `/run/shipped-test-<pair>`, keep the tab in front, and wait until the page (and tab title) starts with `done` or `stopped`. **One batch at a time.**
   - "no probe": the build has not reloaded; wait a few seconds and reload the page.
   - "the model is downloadable / unavailable": stop and tell the user; the probe never downloads a model.
   - Stopped on errors, or a closed tab: open the same page again; it asks only what has no answer.
5. Answers are saved one by one in `$S/nano/results/`. When every batch is done:
   `npx jiti $K/selection-nano.ts --do=score --offline=$S/offline --out=$S/nano`
   It refuses answers of another prompt than the checkout's. `offered` / `correct` / `wrong` are in `nano/scores-shipped-test.md`.
6. Judge the "In this sentence" meanings (then one judge per packet, and `tally --tag ai`):
   `python3 -I $K/selection-packets.py make --run ai=$S/nano/answers-shipped-test --pairs en-ja,en-es,de-fr,es-en,fr-en --tag ai --out $S`
7. Always, also after a stop: stop the server, close the tab, and put the plain check build back:
   `npx jiti $K/selection-probe-build.ts --into=<main checkout>/.output/langle-check --restore=1`
   Then, on a page Langle runs on, read, explain and clear the check build's error log ([development](../../../../docs/development.md) "Checking in your own Chrome"). The probe's pages have no log channel.

## A prompt change
The shipped prompt stays unless a candidate beats it.
1. A candidate is a checkout with its `prompt.ts`; build the probe from it, use its own `--label` (lower case, digits) in `--do=batches` and `--do=score`, and score with `--repo=<that checkout>`.
2. Tune on `--split=dev` only, shipped and candidate on the same items.
3. Freeze the prompt, then run `--split=test` once. No tuning after it.
4. Judge blind, mixed: `selection-packets.py make --run shipped=$S/nano/answers-shipped-test --run <label>=$S/nano/answers-<label>-test --tag ab`.
5. Precision before recall. A proposal only when the dictionary lists it stays unless a measured prompt beats that rule.

## Keep the data
Before the worktree goes, copy `$S` to the main checkout's `data/raw/quality/cycles/<cycle>/selection` and compare the file counts.
