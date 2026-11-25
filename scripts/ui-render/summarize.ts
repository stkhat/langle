// Sums up the render sweep (sweep.spec.ts): issues per locale and type, controls that
// wrapped where English stays on one line and grew taller, labels that wrap in a row of
// buttons, and English strings left in another locale. Writes summary.json beside the results and prints the counts.
// Usage: node scripts/ui-render/summarize.ts [dir] (default $UI_RENDER_OUT or reports/ui-render)
import fs from "node:fs";
import path from "node:path";
import type { Control, Issue, Measured } from "./measure.ts";

type Value = string | Record<string, string>;
interface Result {
  code: string;
  layout: string;
  results: Record<string, Measured & { shot: string }>;
  console: string[];
}
interface Row {
  code: string;
  layout: string;
  surface: string;
  type: string;
  path: string;
  text: string;
  detail?: string;
  shot: string;
}

const ROOT = path.resolve(import.meta.dirname, "../..");
const DIR = path.resolve(
  ROOT,
  process.argv[2] ?? process.env.UI_RENDER_OUT ?? "reports/ui-render",
);
const LOCALES = path.join(ROOT, "src/i18n/locales");
const read = (code: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES, `${code}.json`), "utf8"),
  ) as Record<string, Value>;
const en = read("en");
const forms = (v: Value | undefined) =>
  v === undefined ? [] : typeof v === "string" ? [v] : Object.values(v);
const escape = (s: string) => s.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
/** A text as a pattern: its placeholders match anything. */
const pattern = (text: string) =>
  new RegExp("^" + escape(text).replace(/\{\w+\}/g, ".+?") + "$");

/** English texts (as patterns) whose translation in `code` differs. */
function englishLeft(code: string) {
  const own = read(code);
  const patterns: { key: string; re: RegExp }[] = [];
  for (const [key, value] of Object.entries(en)) {
    const mine = forms(own[key]);
    for (const text of forms(value)) {
      // Enough English of its own to tell (not "{name} · {size}").
      const own = text.replace(/\{\w+\}|Langle/g, "");
      if ((own.match(/[A-Za-z]/g) ?? []).length < 4) continue;
      if (mine.includes(text)) continue;
      patterns.push({ key, re: pattern(text) });
    }
  }
  return patterns;
}

/** Letters a text has of its own, placeholders aside. */
const ownLetters = (text: string) =>
  (text.replace(/\{\w+\}/g, "").match(/\p{L}/gu) ?? []).length;

/**
 * All of `code`'s texts with words of their own (not "{a} de {b}", which matches any
 * meaning): an ellipsis on one of them cuts the interface.
 */
const uiTexts = (code: string) =>
  Object.values(read(code))
    .flatMap(forms)
    .filter((text) => ownLetters(text) >= 4)
    .map(pattern);

/** Issue types that are not breakage on their own. */
const INFO = new Set(["scrollX", "ellipsisContent", "overlapPositioned"]);
/** What Chrome itself writes where built-in AI is off (e2e/error-collector.ts). */
const CHROME_NOTE = /On-device AI is disabled|model execution was disabled/;

const results = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && f !== "summary.json")
  .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Result);
const english = new Map(
  results.filter((r) => r.code === "en").map((r) => [r.layout, r]),
);

const rows: Row[] = [];
const missing: string[] = [];
const consoleLines: string[] = [];
for (const r of results) {
  const left = r.code === "en" ? [] : englishLeft(r.code);
  const own = uiTexts(r.code);
  const base = english.get(r.layout);
  for (const line of r.console)
    if (!CHROME_NOTE.test(line))
      consoleLines.push(`${r.code} ${r.layout} ${line}`);
  for (const [surface, m] of Object.entries(r.results)) {
    const push = (i: Issue) =>
      rows.push({
        code: r.code,
        layout: r.layout,
        surface,
        shot: m.shot,
        ...i,
      });
    for (const i of m.issues)
      push(
        i.type === "ellipsis" && !own.some((re) => re.test(i.text))
          ? { ...i, type: "ellipsisContent" }
          : i,
      );
    if (m.lang !== r.code)
      push({ type: "wrongLang", path: "", text: `${m.lang}` });
    for (const text of m.texts)
      for (const { key, re } of left)
        if (re.test(text)) push({ type: "english", path: key, text });
    for (const text of m.attrs)
      for (const { key, re } of left)
        if (re.test(text)) push({ type: "englishAttr", path: key, text });
    const theirs = base?.results[surface];
    const enControls = new Map<string, Control>(
      (theirs?.controls ?? []).map((c) => [c.path, c]),
    );
    // A label in a row of buttons that wraps where English keeps one line (or in
    // English itself): the row's height or its equal widths no longer hold.
    for (const c of m.controls) {
      if (!c.row || c.wraps <= 1) continue;
      const e = r.code === "en" ? undefined : enControls.get(c.path);
      if (e && e.wraps > 1) continue;
      push({
        type: "rowWrap",
        path: c.path,
        text: c.text,
        detail: `${c.wraps} lines in ${c.w}px${e ? ` (en "${e.text.slice(0, 30)}" ${e.w}px)` : ""}`,
      });
    }
    if (!theirs || r.code === "en") continue;
    for (const c of m.controls) {
      const e = enControls.get(c.path);
      if (e && e.lines <= 1 && c.lines > 1 && c.h > e.h + 2)
        push({
          type: "grew",
          path: c.path,
          text: c.text,
          detail: `${e.h}->${c.h}px, ${c.lines} lines (en "${e.text.slice(0, 30)}")`,
        });
    }
  }
}
// Surfaces English reached that a locale did not.
for (const [layout, base] of english)
  for (const r of results.filter((x) => x.layout === layout && x.code !== "en"))
    for (const surface of Object.keys(base.results))
      if (!r.results[surface])
        missing.push(`${r.code} ${layout} ${surface}: missing`);

const counts: Record<string, Record<string, number>> = {};
for (const row of rows) {
  const c = (counts[row.code] ??= {});
  c[row.type] = (c[row.type] ?? 0) + 1;
}
const types = [...new Set(rows.map((r) => r.type))].sort();
fs.writeFileSync(
  path.join(DIR, "summary.json"),
  JSON.stringify({ counts, missing, console: consoleLines, rows }, null, 1),
);
console.log(["locale", ...types].join("\t"));
for (const code of Object.keys(counts).sort())
  console.log([code, ...types.map((t) => counts[code]![t] ?? 0)].join("\t"));
const breakage = rows.filter((r) => !INFO.has(r.type)).length;
console.log(
  `rows ${rows.length} (breakage ${breakage}), missing ${missing.length}, console ${consoleLines.length}`,
);
for (const m of missing.slice(0, 10)) console.log("  " + m);
for (const c of consoleLines.slice(0, 10)) console.log("  " + c);
