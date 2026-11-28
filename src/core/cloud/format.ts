/**
 * The files of cloud sync: gzipped JSON, one folder per device (architecture "Sync to the
 * user's own cloud storage" → "Files"). The format is a contract shared with the mobile
 * app: a file of a newer `v` is skipped, not guessed at.
 */
import type { StoredStatus, TermKind } from "../classify";
import { meaningKey, type MeaningFrom } from "../meanings";
import { gunzip, gzip } from "../sync/codec";
import { termId } from "../term-id";
import type { Platform } from "../url";
import type {
  CloudChoice,
  CloudHistoryPage,
  CloudHistorySentence,
  CloudMeaning,
  CloudOccurrence,
  CloudSource,
  CloudTerm,
} from "./records";
import type { FileSettings } from "./settings";

const FORMAT = "langle-cloud";
/** The version this Langle writes and reads. */
export const CLOUD_VERSION = 1;

interface FileHeader {
  format: typeof FORMAT;
  v: typeof CLOUD_VERSION;
  /** The device that wrote the file (the folder it is in). */
  deviceId: string;
  writtenAt: number;
}

/** Everything but the rows: terms, settings, choices; written after a local change. */
export interface MainFile extends FileHeader {
  kind: "main";
  /** Every term, tombstones included. */
  terms: CloudTerm[];
  /** The sources that still have an occurrence. */
  sources: CloudSource[];
  /** The meanings this device's choices name. */
  meanings: CloudMeaning[];
  /** The choices this device made, undone ones included. */
  meaningChoices: CloudChoice[];
  settings: FileSettings;
  /** The last "Clear" of the sentence history (0: never). */
  historyClearedAt: number;
  /** Host → when it was added to "Never run on". */
  historyForgotten: Record<string, number>;
}

/** The rows this device recorded in one month (by `addedAt`), with their sources. */
export interface OccurrencesFile extends FileHeader {
  kind: "occurrences";
  /** `YYYY-MM`, UTC. */
  month: string;
  sources: CloudSource[];
  occurrences: CloudOccurrence[];
}

/** The history sentences this device recorded in one month, with their pages. */
export interface HistoryFile extends FileHeader {
  kind: "history";
  /** `YYYY-MM`, UTC. */
  month: string;
  pages: CloudHistoryPage[];
  sentences: CloudHistorySentence[];
}

export type MonthFile = OccurrencesFile | HistoryFile;
export type CloudFile = MainFile | MonthFile;

/** A row left out of a file: the list it was in, its index there, and the row (JSON, cut). */
export interface SkippedRow {
  list: string;
  index: number;
  row: string;
}

/**
 * A file read back: `ok` with the rows that failed their check left out (`skipped`),
 * `newer` written by a newer Langle ("Update Langle on this device"), `broken` cannot
 * be read at all (not gzip or JSON, or a damaged header: `reason`), `other` is not a
 * Langle cloud file.
 */
export type Decoded =
  | { status: "ok"; file: CloudFile; skipped: SkippedRow[] }
  | { status: "newer"; v: number }
  | { status: "broken"; reason: string }
  | { status: "other" };

/** The month a time falls in, `YYYY-MM` (UTC). */
export const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7);

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DEVICE = /^[A-Za-z0-9_-]+$/;

/** A file's path in the provider's app space: `devices/<deviceId>/<name>.json.gz`. */
export function filePath(
  deviceId: string,
  kind: CloudFile["kind"],
  month?: string,
): string {
  if (!DEVICE.test(deviceId)) throw new RangeError(`Bad device id ${deviceId}`);
  if (kind === "main") return `devices/${deviceId}/main.json.gz`;
  if (month === undefined || !MONTH.test(month))
    throw new RangeError(`A ${kind} file needs a month: ${month}`);
  return `devices/${deviceId}/${kind}-${month}.json.gz`;
}

const PATH =
  /^devices\/([A-Za-z0-9_-]+)\/(?:(main)|(occurrences|history)-(\d{4}-\d{2}))\.json\.gz$/;

/** The device, kind and month of a path `filePath` makes; undefined for any other path. */
export function parseFilePath(
  path: string,
):
  | { deviceId: string; kind: "main" }
  | { deviceId: string; kind: MonthFile["kind"]; month: string }
  | undefined {
  const match = PATH.exec(path);
  if (!match) return undefined;
  const [, deviceId, main, kind, month] = match as unknown as [
    string,
    string,
    string?,
    MonthFile["kind"]?,
    string?,
  ];
  if (main) return { deviceId, kind: "main" };
  return MONTH.test(month!)
    ? { deviceId, kind: kind!, month: month! }
    : undefined;
}

/** The file as gzipped JSON. */
export const encodeFile = (file: CloudFile) => gzip(JSON.stringify(file));

/**
 * Reads a file `encodeFile` wrote. Never throws. A damaged header makes the whole file
 * `broken`; a damaged row is only left out (`readFile`).
 */
export async function decodeFile(bytes: Uint8Array): Promise<Decoded> {
  let data: unknown;
  try {
    data = JSON.parse(await gunzip(new Uint8Array(bytes)));
  } catch {
    return { status: "broken", reason: "not gzipped JSON" };
  }
  if (!isObject(data) || data.format !== FORMAT) return { status: "other" };
  if (Number.isSafeInteger(data.v) && (data.v as number) > CLOUD_VERSION)
    return { status: "newer", v: data.v as number };
  if (data.v !== CLOUD_VERSION)
    return { status: "broken", reason: `v ${String(data.v)}` };
  const read = await readFile(data);
  return "reason" in read
    ? { status: "broken", reason: read.reason }
    : { status: "ok", ...read };
}

/**
 * The file as its readers will take it: the rows that fail the reader's checks left
 * out (the others kept as they are), so a device never writes a row the others refuse.
 * Throws when the header fails them (a bug: the writer makes it).
 */
async function checkFile<F extends CloudFile>(
  file: F,
): Promise<{ file: F; skipped: SkippedRow[] }> {
  const read = await readFile(file as unknown as Dict);
  if ("reason" in read)
    throw new Error(`A cloud file this device made is damaged: ${read.reason}`);
  if (read.skipped.length === 0) return { file, skipped: [] };
  const out: Dict = { ...file };
  for (const list of new Set(read.skipped.map((s) => s.list))) {
    const gone = new Set(
      read.skipped.filter((s) => s.list === list).map((s) => s.index),
    );
    out[list] = (out[list] as unknown[]).filter((_, i) => !gone.has(i));
  }
  return { file: out as F, skipped: read.skipped };
}

/**
 * The files a device is about to write (`filesOf`), each as `checkFile` leaves it; a
 * month's rows of a term the `main` left out go too, since other devices would wait for
 * that term (`takeMonth`) and read the month again at every check.
 */
export async function checkFiles(
  files: readonly CloudFile[],
): Promise<{ file: CloudFile; skipped: SkippedRow[] }[]> {
  const checked = await Promise.all(files.map(checkFile));
  const main = checked.find((c) => c.file.kind === "main")?.file as
    MainFile | undefined;
  if (!main) return checked;
  const terms = new Set(main.terms.map((t) => t.id));
  return checked.map(({ file, skipped }) => {
    if (file.kind !== "occurrences") return { file, skipped };
    const orphans: SkippedRow[] = [];
    const occurrences = file.occurrences.filter((o, index) => {
      if (terms.has(o.termId)) return true;
      orphans.push({ list: "occurrences", index, row: sample(o) });
      return false;
    });
    return orphans.length === 0
      ? { file, skipped }
      : { file: { ...file, occurrences }, skipped: [...skipped, ...orphans] };
  });
}

/** A row as short JSON, for the error log. */
function sample(row: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(row) ?? String(row);
  } catch {
    text = String(row);
  }
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}

/** How a skipped file's rows read in the error log: how many, and the first few. */
export function skippedText(skipped: readonly SkippedRow[]): string {
  const first = skipped
    .slice(0, 3)
    .map((s) => `${s.list}[${s.index}] ${s.row}`)
    .join("; ");
  const more = skipped.length > 3 ? `; and ${skipped.length - 3} more` : "";
  const count =
    skipped.length === 1
      ? "one row that fails its check"
      : `${skipped.length} rows that fail their check`;
  return `${count} left out: ${first}${more}`;
}

type Dict = Record<string, unknown>;

const STATUSES = new Set<StoredStatus>(["learning", "known", "removed"]);
const KINDS = new Set<TermKind>(["word", "phrase"]);
const PLATFORMS = new Set<Platform>(["youtube", "netflix", "web"]);
const ORIGINS = new Set(["saved", "encountered"]);
const FROMS = new Set<MeaningFrom>(["dictionary", "ai"]);

const isObject = (value: unknown): value is Dict =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const optional =
  <T>(check: (value: unknown) => value is T) =>
  (value: unknown): value is T | undefined =>
    value === undefined || check(value);
const isBool = (value: unknown): value is boolean => typeof value === "boolean";
const isPosition = (value: unknown) =>
  isObject(value) &&
  ((isTime(value.timeMs) && Object.keys(value).length === 1) ||
    (isString(value.textQuote) && Object.keys(value).length === 1));
const isDevice = (value: unknown): value is string =>
  isString(value) && DEVICE.test(value);

/** Only the fields named, in that order, those left out dropped (they stay undefined). */
function pick<T>(value: Dict, fields: readonly string[]): T {
  const out: Dict = {};
  for (const field of fields)
    if (value[field] !== undefined) out[field] = value[field];
  return out as T;
}

/** `value`'s fields picked when it passes `check`; undefined when it does not. */
const record =
  <T>(fields: readonly string[], check: (value: Dict) => boolean) =>
  (value: unknown): T | undefined =>
    isObject(value) && check(value) ? pick<T>(value, fields) : undefined;

const readTerm = record<CloudTerm>(
  [
    "id",
    "lang",
    "key",
    "display",
    "kind",
    "status",
    "bulk",
    "learnedAt",
    "note",
    "createdAt",
    "updatedAt",
    "clearedAt",
  ],
  (t) =>
    isString(t.lang) &&
    isString(t.key) &&
    t.id === termId(t.lang, t.key) &&
    isString(t.display) &&
    KINDS.has(t.kind as TermKind) &&
    STATUSES.has(t.status as StoredStatus) &&
    optional(isBool)(t.bulk) &&
    optional(isTime)(t.learnedAt) &&
    optional(isString)(t.note) &&
    isTime(t.createdAt) &&
    isTime(t.updatedAt) &&
    optional(isTime)(t.clearedAt),
);

const SEEN = [
  "id",
  "platform",
  "url",
  "title",
  "lang",
  "firstSeen",
  "lastSeen",
];
const isSeen = (s: Dict) =>
  isString(s.id) &&
  PLATFORMS.has(s.platform as Platform) &&
  isString(s.url) &&
  isString(s.title) &&
  isString(s.lang) &&
  isTime(s.firstSeen) &&
  isTime(s.lastSeen) &&
  s.firstSeen <= s.lastSeen;

const readSource = record<CloudSource>(SEEN, isSeen);

const readPage = record<CloudHistoryPage>(
  [...SEEN, "host"],
  (p) => isSeen(p) && isString(p.host) && p.host === p.host.toLowerCase(),
);

const isRecorded = (r: Dict) => isDevice(r.deviceId) && isTime(r.addedAt);

const readOccurrence = record<CloudOccurrence>(
  [
    "termId",
    "sourceId",
    "sentence",
    "translation",
    "pos",
    "seenAt",
    "origin",
    "deviceId",
    "addedAt",
  ],
  (o) =>
    isString(o.termId) &&
    isString(o.sourceId) &&
    isString(o.sentence) &&
    optional(isString)(o.translation) &&
    isPosition(o.pos) &&
    isTime(o.seenAt) &&
    ORIGINS.has(o.origin as string) &&
    isRecorded(o),
);

const readSentence = record<CloudHistorySentence>(
  [
    "pageId",
    "text",
    "translation",
    "pos",
    "keys",
    "seenAt",
    "deviceId",
    "addedAt",
  ],
  (s) =>
    isString(s.pageId) &&
    isString(s.text) &&
    optional(isString)(s.translation) &&
    isPosition(s.pos) &&
    Array.isArray(s.keys) &&
    s.keys.every(isString) &&
    isTime(s.seenAt) &&
    isRecorded(s),
);

const readMeaning = record<CloudMeaning>(
  [
    "key",
    "termId",
    "from",
    "text",
    "glossLang",
    "pos",
    "explanation",
    "createdAt",
  ],
  (m) =>
    isString(m.key) &&
    isString(m.termId) &&
    FROMS.has(m.from as MeaningFrom) &&
    isString(m.text) &&
    m.text !== "" &&
    optional(isString)(m.glossLang) &&
    optional(isString)(m.pos) &&
    optional(isString)(m.explanation) &&
    isTime(m.createdAt),
);

const readChoice = record<CloudChoice>(
  ["termId", "sourceId", "sentence", "meaningKey", "at", "deviceId"],
  (c) =>
    isString(c.termId) &&
    isString(c.sourceId) &&
    isString(c.sentence) &&
    (c.meaningKey === null || isString(c.meaningKey)) &&
    isTime(c.at) &&
    isDevice(c.deviceId),
);

const ROWS = {
  term: readTerm,
  source: readSource,
  occurrence: readOccurrence,
  page: readPage,
  sentence: readSentence,
} as const;

/**
 * Throws when `row` is not a row a cloud file can hold (the reader would leave it out):
 * the stores call it before keeping what a page sent, so IndexedDB never holds a row the
 * files would drop.
 */
export function assertCloudRow(kind: keyof typeof ROWS, row: unknown): void {
  if (ROWS[kind](row) === undefined)
    throw new TypeError(`Not a valid ${kind}: ${sample(row)}`);
}

/**
 * The rows of `data[field]` that pass `read` and `keep` (picked), each one that fails
 * added to `skipped`; undefined when the field is not a list (a damaged header).
 */
async function rows<T>(
  data: Dict,
  field: string,
  read: (item: unknown) => T | undefined,
  skipped: SkippedRow[],
  keep: (row: T) => boolean | Promise<boolean> = () => true,
): Promise<T[] | undefined> {
  const value = data[field];
  if (!Array.isArray(value)) return undefined;
  const passed = new Map<number, T>();
  // Only the meanings' check waits (a hash): the other lists stay synchronous.
  const waits: Promise<void>[] = [];
  value.forEach((item: unknown, index) => {
    const row = read(item);
    if (row === undefined) return;
    const kept = keep(row);
    if (kept instanceof Promise)
      waits.push(kept.then((yes) => void (yes && passed.set(index, row))));
    else if (kept) passed.set(index, row);
  });
  if (waits.length > 0) await Promise.all(waits);
  const out: T[] = [];
  value.forEach((item: unknown, index) => {
    const row = passed.get(index);
    if (row !== undefined) out.push(row);
    else skipped.push({ list: field, index, row: sample(item) });
  });
  return out;
}

const isTimes = (value: unknown): value is Record<string, number> =>
  isObject(value) && Object.values(value).every(isTime);

type Read = { file: CloudFile; skipped: SkippedRow[] } | { reason: string };

/**
 * A file of this version, header first: a header that fails its check (`deviceId`,
 * `writtenAt`, `kind`, a month file's `month`, a list that is not a list, `main`'s
 * settings, `historyClearedAt` and `historyForgotten`) makes the file damaged; a row
 * that fails is left out. A row fails on its own fields, and when what it refers to in
 * the same file was left out or is missing: a choice's meaning (`main`), an
 * occurrence's source and a sentence's page (month files). A month file's row also
 * fails when another device recorded it or it was recorded in another month.
 */
async function readFile(data: Dict): Promise<Read> {
  if (!isDevice(data.deviceId)) return { reason: "deviceId" };
  if (!isTime(data.writtenAt)) return { reason: "writtenAt" };
  const header = {
    format: FORMAT,
    v: CLOUD_VERSION,
    deviceId: data.deviceId,
    writtenAt: data.writtenAt,
  } as const;
  const skipped: SkippedRow[] = [];
  if (data.kind === "main") {
    const terms = await rows(data, "terms", readTerm, skipped);
    const sources = await rows(data, "sources", readSource, skipped);
    // A meaning's key is its hash: one whose key does not match is damaged.
    const meanings = await rows(
      data,
      "meanings",
      readMeaning,
      skipped,
      async (m) => m.key === (await meaningKey(m.termId, m.from, m.text)),
    );
    const named = new Set(meanings?.map((m) => m.key));
    const meaningChoices = await rows(
      data,
      "meaningChoices",
      readChoice,
      skipped,
      (c) => c.meaningKey === null || named.has(c.meaningKey),
    );
    const { settings, historyClearedAt, historyForgotten } = data;
    if (!terms || !sources || !meanings || !meaningChoices)
      return { reason: "a list of main" };
    if (
      !isObject(settings) ||
      !isObject(settings.values) ||
      !isTimes(settings.times)
    )
      return { reason: "settings" };
    if (!isTime(historyClearedAt)) return { reason: "historyClearedAt" };
    if (!isTimes(historyForgotten)) return { reason: "historyForgotten" };
    return {
      file: {
        ...header,
        kind: "main",
        terms,
        sources,
        meanings,
        meaningChoices,
        settings: { values: settings.values, times: settings.times },
        historyClearedAt,
        historyForgotten,
      },
      skipped,
    };
  }
  if (data.kind !== "occurrences" && data.kind !== "history")
    return { reason: "kind" };
  const { month } = data;
  if (!isString(month) || !MONTH.test(month)) return { reason: "month" };
  /** A month file holds only rows its writer recorded in that month. */
  const own = (r: { deviceId: string; addedAt: number }) =>
    r.deviceId === header.deviceId && monthOf(r.addedAt) === month;
  if (data.kind === "occurrences") {
    const sources = await rows(data, "sources", readSource, skipped);
    const ids = new Set(sources?.map((s) => s.id));
    const occurrences = await rows(
      data,
      "occurrences",
      readOccurrence,
      skipped,
      (o) => own(o) && ids.has(o.sourceId),
    );
    if (!sources || !occurrences) return { reason: "a list of occurrences" };
    return {
      file: { ...header, kind: "occurrences", month, sources, occurrences },
      skipped,
    };
  }
  const pages = await rows(data, "pages", readPage, skipped);
  const ids = new Set(pages?.map((p) => p.id));
  const sentences = await rows(
    data,
    "sentences",
    readSentence,
    skipped,
    (s) => own(s) && ids.has(s.pageId),
  );
  if (!pages || !sentences) return { reason: "a list of history" };
  return {
    file: { ...header, kind: "history", month, pages, sentences },
    skipped,
  };
}
