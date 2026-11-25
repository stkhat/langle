// Guards on the size of the language packs (docs/notes/data-sizes.md). Every pack is
// downloaded (none is bundled), but each file stays well under the 5 MB that
// addons.mozilla.org's linter (web-ext lint) allows per text file, so a pack could
// still ship inside the extension. The phone app's translation models (mt-*) are
// binary, downloaded by its native code, and have their own guards below.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  learningLanguages,
  nativeLanguages,
} from "../../src/core/languages.ts";
import { packsFor } from "../../src/core/packs/pairs.ts";
import { PACKS_DIR } from "./common.ts";
import type { PackLock } from "../../src/core/packs/lock.ts";
import { MODEL_PACKS, PACKS } from "./formats.ts";
import { PART_BYTES } from "./mt-models.ts";
import { LOCK_PATH } from "./publish.ts";

const FILE_LIMIT_BYTES = 4_000_000;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const bytesUnder = (dir: string) =>
  filesUnder(dir).reduce((sum, path) => sum + statSync(path).size, 0);

describe("pack files in data/packs", () => {
  const files = filesUnder(PACKS_DIR).filter(
    (path) => !relative(PACKS_DIR, path).startsWith("mt-"),
  );

  it("exist", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  it.each(files.map((path) => [relative(PACKS_DIR, path), path]))(
    "%s is under 4 MB",
    (_file, path) => {
      expect(statSync(path).size).toBeLessThan(FILE_LIMIT_BYTES);
    },
  );
});

// What one offered pair downloads (its packs, `packsFor`), in each test's name so that
// every run shows its growth. It fails only past a sanity ceiling of 80 MB raw, which
// catches accidents (a pack built twice, a dictionary left unsharded), not normal
// growth: translation quality comes before pack size for now (user, 2026-11-21; the
// ceiling replaced D0's limit of 40 MB per pair). English → Japanese, the largest, is
// about 31 MB raw and 8 MB gzipped on the wire.
const PAIR_CEILING_BYTES = 80_000_000;
const pairs = learningLanguages().flatMap((learning) =>
  nativeLanguages(learning).map((native) => {
    const packs = packsFor(learning, native);
    const bytes = packs.reduce(
      (sum, pack) => sum + bytesUnder(PACKS[pack].dir),
      0,
    );
    return [
      `${learning}→${native}`,
      `${(bytes / 1e6).toFixed(2)} MB raw`,
      packs.length,
      bytes,
    ] as const;
  }),
);

it.each(pairs)(
  "%s downloads %s, within the 80 MB sanity ceiling",
  (_pair, _size, packs, bytes) => {
    expect(packs).toBeGreaterThan(0);
    expect(bytes).toBeLessThanOrEqual(PAIR_CEILING_BYTES);
  },
);

// Every English page loads these: the tagger and the phrase patterns with the language
// pack, the sense labels with the dictionary; every Spanish and French page its tagger
// (docs/notes/data-sizes.md). The phrase
// patterns are every multi-word entry of the source (rule B1): about 73,000, and the
// names that are units as written (about 2,500: 450 → 470 KB, 2026-11-20).
describe.each([
  ["en/tagger.json", 150_000],
  ["en/contractions.json", 5_000],
  ["es/tagger.json", 150_000],
  ["fr/tagger.json", 150_000],
  ["en/phrases.json", 470_000],
  ["en-ja/pos.json", 100_000],
])("%s", (file, budget) => {
  it(`stays under ${budget / 1000} KB gzipped`, () => {
    const bytes = gzipSync(readFileSync(join(PACKS_DIR, file))).length;
    expect(bytes).toBeLessThan(budget);
  });
});

// A model pack's files are parts of at most 8 MiB (PART_BYTES), well below jsDelivr's
// 50 MB per file, and its package stays below jsDelivr's 150 MB per package
// (docs/specs/architecture.md "Model packs"). Each test's name shows the download.
const JSDELIVR_PACKAGE_BYTES = 150_000_000;
const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as PackLock;
const models = Object.keys(MODEL_PACKS).map((name) => {
  const entry = lock.packs[name as keyof PackLock["packs"]]!;
  const bytes = entry.files.reduce((sum, file) => sum + file.size, 0);
  return [name, `${(bytes / 1e6).toFixed(2)} MB`, entry, bytes] as const;
});
it.each(models)(
  "%s downloads %s in parts of at most 8 MiB, below jsDelivr's 150 MB per package",
  (_name, _size, entry, bytes) => {
    expect(entry.kind).toBe("model");
    for (const file of entry.files)
      expect(file.size).toBeLessThanOrEqual(PART_BYTES);
    expect(bytes).toBeLessThan(JSDELIVR_PACKAGE_BYTES);
  },
);
