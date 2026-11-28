// Hover lines for gate words from a variant build of an en-<native> pack.
//   REPO=<checkout> PACKDIR=<dir holding en-<native>> NATIVE=<code> npx jiti gate-lines.ts <words.json> <out.json>
// Without PACKDIR the checkout's own pack is read. Writes {word: {kind: dict|translated|none, lines, source}}.
import { readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
const REPO = process.env.REPO!;
const PACKDIR = process.env.PACKDIR;
const NATIVE = process.env.NATIVE!;
if (!REPO || !NATIVE) throw new Error("set REPO and NATIVE");
const { createLanguageResources } = await import(`${REPO}/src/background/language-resources.ts`);
const { createPackLoader } = await import(`${REPO}/src/core/packs/load.ts`);
const { packSourcePath } = await import(`${REPO}/scripts/data/formats.ts`);
const loadPack = createPackLoader(async (path: string) => {
  const m = new RegExp(`^/?packs/(en-${NATIVE})/(.*)$`).exec(path);
  const file = PACKDIR && m ? join(PACKDIR, m[1]!, m[2]!) : packSourcePath(path);
  return JSON.parse(await readFile(file, "utf8"));
});
const resources = createLanguageResources(loadPack);
const dictionary = await resources.dictionary("en", NATIVE);
const words: string[] = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const out: Record<string, { kind: string; lines?: string[]; source?: string }> = {};
for (const key of words) {
  const e = dictionary.entry(key);
  if (!e) { out[key] = { kind: "none" }; continue; }
  const foreign = e.glossLang !== undefined && e.glossLang !== NATIVE;
  out[key] = { kind: foreign ? "translated" : "dict", lines: e.lines, ...(e.source && { source: e.source }) };
}
writeFileSync(process.argv[3]!, JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, "words;", Object.values(out).filter((o) => o.kind === "dict").length, "dict");
