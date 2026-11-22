// The selection check's items (references/selection.md), per learning language.
//
//   npx jiti .claude/skills/language-cycle/scripts/selection-items.ts \
//     --units=<sweep dir>/units --out=<cycle>/selection/items \
//     [--findings=<sim dir>[,<sim dir>]] [--from=<previous cycle>/selection/items] \
//     [--repo=<checkout>] [--phrases=80] [--controls=30]
//
// - 80 dictionary phrases of the corpus (the matcher's select mode, as in the 2026-11-19
//   study): half of three words or more, half of two words that Langle also highlights
//   (a two-word pattern nobody highlights is mostly no expression: "of the"). Each is
//   selected exactly, with a word too many, shifted by a word, and with a word missing
//   (three words or more: a selection has two).
// - 30 controls: two or three words no pattern touches.
// - the expressions the learners reported as missed (sim findings `missed-expression`):
//   whole, with a word too many, with a word missing.
// --from keeps the previous cycle's items, so that cycles compare selection by
// selection, and only adds newly reported expressions; a learning language whose corpus
// changed (corpora.json) is made anew. Seeded: the same corpus and checkout give the
// same items.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  qualityRoot,
  readJson,
  readJsonl,
  repo,
  setting,
} from "../../real-content-quality/scripts/common.ts";
import {
  digest,
  loadResources,
  readItems,
  seededOrder,
  shown,
  type DocUnit,
  type Item,
  type ItemsFile,
  type Kind,
} from "./selection-common.ts";

type Casing = typeof import("../../../../src/core/text/casing.ts");
type Matcher = typeof import("../../../../src/core/phrases/matcher.ts");
type Labels = typeof import("../../../../src/core/subtitles/cues.ts");

const SEED = "20261122";
/** A selection takes at most this many words (core/selection.ts). */
const MAX_WORDS = 8;
/** A word this frequent carries no phrase alone ("the", "of", "it"). */
const COMMON_RANK = 100;

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = repo();
const OUT = setting("out");
const UNITS = setting("units");
if (!OUT || !UNITS) throw new Error("Set --out and --units=<sweep dir>/units");
const PHRASES = Number(setting("phrases", "80"));
const CONTROLS = Number(setting("controls", "30"));
const FROM = setting("from");
const FINDINGS = setting("findings")?.split(",") ?? [];
const QUALITY = qualityRoot();

const corpora = readJson(join(HERE, "corpora.json")) as Record<
  string,
  { corpus: string }
>;
const { blockCasing, documentCasing } = (await import(
  `${REPO}/src/core/text/casing.ts`
)) as Casing;
const { matchStart } = (await import(
  `${REPO}/src/core/phrases/matcher.ts`
)) as Matcher;
const resources = await loadResources(REPO);
const previous = FROM ? readItems(FROM).file : undefined;

/** Titles as the pages show them, by document. */
function titlesOf(corpus: string) {
  const dir = join(QUALITY, corpus);
  const prefix: Record<string, string> = {
    youtube: "yt",
    article: "ar",
    netflix: "nf",
  };
  const titles = new Map<string, string>();
  const manifest = readJson(join(dir, "manifest.json")) as {
    kind: string;
    id: string;
    title?: string;
  }[];
  for (const m of manifest)
    if (m.title) titles.set(`${prefix[m.kind] ?? "ar"}:${m.id}`, m.title);
  return (doc: string): string | undefined => {
    if (titles.has(doc)) return titles.get(doc);
    const file = join(dir, "netflix", `${doc.slice(3)}.json`);
    if (!doc.startsWith("nf:") || !existsSync(file)) return undefined;
    const { show, title } = readJson(file) as { show?: string; title?: string };
    return [show, title].filter(Boolean).join(" ") || undefined;
  };
}

interface Report {
  doc: string;
  i: number;
  surface: string;
  expected?: string;
}

/** The missed-expression findings of a learning language, each at its unit. */
function reportsOf(learning: string): Report[] {
  const out: Report[] = [];
  for (const dir of FINDINGS)
    for (const name of readdirSync(dir).sort()) {
      const pair = /^findings-(.+)\.jsonl$/.exec(name)?.[1];
      if (pair?.split("-")[0] !== learning) continue;
      const { units } = readJson(join(dir, `${pair}.key.json`)) as {
        units: Record<string, { doc: string; unit: number }>;
      };
      for (const f of readJsonl<{
        unit?: string;
        surface?: string;
        kind?: string;
        expected?: string;
      }>(join(dir, name))) {
        if (f.kind !== "missed-expression" || !f.surface || !f.unit) continue;
        const place = units[f.unit];
        if (place)
          out.push({
            doc: place.doc,
            i: place.unit,
            surface: f.surface,
            ...(f.expected && { expected: f.expected }),
          });
      }
    }
  return out;
}

const letter = (c: string | undefined) => c !== undefined && /\p{L}|\p{N}/u.test(c);

/** Where reported words are in a text: their parts ("kam … zur Welt") in order. */
function findSurface(text: string, surface: string) {
  const plain = (s: string) => s.replaceAll("’", "'").toLowerCase();
  const hay = plain(text);
  const parts = plain(surface)
    .split(/\s*(?:\.{3}|…)\s*/)
    .map((p) => p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
  let first: number | undefined;
  let at = 0;
  for (const part of parts) {
    let k = hay.indexOf(part, at);
    while (k >= 0 && (letter(hay[k - 1]) || letter(hay[k + part.length])))
      k = hay.indexOf(part, k + 1);
    if (k < 0) return undefined;
    first ??= k;
    at = k + part.length;
  }
  return first === undefined ? undefined : { start: first, end: at };
}

async function itemsOf(learning: string, corpus: string) {
  const units = readJsonl<DocUnit>(join(UNITS!, learning, "units.jsonl"));
  const byDoc = new Map<string, DocUnit[]>();
  for (const u of units) {
    const list = byDoc.get(u.doc) ?? [];
    list.push(u);
    byDoc.set(u.doc, list);
  }
  const { isSoundLabel } = (await import(
    `${REPO}/src/core/subtitles/cues.ts`
  )) as Labels;
  const spoken = (text: string) => !text.includes("♪") && !isSoundLabel(text);

  const kept =
    previous?.corpora[learning] === corpus
      ? previous.items.filter((i) => i.learning === learning)
      : [];
  const pack = await resources.pack(learning);
  const classifier = await resources.classifier(learning);
  const titleOf = titlesOf(corpus);
  const readings = new Map<string, ReturnType<typeof read>>();
  function read(text: string) {
    return pack.matcher.prepare(pack.tokenize(shown(text)));
  }
  const inputOf = (text: string) => {
    let input = readings.get(text);
    if (!input) readings.set(text, (input = read(text)));
    return input;
  };

  const items = [...kept];
  const ids = new Set(kept.map((i) => i.id));
  /** Adds the selection of words `first` to `last`; false when they are no selection. */
  function add(
    kind: Kind,
    unit: DocUnit,
    group: string,
    first: number,
    last: number,
    truth?: Item["truth"],
    reported?: Item["reported"],
  ): boolean {
    const { words, joined } = inputOf(unit.text);
    if (first < 0 || last >= words.length) return false;
    if (last - first < 1 || last - first >= MAX_WORDS) return false;
    // Not across punctuation; a reported expression is taken as reported.
    if (kind !== "rep-whole")
      for (let j = first; j < last; j++) if (!joined[j]) return false;
    const id = `${learning}-${kind}-${digest(group, kind).slice(0, 10)}`;
    if (ids.has(id)) return true;
    ids.add(id);
    const title = titleOf(unit.doc);
    items.push({
      id,
      learning,
      group,
      split: parseInt(digest("split", group).slice(0, 8), 16) % 10 < 3 ? "dev" : "test",
      kind,
      site: unit.site,
      doc: unit.doc,
      at: byDoc.get(unit.doc)!.indexOf(unit),
      text: unit.text,
      ...(title && { title }),
      start: words[first]!.token.start,
      end: words[last]!.token.end,
      ...(truth && { truth }),
      ...(reported && { reported }),
    });
    return true;
  }
  /** The first of two selections that can be made; which comes first is seeded. */
  function either(
    group: string,
    kind: Kind,
    a: () => boolean,
    b: () => boolean,
  ): boolean {
    const [x, y] = parseInt(digest(SEED, group, kind)[0]!, 16) % 2 ? [b, a] : [a, b];
    return x() || y();
  }

  if (kept.length === 0) {
    interface Found {
      unit: DocUnit;
      key: string;
      /** The pattern's words (its lead first), as word indices. */
      at: number[];
      long: boolean;
      group: string;
    }
    const found: Found[] = [];
    const plain: { unit: DocUnit; first: number; last: number; group: string }[] = [];
    for (const [doc, list] of byDoc) {
      const casing = documentCasing(
        list.map((u) => blockCasing(pack.tokenize(u.text), learning)),
      );
      for (const unit of list) {
        if (!spoken(unit.text)) continue;
        const input = inputOf(unit.text);
        const { words, joined } = input;
        if (words.length < 5) continue;
        const matches = words.flatMap((_, i) =>
          pack.matcher.matchesAt(input, i, "select").map((m) => ({
            key: m.key,
            first: matchStart(m),
            last: m.words.at(-1)!,
            at: [...(m.lead === undefined ? [] : [m.lead]), ...m.words].sort(
              (a, b) => a - b,
            ),
          })),
        );
        const covered = new Set<number>();
        for (const m of matches)
          for (let j = m.first; j <= m.last; j++) covered.add(j);
        // The longest patterns only: one inside a longer one is not what was meant.
        const longest = matches.filter(
          (m) =>
            !matches.some(
              (o) =>
                o.first <= m.first &&
                o.last >= m.last &&
                (o.at.length > m.at.length ||
                  (o.at.length === m.at.length && o.key < m.key)),
            ),
        );
        let highlighted: Set<string> | undefined;
        for (const m of longest) {
          if (m.last - m.first >= MAX_WORDS) continue;
          const content = m.key
            .split(" ")
            .filter((w) => !pack.rules.slots.has(w) && pack.rank(w) > COMMON_RANK);
          if (content.length === 0) continue;
          const long = m.at.length >= 3;
          if (!long) {
            highlighted ??= new Set(
              classifier
                .classify(pack.tokenize(shown(unit.text)), {
                  terms: new Map(),
                  knownLevel: 3000,
                  casing,
                })
                .filter((s) => s.kind === "phrase")
                .map((s) => s.key),
            );
            if (!highlighted.has(m.key)) continue;
          }
          found.push({
            unit,
            key: m.key,
            at: m.at,
            long,
            group: `phrase|${doc}|${unit.i}|${m.key}|${m.first}`,
          });
        }
        for (const n of [2, 3])
          for (let i = 0; i + n <= words.length; i += 4) {
            let free = true;
            for (let j = i; j < i + n; j++)
              if (
                covered.has(j) ||
                (j < i + n - 1 && !joined[j]) ||
                !/^\p{L}/u.test(words[j]!.token.text)
              )
                free = false;
            if (free)
              plain.push({
                unit,
                first: i,
                last: i + n - 1,
                group: `none|${doc}|${unit.i}|${i}|${n}`,
              });
          }
      }
    }
    /** `n` of `list`, taken from the sites in turn. */
    function spread<T extends { unit: DocUnit; group: string }>(
      list: readonly T[],
      n: number,
      distinct: (value: T) => string,
    ): T[] {
      const queues = ["youtube", "netflix", "article"].map((site) =>
        seededOrder(
          list.filter((x) => x.unit.site === site),
          SEED,
          (x) => x.group,
        ),
      );
      const taken = new Map<string, T>();
      while (taken.size < n && queues.some((q) => q.length > 0))
        for (const queue of queues) {
          if (taken.size >= n) break;
          let next: T | undefined;
          while ((next = queue.shift()) && taken.has(distinct(next)));
          if (next) taken.set(distinct(next), next);
        }
      return [...taken.values()];
    }
    const picked = [true, false].flatMap((long) =>
      spread(
        found.filter((f) => f.long === long),
        PHRASES / 2,
        (f) => f.key,
      ),
    );
    for (const { unit, key, at, long, group } of picked) {
      const { words } = inputOf(unit.text);
      const a = at[0]!;
      const b = at.at(-1)!;
      const truth = { start: words[a]!.token.start, end: words[b]!.token.end, key };
      const make = (kind: Kind, first: number, last: number) => () =>
        add(kind, unit, group, first, last, truth);
      make("exact", a, b)();
      either(group, "extra", make("extra", a - 1, b), make("extra", a, b + 1));
      if (b - a + 1 === at.length)
        either(
          group,
          "shifted",
          make("shifted", a + 1, b + 1),
          make("shifted", a - 1, b - 1),
        );
      if (long)
        either(
          group,
          "missing",
          make("missing", at[1]!, b),
          make("missing", a, at.at(-2)!),
        );
    }
    for (const c of spread(plain, CONTROLS, (c) => c.group))
      add("none", c.unit, c.group, c.first, c.last);
  }

  // Reported expressions: one per place, the span most learners named.
  const places = new Map<
    string,
    { unit: DocUnit; first: number; last: number; reports: Report[] }
  >();
  let unplaced = 0;
  for (const report of reportsOf(learning)) {
    const unit = byDoc.get(report.doc)?.find((u) => u.i === report.i);
    const span = unit && findSurface(shown(unit.text), report.surface);
    if (!unit || !span) {
      unplaced++;
      continue;
    }
    const inside = inputOf(unit.text).words.flatMap(({ token }, i) =>
      token.end > span.start && token.start < span.end ? [i] : [],
    );
    if (inside.length < 2 || inside.length > MAX_WORDS) {
      unplaced++;
      continue;
    }
    const first = inside[0]!;
    const last = inside.at(-1)!;
    const id = `${report.doc}|${report.i}|${first}|${last}`;
    const place = places.get(id) ?? { unit, first, last, reports: [] };
    place.reports.push(report);
    places.set(id, place);
  }
  const named = [...places.entries()].sort(
    ([x, a], [y, b]) => b.reports.length - a.reports.length || (x < y ? -1 : 1),
  );
  // An expression kept from an earlier cycle holds its place too.
  const held = kept
    .filter((i) => i.kind === "rep-whole")
    .map(({ doc, at, truth }) => ({ doc, at, ...truth! }));
  for (const [id, { unit, first, last, reports }] of named) {
    const { words } = inputOf(unit.text);
    const truth = { start: words[first]!.token.start, end: words[last]!.token.end };
    const at = byDoc.get(unit.doc)!.indexOf(unit);
    const overlaps = held.some(
      (h) =>
        h.doc === unit.doc && h.at === at && h.end > truth.start && h.start < truth.end,
    );
    if (overlaps) continue;
    held.push({ doc: unit.doc, at, ...truth });
    const { surface, expected } = reports[0]!;
    const reported = {
      learners: reports.length,
      surface,
      ...(expected && { expected }),
    };
    const group = `reported|${id}`;
    const make = (kind: Kind, a: number, b: number) => () =>
      add(kind, unit, group, a, b, truth, reported);
    make("rep-whole", first, last)();
    either(
      group,
      "rep-extra",
      make("rep-extra", first - 1, last),
      make("rep-extra", first, last + 1),
    );
    if (last - first >= 2)
      either(
        group,
        "rep-missing",
        make("rep-missing", first + 1, last),
        make("rep-missing", first, last - 1),
      );
  }

  const docs = new Set(items.map((i) => i.doc));
  // Kept items keep the text they were made on.
  const keptUnits = kept.length
    ? readJsonl<DocUnit>(join(FROM!, `units-${learning}.jsonl`))
    : [];
  const had = new Set(keptUnits.map((u) => u.doc));
  const used = [
    ...keptUnits,
    ...units
      .filter((u) => docs.has(u.doc) && !had.has(u.doc))
      .map(({ doc, site, i, text }) => ({ doc, site, i, text })),
  ];
  return { items, units: used, unplaced };
}

const file: ItemsFile = { seed: SEED, corpora: {}, items: [] };
mkdirSync(OUT, { recursive: true });
for (const [learning, { corpus }] of Object.entries(corpora)) {
  const { items, units, unplaced } = await itemsOf(learning, corpus);
  file.corpora[learning] = corpus;
  file.items.push(...items);
  writeFileSync(
    join(OUT, `units-${learning}.jsonl`),
    units.map((u) => JSON.stringify(u)).join("\n") + "\n",
  );
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  console.log(
    learning,
    items.length,
    JSON.stringify(counts),
    `reports not placed (one word, over ${MAX_WORDS}, not in the unit): ${unplaced}`,
  );
}
writeFileSync(join(OUT, "items.json"), JSON.stringify(file, null, 1) + "\n");
