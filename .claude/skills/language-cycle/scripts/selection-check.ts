// The selection check's offline part (references/selection.md): for every offered pair
// (packs.lock.json), what a selection gives by Langle's own code, without the AI.
//
//   npx jiti .claude/skills/language-cycle/scripts/selection-check.ts \
//     --items=<cycle>/selection/items --out=<cycle>/selection/offline \
//     [--repo=<checkout>] [--pairs=en-ja,de-fr]
//
// A selection's outcome:
// - recovered: the phrase shown is the one it was made from (a reported expression: the
//   phrase shown has exactly its words);
// - wrong: another phrase is shown (a control: any phrase);
// - nothing: no phrase, only the words' machine translation (a control: correct).
// A phrase is shown when the matcher gives a pattern, or the dictionary has an entry
// under the words' own key. Writes <out>/rows-<pair>.jsonl (with what the on-device AI
// would read, `input`), summary.json and summary.md (the tables, and why not, with
// examples). Deterministic, one pair after another in one process.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  readJson,
  repo,
  setting,
  shortSha,
} from "../../real-content-quality/scripts/common.ts";
import {
  createSelectionPath,
  readItems,
  shown as shownText,
  type Item,
  type Selected,
} from "./selection-common.ts";

type Correct = typeof import("../../../../src/core/phrases/correct.ts");
type Matcher = typeof import("../../../../src/core/phrases/matcher.ts");

const REPO = repo();
const ITEMS = setting("items");
const OUT = setting("out");
if (!ITEMS || !OUT) throw new Error("Set --items and --out");
const { wordsTouched } = (await import(
  `${REPO}/src/core/phrases/correct.ts`
)) as Correct;
const { matchStart } = (await import(
  `${REPO}/src/core/phrases/matcher.ts`
)) as Matcher;

type Outcome = "recovered" | "wrong" | "nothing";
/** The kinds the summary shows together. */
const GROUP: Record<Item["kind"], "exact" | "off" | "reported" | "repOff" | "none"> = {
  exact: "exact",
  extra: "off",
  shifted: "off",
  missing: "off",
  "rep-whole": "reported",
  "rep-extra": "repOff",
  "rep-missing": "repOff",
  none: "none",
};

const { file, docOf } = readItems(ITEMS);
const path = await createSelectionPath(REPO);
const lock = readJson(join(REPO, "src/core/packs/packs.lock.json")) as {
  pairs: Record<string, string[]>;
};
const wanted = setting("pairs")?.split(",");
const pairs = Object.entries(lock.pairs)
  .flatMap(([learning, natives]) =>
    natives.map((native) => ({ learning, native, pair: `${learning}-${native}` })),
  )
  .filter(({ pair }) => !wanted || wanted.includes(pair));

/** What the selection shows as its phrase, and where. */
function phraseOf(got: Selected) {
  if (got.match) return { ...got.match, by: "pattern" as const };
  if (got.card && got.card.senses.length > 0)
    return { key: got.key, start: got.start, end: got.end, by: "entry" as const };
  return undefined;
}

function outcomeOf(item: Item, phrase: ReturnType<typeof phraseOf>): Outcome {
  if (!phrase) return "nothing";
  const { truth } = item;
  if (!truth) return "wrong";
  const right = truth.key
    ? phrase.key === truth.key
    : phrase.start === truth.start && phrase.end === truth.end;
  return right ? "recovered" : "wrong";
}

/** Why the expression is not shown, as far as the patterns say. */
async function causeOf(
  item: Item,
  got: Selected,
  phrase: ReturnType<typeof phraseOf>,
): Promise<string> {
  if (got.words < 2) return "snapped to one word";
  const truth = item.truth;
  if (phrase) {
    if (!truth) return "phrase on a control";
    if (phrase.start <= truth.start && phrase.end >= truth.end)
      return "another phrase over all its words";
    if (phrase.start >= truth.start && phrase.end <= truth.end)
      return "a phrase that is part of it";
    return "another phrase overlapping it";
  }
  const pack = await path.resources.pack(item.learning);
  const input = pack.matcher.prepare(pack.tokenize(shownText(item.text)));
  const { from, to } = wordsTouched(input.words, got.start, got.end);
  const at = truth && wordsTouched(input.words, truth.start, truth.end);
  let covered = false;
  let inside = false;
  let overlapping = false;
  for (let i = 0; i < to; i++)
    for (const m of pack.matcher.matchesAt(input, i, "select")) {
      const first = matchStart(m);
      const last = m.words.at(-1)!;
      if (last < from || first >= to) continue;
      overlapping = true;
      if (!at) continue;
      if (first === at.from && last === at.to - 1) covered = true;
      else if (first >= at.from && last < at.to) inside = true;
    }
  if (covered) {
    const past = got.start < truth!.start || got.end > truth!.end;
    return past
      ? "selection goes past the pattern"
      : "pattern matches, selection too small";
  }
  if (inside) return "only a smaller pattern inside it";
  return overlapping ? "only other patterns around it" : "no pattern";
}

/**
 * Whether the AI's checker (handlers `checkPhrase`) would take the right phrase as a
 * proposal: the most the AI path could recover.
 */
async function checkOf(item: Item, got: Selected): Promise<string | undefined> {
  const { truth } = item;
  if (!truth || !got.input || got.input.marks.length === 0) return undefined;
  const { sentence, marks } = got.input;
  const checked = (await path.send({
    type: "checkPhrase",
    lang: item.learning,
    sentence,
    start: Math.min(...marks.map((m) => m.start)),
    end: Math.max(...marks.map((m) => m.end)),
    text: truth.key ?? item.text.slice(truth.start, truth.end),
    proposal: true,
  })) as { key?: string; why?: string };
  if (checked.key === undefined) return checked.why;
  return !truth.key || checked.key === truth.key ? "accepted" : "another key";
}

const percent = (n: number, of: number) => (of ? Math.round((100 * n) / of) : 0);

mkdirSync(OUT, { recursive: true });
const summary: Record<string, object> = {};
const table = [
  "| pair | n | exact R/W/N | word too many R/W/N | shifted R/W/N | word missing R/W/N | reported whole R/W/N | reported off R/W/N | controls: false phrase | checker would take the phrase (of missed) | meaning of shown phrases: dictionary / English definition / literal % |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
];
const why: string[] = [];
const explained = new Set<string>();
for (const { learning, native, pair } of pairs) {
  const items = file.items.filter((i) => i.learning === learning);
  if (items.length === 0) throw new Error(`No items for ${pair}`);
  const rows: object[] = [];
  const groups: Record<string, Record<Outcome, number>> = {};
  const kinds: Record<string, Record<Outcome, number>> = {};
  const meanings = { dictionary: 0, definition: 0, literal: 0 };
  const causes = new Map<string, string[]>();
  const check = { missed: 0, accepted: 0 };
  for (const item of items) {
    const got = await path.select(item, native, docOf(item));
    const phrase = phraseOf(got);
    const outcome = outcomeOf(item, phrase);
    for (const [counts, name] of [
      [groups, GROUP[item.kind]],
      [kinds, item.kind],
    ] as const)
      (counts[name] ??= { recovered: 0, wrong: 0, nothing: 0 })[outcome]++;
    if (phrase && got.meaningKind) meanings[got.meaningKind]++;
    const selected = item.text.slice(item.start, item.end);
    const expected =
      item.truth?.key ??
      (item.truth && item.text.slice(item.truth.start, item.truth.end));
    const missed = item.truth ? outcome !== "recovered" : outcome === "wrong";
    let cause: string | undefined;
    let checked: string | undefined;
    if (missed) {
      cause = await causeOf(item, got, phrase);
      checked = await checkOf(item, got);
      if (item.truth?.key) {
        check.missed++;
        if (checked === "accepted") check.accepted++;
      }
      const name = `${GROUP[item.kind]}: ${cause}`;
      causes.set(name, [
        ...(causes.get(name) ?? []),
        `[${selected}] ${expected ?? "-"} → ${phrase?.key ?? "-"}`,
      ]);
    }
    rows.push({
      id: item.id,
      group: item.group,
      kind: item.kind,
      split: item.split,
      site: item.site,
      selected,
      ...(expected && { expected }),
      ...(item.reported && { reported: item.reported }),
      outcome,
      ...(phrase && {
        shown: phrase.key,
        by: phrase.by,
        // The phrase's place, as the truth's: in the unit's text.
        at: [phrase.start, phrase.end],
        shownText: item.text.slice(phrase.start, phrase.end),
      }),
      ...(cause && { cause }),
      ...(checked && { checked }),
      ...(got.meaningKind && { meaningKind: got.meaningKind }),
      meaning: got.meaning,
      ...(got.card?.sub && { sub: got.card.sub }),
      sentence: got.input?.sentence ?? shownText(item.text),
      ...(got.input && { input: got.input }),
    });
  }
  writeFileSync(
    join(OUT, `rows-${pair}.jsonl`),
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  summary[pair] = {
    n: items.length,
    groups,
    kinds,
    meanings,
    check,
    causes: Object.fromEntries([...causes].map(([k, v]) => [k, v.length])),
  };

  const cell = (counts: typeof groups, name: string) => {
    const c = counts[name];
    return c ? `${c.recovered}/${c.wrong}/${c.nothing}` : "-";
  };
  const controls = groups.none;
  const all = meanings.dictionary + meanings.definition + meanings.literal;
  table.push(
    `| ${pair} | ${items.length} | ${cell(kinds, "exact")} | ${cell(kinds, "extra")} | ${cell(kinds, "shifted")} | ${cell(kinds, "missing")} | ${cell(groups, "reported")} | ${cell(groups, "repOff")} | ${controls?.wrong ?? 0} of ${controls ? controls.wrong + controls.nothing : 0} | ${check.accepted} of ${check.missed} | ${percent(meanings.dictionary, all)} / ${percent(meanings.definition, all)} / ${percent(meanings.literal, all)} |`,
  );
  // The patterns are the learning language's: one native's examples say it.
  if (!explained.has(learning)) {
    explained.add(learning);
    why.push(`\n### ${learning} (as in ${pair})`);
    for (const [name, examples] of [...causes].sort((a, b) => b[1].length - a[1].length))
      why.push(`- ${name}: ${examples.length}. ${examples.slice(0, 4).join("; ")}`);
  }
  console.log(table.at(-1));
}
const meta = { repo: REPO, sha: shortSha(REPO), items: ITEMS };
writeFileSync(
  join(OUT, "summary.json"),
  JSON.stringify({ meta, pairs: summary }, null, 1) + "\n",
);
writeFileSync(
  join(OUT, "summary.md"),
  `# Selection, offline (${meta.sha})\n\n${table.join("\n")}\n\n## Why not\n${why.join("\n")}\n`,
);
