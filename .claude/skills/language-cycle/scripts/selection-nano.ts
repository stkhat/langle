// The selection check's on-device AI part, around the probe (references/selection.md):
// the batches the probe asks, and what its answers are worth.
//
//   npx jiti .claude/skills/language-cycle/scripts/selection-nano.ts --do=batches \
//     --offline=<cycle>/selection/offline --out=<cycle>/selection/nano \
//     [--label=shipped] [--split=test] [--per-kind=14] [--pairs=en-ja,de-en]
//   npx jiti .claude/skills/language-cycle/scripts/selection-nano.ts --do=score \
//     --offline=<cycle>/selection/offline --out=<cycle>/selection/nano \
//     [--label=shipped] [--split=test] [--repo=<the checkout whose prompt answered>]
//
// batches: batches/<label>-<split>-<pair>.json for the offered pairs whose native the
// model writes: the same selections for every native of a learning language, in a
// seeded order, and what the extension would give the model for each (`input`).
// score: reads results/<the same name>.json. An answer counts only when the prompt of
// --repo gave it (`answerVersion`). Its phrase goes through that checkout's checker as
// in the dictionary window:
// - offered: the window would propose it and it is not the phrase already shown;
// - correct: it is the expression the selection was made from (a reported expression:
//   exactly its words); every other offer is wrong, and so is any offer on a control.
// Writes scores-<label>-<split>.json/.md and answers-<label>-<split>/rows-<pair>.jsonl,
// which selection-packets.py reads to have the "In this sentence" meanings judged.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  readJson,
  readJsonl,
  repo,
  setting,
  shortSha,
} from "../../real-content-quality/scripts/common.ts";
import {
  createSelectionPath,
  seededOrder,
  type ExplainInput,
  type Item,
} from "./selection-common.ts";
import type { ProbeBatch, ProbeResult } from "./selection-probe.ts";

type Ask = typeof import("../../../../src/core/explain/ask.ts");
type Prompt = typeof import("../../../../src/core/explain/prompt.ts");
type Correct = typeof import("../../../../src/core/phrases/correct.ts");

/** What the model writes (Chrome's Prompt API). */
const NATIVES = new Set(["ja", "en", "es", "de", "fr"]);

interface OfflineRow {
  id: string;
  group: string;
  kind: Item["kind"];
  split: Item["split"];
  selected: string;
  expected?: string;
  reported?: object;
  outcome: "recovered" | "wrong" | "nothing";
  shown?: string;
  sentence: string;
  input?: ExplainInput;
}

const REPO = repo();
const DO = setting("do");
const OFFLINE = setting("offline");
const OUT = setting("out");
if (!OFFLINE || !OUT || (DO !== "batches" && DO !== "score"))
  throw new Error("Set --do=batches|score, --offline and --out");
const LABEL = setting("label") ?? "shipped";
const SPLIT = setting("split") ?? "test";
if (SPLIT !== "dev" && SPLIT !== "test") throw new Error("--split=dev|test");
if (!/^[a-z0-9]+$/.test(LABEL)) throw new Error("--label: lower case, digits");

const lock = readJson(join(REPO, "src/core/packs/packs.lock.json")) as {
  pairs: Record<string, string[]>;
};
const wanted = setting("pairs")?.split(",");
const pairs = Object.entries(lock.pairs).flatMap(([learning, natives]) =>
  natives
    .filter((native) => NATIVES.has(native))
    .map((native) => `${learning}-${native}`)
    .filter((pair) => !wanted || wanted.includes(pair)),
);
const nameOf = (pair: string) => `${LABEL}-${SPLIT}-${pair}`;
const rowsOf = (pair: string) =>
  readJsonl<OfflineRow>(join(OFFLINE, `rows-${pair}.jsonl`));

function batches() {
  const dir = join(OUT!, "batches");
  mkdirSync(dir, { recursive: true });
  const perKind = Number(setting("per-kind") ?? 14);
  for (const pair of pairs) {
    const taken = new Map<string, number>();
    const items: ProbeBatch["items"] = [];
    for (const row of seededOrder(rowsOf(pair), "nano", (r) => r.id)) {
      if (row.split !== SPLIT || !row.input) continue;
      const n = taken.get(row.kind) ?? 0;
      if (n >= perKind) continue;
      taken.set(row.kind, n + 1);
      items.push({ id: row.id, input: row.input });
    }
    const name = nameOf(pair);
    const [learning, native] = pair.split("-") as [string, string];
    const batch: ProbeBatch = { name, learning, native, items };
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(batch));
    console.log(`${name}: ${items.length}`, JSON.stringify(Object.fromEntries(taken)));
  }
}

const count = () => ({
  n: 0,
  answered: 0,
  errors: 0,
  /** Selections with an expression to find. */
  targets: 0,
  offline: 0,
  withAI: 0,
  proposed: 0,
  repeats: 0,
  offered: 0,
  correct: 0,
  wrong: 0,
});

async function score() {
  const { answerVersion } = (await import(
    `${REPO}/src/core/explain/ask.ts`
  )) as Ask;
  const { proposesPhrase } = (await import(
    `${REPO}/src/core/explain/prompt.ts`
  )) as Prompt;
  const { sameWords } = (await import(
    `${REPO}/src/core/phrases/correct.ts`
  )) as Correct;
  const path = await createSelectionPath(REPO);
  const answers = join(OUT!, `answers-${LABEL}-${SPLIT}`);
  mkdirSync(answers, { recursive: true });
  const summary: Record<string, object> = {};
  const lines = [
    "| pair | answered / asked | errors | proposes | recovered: offline → with AI (of selections with an expression) | offered | correct | wrong (of them on controls) | repeats what is shown | ms p50 / p90 |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const pair of pairs) {
    const name = nameOf(pair);
    const resultPath = join(OUT!, "results", `${name}.json`);
    if (!existsSync(resultPath)) {
      lines.push(`| ${pair} | not run | | | | | | | | |`);
      continue;
    }
    const batch = readJson(join(OUT!, "batches", `${name}.json`)) as ProbeBatch;
    const result = readJson(resultPath) as ProbeResult;
    const got = new Map(result.results.map((r) => [r.id, r]));
    const offline = new Map(rowsOf(pair).map((r) => [r.id, r]));
    const pack = await path.resources.pack(batch.learning);
    const total = count();
    const kinds: Record<string, ReturnType<typeof count>> = {};
    const ms: number[] = [];
    const rows: object[] = [];
    let proposes = false;
    for (const { id, input } of batch.items) {
      const row = offline.get(id);
      if (!row) throw new Error(`${name}: ${id} is not in ${OFFLINE}`);
      const counts = [total, (kinds[row.kind] ??= count())];
      const add = (key: keyof typeof total) => counts.forEach((c) => c[key]++);
      add("n");
      proposes ||= proposesPhrase(input);
      const before = row.outcome === "recovered" && row.expected !== undefined;
      if (row.expected !== undefined) add("targets");
      if (before) add("offline");

      const one = got.get(id);
      if (one && one.answerVersion !== answerVersion(input))
        throw new Error(
          `${name}: ${id} was answered by another prompt than ${REPO}'s (give --repo the checkout the probe was built from)`,
        );
      if (one?.error) add("errors");
      let verdict: "correct" | "wrong" | "repeats" | undefined;
      let proposal: string | undefined;
      let why: string | undefined;
      if (one?.answer) {
        add("answered");
        ms.push(one.ms);
        const text = one.answer.phrase;
        if (text && input.marks.length > 0) {
          add("proposed");
          const checked = (await path.send({
            type: "checkPhrase",
            lang: batch.learning,
            sentence: input.sentence,
            start: Math.min(...input.marks.map((m) => m.start)),
            end: Math.max(...input.marks.map((m) => m.end)),
            text,
            proposal: true,
          })) as { key?: string; start?: number; end?: number; why?: string };
          why = checked.why;
          if (checked.key !== undefined) {
            proposal = checked.key;
            if (checked.key === row.shown) verdict = "repeats";
            else {
              const { expected } = row;
              const right =
                expected !== undefined &&
                (row.reported
                  ? sameWords(
                      pack,
                      input.sentence.slice(checked.start, checked.end),
                      expected,
                    )
                  : checked.key === expected);
              verdict = right ? "correct" : "wrong";
              add("offered");
            }
            add(verdict);
          }
        }
      }
      if (before || verdict === "correct") add("withAI");
      if (!one?.answer) continue;
      rows.push({
        id,
        group: row.group,
        kind: row.kind,
        selected: row.selected,
        sentence: row.sentence,
        input,
        answered: true,
        shown: proposal ?? row.shown,
        meaning: [one.answer.meaning],
        answer: one.answer,
        ...(row.expected && { expected: row.expected }),
        ...(verdict && { verdict }),
        ...(why && { why }),
      });
    }
    writeFileSync(
      join(answers, `rows-${pair}.jsonl`),
      rows.map((r) => JSON.stringify(r) + "\n").join(""),
    );
    ms.sort((a, b) => a - b);
    const at = (q: number) => Math.round(ms[Math.floor(ms.length * q)] ?? 0);
    const speed = { p50: at(0.5), p90: at(0.9) };
    summary[pair] = { total, kinds, ms: speed, model: result.model };
    lines.push(
      `| ${pair} | ${total.answered} / ${total.n} | ${total.errors} | ${proposes ? "yes" : "no (not asked for)"} | ${total.offline} → ${total.withAI} (of ${total.targets}) | ${total.offered} | ${total.correct} | ${total.wrong} (${kinds.none?.wrong ?? 0}) | ${total.repeats} | ${speed.p50} / ${speed.p90} |`,
    );
  }
  const stem = join(OUT!, `scores-${LABEL}-${SPLIT}`);
  const meta = { repo: REPO, sha: shortSha(REPO), label: LABEL, split: SPLIT };
  writeFileSync(`${stem}.json`, JSON.stringify({ meta, pairs: summary }, null, 1) + "\n");
  writeFileSync(`${stem}.md`, lines.join("\n") + "\n");
  console.log(lines.join("\n"));
}

if (DO === "batches") batches();
else await score();
