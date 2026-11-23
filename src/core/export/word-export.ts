/**
 * Saved words as files for other tools (ui.md "Word list page" → "Export"): an Anki
 * import file (tab-separated text with Anki's file headers) and a CSV for
 * spreadsheets. Pure: the word list gathers the rows and downloads the text.
 */

/** One saved word or phrase, as the word list shows it. */
export interface ExportWord {
  /** The term's id ("en:figure out"): the Anki note's guid, so importing again updates it. */
  id: string;
  /** The term as written. */
  head: string;
  kind: "word" | "phrase";
  status: "learning" | "known";
  /** The Meaning column's text, in the native language where there is one. */
  meaning: string;
  ipa?: string;
  /** Where it was saved, else where it was last seen. */
  sentence?: string;
  source?: { title: string; link: string };
  seen: number;
  lastSeen: number;
  createdAt: number;
  learnedAt?: number;
}

/** The column names and values the CSV writes (from `t`, so they can be switched). */
export interface CsvLabels {
  columns: readonly string[];
  kind: Record<ExportWord["kind"], string>;
  status: Record<ExportWord["status"], string>;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A local date as YYYY-MM-DD. */
const isoDate = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** `langle-anki-en-ja-2026-11-24.txt`, `langle-words-en-ja-2026-11-24.csv`. */
export function exportFileName(
  format: "anki" | "csv",
  learning: string,
  native: string,
  date: Date,
): string {
  const name = format === "anki" ? "anki" : "words";
  const ext = format === "anki" ? "txt" : "csv";
  return `langle-${name}-${learning}-${native}-${isoDate(date.getTime())}.${ext}`;
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** One line of a field: no tabs or line breaks, which separate fields and notes. */
const oneLine = (text: string) => text.replace(/[\t\r\n]+/g, " ").trim();

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The sentence as HTML with the term in bold where it is written as saved (any case,
 * not inside another word); a form the sentence inflects stays plain.
 */
export function sentenceHtml(sentence: string, head: string): string {
  const text = oneLine(sentence);
  const term = oneLine(head);
  if (term === "") return escapeHtml(text);
  const found = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(term).replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`,
    "iu",
  ).exec(text);
  if (!found) return escapeHtml(text);
  const end = found.index + found[0].length;
  return (
    escapeHtml(text.slice(0, found.index)) +
    `<b>${escapeHtml(found[0])}</b>` +
    escapeHtml(text.slice(end))
  );
}

/** A link Anki may open: only http(s). */
const safeLink = (link: string) => /^https?:\/\//i.test(link);

function ankiBack(word: ExportWord): string {
  const parts: string[] = [];
  if (word.meaning) parts.push(escapeHtml(oneLine(word.meaning)));
  if (word.ipa) parts.push(escapeHtml(oneLine(word.ipa)));
  if (word.sentence)
    parts.push(`<i>${sentenceHtml(word.sentence, word.head)}</i>`);
  if (word.source) {
    const title = escapeHtml(oneLine(word.source.title || word.source.link));
    parts.push(
      safeLink(word.source.link)
        ? `<a href="${escapeHtml(word.source.link)}">${title}</a>`
        : title,
    );
  }
  return parts.join("<br>");
}

/** Anki tags: no spaces inside one. */
const tag = (text: string) => text.replace(/\s+/g, "_");

/**
 * An Anki import file: Basic notes (front: the term; back: meaning, IPA, the sentence
 * with the term in bold, the source linked), the term's id as the note's guid so a
 * later import updates the same notes, and tags `langle`, the status and `phrase`.
 * Anki reads the headers (2.1.54+) and picks the note type and deck itself.
 */
export function ankiFile(words: readonly ExportWord[], deck: string): string {
  const lines = [
    "#separator:tab",
    "#html:true",
    "#notetype:Basic",
    `#deck:${oneLine(deck)}`,
    "#guid column:1",
    "#tags column:4",
  ];
  for (const word of words) {
    const tags = [
      "langle",
      word.status,
      ...(word.kind === "phrase" ? ["phrase"] : []),
    ];
    lines.push(
      [
        oneLine(word.id),
        escapeHtml(oneLine(word.head)),
        ankiBack(word),
        tags.map(tag).join(" "),
      ].join("\t"),
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * A CSV cell (RFC 4180): quoted when it holds a comma, a quote or a line break. A cell
 * a spreadsheet would read as a formula (=, +, @, or a tab or carriage return first)
 * gets a leading apostrophe; "-" is left alone, as words start with it ("-ish").
 */
export function csvCell(value: string): string {
  const text = /^[=+@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The words as CSV: a byte order mark (so Excel reads UTF-8), CRLF line ends, one row
 * per word under the column names.
 */
export function csvFile(
  words: readonly ExportWord[],
  labels: CsvLabels,
): string {
  const rows = [labels.columns.map(csvCell).join(",")];
  for (const word of words)
    rows.push(
      [
        word.head,
        labels.kind[word.kind],
        labels.status[word.status],
        word.meaning,
        word.ipa ?? "",
        word.sentence ?? "",
        word.source?.title ?? "",
        word.source?.link ?? "",
        String(word.seen),
        isoDate(word.lastSeen),
        isoDate(word.createdAt),
        word.learnedAt === undefined ? "" : isoDate(word.learnedAt),
      ]
        .map(csvCell)
        .join(","),
    );
  return "﻿" + rows.join("\r\n") + "\r\n";
}
