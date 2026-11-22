// What the selection check's scripts share (references/selection.md): the items' shape,
// a seeded order, and a checkout's own selection path in Node (its background handlers
// over its packs, snapping, the card and what the on-device AI would read).
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readJson, readJsonl } from "../../real-content-quality/scripts/common.ts";

type Handlers = typeof import("../../../../src/background/handlers.ts");
type Resources =
  typeof import("../../../../src/background/language-resources.ts");
type PackLoad = typeof import("../../../../src/core/packs/load.ts");
type DataFormats = typeof import("../../../../scripts/data/formats.ts");
type Selection = typeof import("../../../../src/core/selection.ts");
type Describe = typeof import("../../../../src/content/lookup/describe.ts");
type Place = typeof import("../../../../src/content/explain/place.ts");
type VideoWords = typeof import("../../../../src/content/video/words.ts");
type Casing = typeof import("../../../../src/core/text/casing.ts");
type TermCard = import("../../../../src/content/lookup/describe.ts").TermCard;
type Span = import("../../../../src/core/classify.ts").Span;
export type ExplainInput =
  import("../../../../src/core/explain/prompt.ts").ExplainInput;

/**
 * How the selection was made from the expression it aims at (`truth`):
 * - exact, extra (a word too many), shifted (by a word), missing (a word too few): of a
 *   dictionary phrase;
 * - rep-whole, rep-extra, rep-missing: of an expression a learner reported as missed;
 * - none: a control, words no dictionary phrase touches.
 */
export type Kind =
  | "exact"
  | "extra"
  | "shifted"
  | "missing"
  | "rep-whole"
  | "rep-extra"
  | "rep-missing"
  | "none";

/** One selection. Offsets are into `text`, the unit as the corpus has it. */
export interface Item {
  id: string;
  learning: string;
  /** The selections of one expression share it (and their split). */
  group: string;
  /** "dev" tunes a prompt; "test" is held out for measuring it once, frozen. */
  split: "dev" | "test";
  kind: Kind;
  site: "youtube" | "netflix" | "article";
  doc: string;
  /** The unit's index in its document's units, and its text. */
  at: number;
  text: string;
  title?: string;
  start: number;
  end: number;
  /** The expression: its place, and its key when a dictionary pattern made it. */
  truth?: { start: number; end: number; key?: string };
  /** A reported expression: how many learners reported it, and as what. */
  reported?: { learners: number; surface: string; expected?: string };
}

/** items.json, next to units-<learning>.jsonl (the items' documents, frozen with them). */
export interface ItemsFile {
  seed: string;
  corpora: Record<string, string>;
  items: Item[];
}

export interface DocUnit {
  doc: string;
  site: Item["site"];
  i: number;
  text: string;
}

/** A hex digest that orders and names things the same in every run. */
export const digest = (...parts: (string | number)[]) =>
  createHash("sha1").update(parts.join("\u0001")).digest("hex");

/** `list` in a seeded order that does not depend on the order it came in. */
export function seededOrder<T>(
  list: readonly T[],
  seed: string,
  id: (value: T) => string,
): T[] {
  return list
    .map((value) => ({ value, at: digest(seed, id(value)) }))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    .map(({ value }) => value);
}

export function readItems(dir: string) {
  const file = readJson(join(dir, "items.json")) as ItemsFile;
  const docs = new Map<string, DocUnit[]>();
  for (const learning of new Set(file.items.map((i) => i.learning)))
    for (const unit of readJsonl<DocUnit>(join(dir, `units-${learning}.jsonl`))) {
      const key = `${learning} ${unit.doc}`;
      const list = docs.get(key);
      if (list) list.push(unit);
      else docs.set(key, [unit]);
    }
  return {
    file,
    docOf: (item: Item) => docs.get(`${item.learning} ${item.doc}`)!,
  };
}

/** A card's text as selecting reads it (ui/video/terms.tsx `lineBreaksAsSpaces`). */
export const shown = (text: string) => text.replaceAll("\n", " ");

/** The checkout `repo`'s packs, as the extension's background loads them. */
export async function loadResources(repo: string) {
  const load = async <T>(path: string) => (await import(`${repo}/${path}`)) as T;
  const { createPackLoader } = await load<PackLoad>("src/core/packs/load.ts");
  const { packSourcePath } = await load<DataFormats>("scripts/data/formats.ts");
  const { createLanguageResources } = await load<Resources>(
    "src/background/language-resources.ts",
  );
  return createLanguageResources(
    createPackLoader(async (path) =>
      JSON.parse(await readFile(packSourcePath(path), "utf8")),
    ),
  );
}

/** What a selection gives without the AI, and what the AI would be asked. */
export interface Selected {
  /** The words it snapped to; fewer than two is a word's click, not a selection. */
  words: number;
  start: number;
  end: number;
  /** The dictionary pattern it stands for. */
  match?: { key: string; start: number; end: number };
  /** The card's key: the pattern's, else the words' own. */
  key: string;
  card?: TermCard;
  /**
   * Where the card's meaning comes from: the pair's dictionary, an English definition
   * translated at display, or the words' machine translation (no meaning of their own).
   */
  meaningKind?: "dictionary" | "definition" | "literal";
  /** The meaning as far as it is known offline (a definition: its English text). */
  meaning: string[];
  input?: ExplainInput;
}

/**
 * The checkout's own path for a selection, per native language: classify (for
 * snapping), snapWords, the handlers' matchSelection, describeTerm over their lookup,
 * and videoPlace / articlePlace for the AI. Nothing is saved and no browser translates:
 * the translator only notes what it is asked.
 */
export async function createSelectionPath(repo: string) {
  const load = async <T>(path: string) =>
    (await import(`${repo}/${path}`)) as T;
  const resources = await loadResources(repo);
  const { createHandlers } = await load<Handlers>("src/background/handlers.ts");
  const { snapWords, selectionKey } = await load<Selection>(
    "src/core/selection.ts",
  );
  const { describeTerm, packSenses } = await load<Describe>(
    "src/content/lookup/describe.ts",
  );
  const { videoPlace, articlePlace } = await load<Place>(
    "src/content/explain/place.ts",
  );
  const { flatCue } = await load<VideoWords>("src/content/video/words.ts");
  const { blockCasing, documentCasing } = await load<Casing>(
    "src/core/text/casing.ts",
  );

  let nativeLang = "";
  // A device with no saved terms, no history and no cached translations.
  const handle = createHandlers({
    resources,
    settings: { get: async () => ({ nativeLang }) },
    store: {
      termIndex: async () => new Map(),
      occurrencesOf: async () => [],
      meaningsOf: async () => ({ meanings: [], choices: [] }),
    },
    history: { find: async () => [] },
    translations: { get: async () => ({}) },
  } as unknown as Parameters<Handlers["createHandlers"]>[0]);

  async function send(request: object) {
    const reply = await handle(request);
    if (!reply.ok) throw new Error(reply.error);
    return reply.value;
  }

  const casings = new Map<string, ReturnType<typeof documentCasing>>();
  /** An item's unit's spans, at the known level 3000 with nothing saved. */
  async function spansOf(
    learning: string,
    native: string,
    list: readonly DocUnit[],
    text: string,
  ): Promise<Span[]> {
    const pack = await resources.pack(learning);
    const classifier = await resources.classifier(learning);
    const dictionary = await resources.dictionary(learning, native);
    const id = `${learning} ${list[0]!.doc}`;
    let casing = casings.get(id);
    if (!casing) {
      casing = documentCasing(
        list.map((u) => blockCasing(pack.tokenize(u.text), learning)),
      );
      casings.set(id, casing);
    }
    return classifier.classify(pack.tokenize(text), {
      terms: new Map(),
      knownLevel: 3000,
      casing,
      capitalMeaning: (key: string) => dictionary.capitalMeaning(key),
      acronym: (key: string) => dictionary.acronym(key),
      outline: (key: string) => dictionary.outline(key),
    });
  }

  async function select(
    item: Item,
    native: string,
    list: readonly DocUnit[],
  ): Promise<Selected> {
    nativeLang = native;
    const lang = item.learning;
    const text = shown(item.text);
    const spans = await spansOf(lang, native, list, text);
    // Dragged from its first word, as on a video.
    const snapped = snapWords(text, spans, item.start, item.end, "start");
    if (!snapped || snapped.words < 2)
      return {
        words: snapped?.words ?? 0,
        start: snapped?.start ?? item.start,
        end: snapped?.end ?? item.end,
        key: "",
        meaning: [],
      };
    const found = (await send({
      type: "matchSelection",
      lang,
      text,
      start: snapped.start,
      end: snapped.end,
    })) as { key?: string; start?: number; end?: number };
    const match =
      found.key === undefined
        ? undefined
        : { key: found.key, start: found.start!, end: found.end! };
    const { start, end } = match ?? snapped;
    const key = match?.key ?? selectionKey(text, snapped.spans);
    const flat = (value: string) => flatCue(value, lang);
    const asked: { text: string; literal: boolean }[] = [];
    const surface = flat(item.text.slice(start, end));
    const card = await describeTerm(
      { key, kind: "phrase", surface, category: "new" },
      {
        send: (async (request: { type: string }) =>
          request.type === "cacheTranslations" ? null : send(request)) as never,
        lang,
        nativeLang: native,
        sourceUrl: `https://example.com/${encodeURIComponent(item.doc)}`,
        translator: {
          translate: (async (value: string, _: unknown, pair: { from: string }) => {
            asked.push({
              text: value,
              literal: value === surface && pair.from === lang,
            });
            return undefined;
          }) as never,
        },
      },
    );
    const literal = asked.some((a) => a.literal) || card.short === undefined;
    const definition = asked.find((a) => !a.literal);
    const meaningKind = literal
      ? "literal"
      : definition || (card.glossLang && card.glossLang !== native)
        ? "definition"
        : "dictionary";
    const meaning = literal
      ? []
      : definition
        ? [definition.text]
        : [...(card.lines ?? [card.short!])];

    const span = { start, end, key };
    // articlePlace knows the selection's block among the page's by identity.
    const blocks = list.map((u) => ({ text: u.text }));
    const place =
      item.site === "article"
        ? articlePlace(
            {
              block: blocks[item.at],
              span: { ...span, kind: "phrase", category: "new" },
            } as unknown as Parameters<typeof articlePlace>[0],
            [],
            blocks as unknown as Parameters<typeof articlePlace>[2],
            lang,
          )
        : videoPlace(
            list as unknown as Parameters<typeof videoPlace>[0],
            [],
            { cue: item.at, span: -1, selected: span } as Parameters<
              typeof videoPlace
            >[2],
            flat,
          )!;
    return {
      words: snapped.words,
      start: snapped.start,
      end: snapped.end,
      ...(match && { match }),
      key,
      card,
      meaningKind,
      meaning,
      input: {
        learning: lang,
        native,
        ...(item.title && { title: item.title }),
        written: surface,
        base: card.key,
        kind: card.kind,
        ...place,
        senses: packSenses(card),
        selected: true,
      },
    };
  }

  return { resources, send, select };
}
