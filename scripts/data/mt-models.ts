// Writes the model packs (data/packs/mt-<from>-<to>/): Mozilla's released translation
// models for the phone app's on-device translator (Bergamot), each file checked by
// SHA-256 against its pin below and split into parts below the CDNs' per-file limit,
// with the `manifest.json` the app's translation host reads (src/core/packs/model-manifest.ts;
// docs/specs/architecture.md "Model packs").
//
// Only manifest.json is committed: the parts are git-ignored and are made again from
// the pins, byte for byte (`npm run data:publish` builds a model pack's lock entry from
// its manifest; packs.yml runs this script before it publishes).
//
// Usage:
//   npm run data:mt-models [-- mt-en-ja …]   writes the pinned packs (all, or those named)
//   npm run data:mt-models -- --pin en-ja …  prints a pin for MT_MODELS from the registry's
//                                            release for each direction (to add a model)
// The downloads (gzipped, as Mozilla's bucket serves them) are kept in data/raw/mt/.
// Node's built-ins only: packs.yml runs it without `npm ci`.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import type { PackLockFile } from "../../src/core/packs/lock.ts";
import type { ModelPackName } from "../../src/core/packs/pairs.ts";
import {
  MODEL_FORMAT,
  MODEL_MANIFEST,
  type ModelFile,
  type ModelManifest,
} from "../../src/core/packs/model-manifest.ts";
import { byCodeUnit, PACKS_DIR, RAW_DIR } from "./common.ts";

/** Mozilla's bucket of trained models; the registry lists them (docs/notes/mobile.md "Licences"). */
export const MODEL_BUCKET =
  "https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data";
const REGISTRY_URL = `${MODEL_BUCKET}/db/models.json`;
export const MODEL_REGISTRY_PAGE =
  "https://mozilla.github.io/translations/model-registry/";

/**
 * The most bytes in one file of a model pack. jsDelivr refuses an npm file over 50 MB
 * ("File size exceeded the configured limit of 50 MB", measured 2026-11-26) and a
 * package over 150 MB (its README); unpkg served a 140 MB file and states no limit. A
 * model is up to about 60 MB, so its files are split; 8 MiB parts also keep what a
 * dropped connection on a phone costs to one part.
 */
export const PART_BYTES = 8 * 1024 * 1024;

/** Firefox's file types of a model (its translations-engine.worker.js `MODEL_FILE_ALIGNMENTS`). */
type FileType = "model" | "lex" | "vocab" | "srcvocab" | "trgvocab";

/** A model file as it is pinned: its name in Mozilla's folder (without `.gz`), size and SHA-256 unpacked. */
interface PinnedFile {
  readonly name: string;
  readonly size: number;
  readonly sha256: string;
}

/** One direction's model as released in the registry, pinned file by file. */
export interface ModelPin {
  readonly from: string;
  readonly to: string;
  /** The registry's architecture ("base-memory" is what Firefox ships to Android). */
  readonly architecture: string;
  /** The model's folder in the bucket, which holds each file gzipped (`<name>.gz`). */
  readonly dir: string;
  readonly files: Readonly<Partial<Record<FileType, PinnedFile>>>;
}

/**
 * The models published as packs (M5b: English → Japanese; M5e adds the other 17
 * directions with `--pin`). Each is the registry's release for Android ("Release
 * Android", else "Release"), the same files Firefox's Remote Settings serve.
 */
export const MT_MODELS: readonly ModelPin[] = [
  {
    from: "en",
    to: "ja",
    architecture: "base-memory",
    dir: "models/en-ja/llmaat_finetune10M_qe8_f2_ApiGGQIwTKuF9i_k3n9Q2Q/exported",
    files: {
      model: {
        name: "model.enja.intgemm.alphas.bin",
        size: 43_849_787,
        sha256:
          "59ae659f9bb63e4f81f474fe3c03d3f4499434b5f9e779fab7c12a45f31fd562",
      },
      lex: {
        name: "lex.50.50.enja.s2t.bin",
        size: 4_128_360,
        sha256:
          "edfb7eb47b98a2689b804ab3614c31b24f1257aa54b1154da3d85e1ae8152d9f",
      },
      srcvocab: {
        name: "srcvocab.enja.spm",
        size: 796_275,
        sha256:
          "970c98d174fc01e0339fbabbf45af36a4be3f26f819ec1a5ea1189f71e091889",
      },
      trgvocab: {
        name: "trgvocab.enja.spm",
        size: 827_144,
        sha256:
          "3b3d9f8f3a034d98d0a476f1794fa79c01e4e98a967ceb6777a66ba2d03ec1e1",
      },
    },
  },
];

export const modelPackName = (pin: Pick<ModelPin, "from" | "to">) =>
  `mt-${pin.from}-${pin.to}` as ModelPackName;

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/**
 * A file's parts of at most `partBytes` bytes, in order: the file itself under its name
 * when it fits in one, else `<name>.1`, `<name>.2`, ….
 */
export function splitFile(
  name: string,
  bytes: Uint8Array,
  partBytes = PART_BYTES,
): { path: string; bytes: Uint8Array }[] {
  if (bytes.length <= partBytes) return [{ path: name, bytes }];
  const parts = [];
  for (let at = 0, i = 1; at < bytes.length; at += partBytes, i++)
    parts.push({
      path: `${name}.${i}`,
      bytes: bytes.subarray(at, at + partBytes),
    });
  return parts;
}

/** The file the parts make, joined in order (as the app's translation host reads it). */
export const joinParts = (parts: readonly Uint8Array[]) => Buffer.concat(parts);

/** Bergamot's `gemm-precision` for a model file, as Firefox 145 chooses it. */
export const gemmPrecision = (modelName: string) =>
  modelName.endsWith("intgemm8.bin") ? "int8shiftAll" : "int8shiftAlphaAll";

/** Why `bytes` is not the pinned file; undefined when it is. */
function pinProblem(file: PinnedFile, bytes: Uint8Array) {
  if (bytes.length !== file.size)
    return `${file.name}: ${bytes.length} bytes, pinned ${file.size}`;
  const hash = sha256(bytes);
  if (hash !== file.sha256)
    return `${file.name}: SHA-256 ${hash}, pinned ${file.sha256}`;
  return undefined;
}

/**
 * Writes a model pack's folder (replaced) from the model's files as `read` gives them
 * (unpacked): each checked against its pin and split into parts, then manifest.json.
 * Returns the manifest.
 */
export function writeModelPack(
  pin: ModelPin,
  read: (file: PinnedFile) => Uint8Array,
  outDir: string,
  partBytes = PART_BYTES,
): ModelManifest {
  const types = Object.keys(pin.files) as FileType[];
  const vocabs = types.filter((type) => type.endsWith("vocab")).sort();
  if (
    !pin.files.model ||
    !pin.files.lex ||
    !(vocabs.join() === "vocab" || vocabs.join() === "srcvocab,trgvocab")
  )
    throw new Error(
      `${modelPackName(pin)}: needs a model, a lex and a vocab (or a srcvocab and a trgvocab)`,
    );
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const files: Partial<Record<FileType, ModelFile>> = {};
  for (const type of types) {
    const file = pin.files[type]!;
    const bytes = read(file);
    const problem = pinProblem(file, bytes);
    if (problem) throw new Error(`${modelPackName(pin)}: ${problem}`);
    const parts = splitFile(file.name, bytes, partBytes);
    if (sha256(joinParts(parts.map((part) => part.bytes))) !== file.sha256)
      throw new Error(`${file.name}: its parts do not join back`);
    for (const part of parts)
      writeFileSync(join(outDir, part.path), part.bytes);
    files[type] = {
      size: file.size,
      sha256: file.sha256,
      parts: parts.map((part) => ({
        path: part.path,
        size: part.bytes.length,
        sha256: sha256(part.bytes),
      })),
    };
  }
  const manifest = {
    v: MODEL_FORMAT,
    from: pin.from,
    to: pin.to,
    gemmPrecision: gemmPrecision(pin.files.model.name),
    files: files as ModelManifest["files"],
  } satisfies ModelManifest;
  writeFileSync(
    join(outDir, MODEL_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

/**
 * A model pack's files as the lock lists them, from its manifest alone (the parts are
 * git-ignored): every part, and manifest.json, sorted by path as `listPackFiles` sorts
 * them.
 */
export function modelPackFiles(dir: string): PackLockFile[] {
  const path = join(dir, MODEL_MANIFEST);
  if (!existsSync(path)) return [];
  const bytes = readFileSync(path);
  const manifest = JSON.parse(bytes.toString("utf8")) as ModelManifest;
  return [
    { path: MODEL_MANIFEST, size: bytes.length, sha256: sha256(bytes) },
    ...Object.values(manifest.files).flatMap((file: ModelFile) => file.parts),
  ]
    .map(({ path, size, sha256 }) => ({ path, size, sha256 }))
    .sort((a, b) => byCodeUnit(a.path, b.path));
}

/** The model file's gzipped download, kept in data/raw/mt/<from>-<to>/ (fetched once). */
async function download(pin: ModelPin, name: string) {
  const dir = join(RAW_DIR, "mt", `${pin.from}-${pin.to}`);
  const path = join(dir, `${name}.gz`);
  if (!existsSync(path)) {
    const url = `${MODEL_BUCKET}/${pin.dir}/${name}.gz`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${path}.part`, new Uint8Array(await response.arrayBuffer()));
    renameSync(`${path}.part`, path);
  }
  return readFileSync(path);
}

/** Unpacks a download, refusing more than `maxBytes` (the pin's size, or a cap). */
const gunzip = (bytes: Uint8Array, maxBytes: number) =>
  gunzipSync(bytes, { maxOutputLength: maxBytes });

/** Downloads, checks and writes the pinned packs. */
async function build(pins: readonly ModelPin[]) {
  for (const pin of pins) {
    const unpacked = new Map<string, Uint8Array>();
    for (const file of Object.values(pin.files))
      unpacked.set(
        file.name,
        gunzip(await download(pin, file.name), file.size + 1),
      );
    const name = modelPackName(pin);
    const manifest = writeModelPack(
      pin,
      (file) => unpacked.get(file.name)!,
      join(PACKS_DIR, name),
    );
    const files = Object.values(manifest.files) as ModelFile[];
    const bytes = files.reduce((sum, file) => sum + file.size, 0);
    console.log(
      `${name}: ${files.reduce((n, file) => n + file.parts.length, 0)} parts, ${(bytes / 1e6).toFixed(1)} MB, gemm ${manifest.gemmPrecision}`,
    );
  }
}

interface RegistryEntry {
  architecture: string;
  releaseStatus: string | null;
  files: Record<string, { path: string; uncompressedHash?: string }>;
}

/**
 * The registry's release of a direction for the phone: "Release Android" where the
 * registry names one, else "Release".
 */
export function releaseFor(entries: readonly RegistryEntry[]) {
  return (
    entries.find((entry) => entry.releaseStatus === "Release Android") ??
    entries.find((entry) => entry.releaseStatus === "Release")
  );
}

/** The registry's file keys → Firefox's file types. */
const REGISTRY_TYPES: Readonly<Record<string, FileType>> = {
  model: "model",
  lexicalShortlist: "lex",
  vocab: "vocab",
  srcVocab: "srcvocab",
  trgVocab: "trgvocab",
};

/** Prints a pin for each direction ("en-ko"), from the registry's release, its files downloaded and hashed. */
async function printPins(directions: readonly string[]) {
  const response = await fetch(REGISTRY_URL);
  if (!response.ok) throw new Error(`${REGISTRY_URL}: HTTP ${response.status}`);
  const registry = (await response.json()) as {
    models: Record<string, RegistryEntry[]>;
  };
  const pins = [];
  for (const direction of directions) {
    const [from = "", to = ""] = direction.split("-");
    const release = releaseFor(registry.models[direction] ?? []);
    if (!release) throw new Error(`${direction}: no release in the registry`);
    const paths = Object.values(release.files).map((file) => file.path);
    const dir = paths[0]!.slice(0, paths[0]!.lastIndexOf("/"));
    const files: Partial<Record<FileType, PinnedFile>> = {};
    for (const [key, { path }] of Object.entries(release.files)) {
      const type = REGISTRY_TYPES[key];
      if (!type || !path.startsWith(`${dir}/`) || !path.endsWith(".gz"))
        throw new Error(`${direction}: unexpected file ${key} ${path}`);
      const name = path.slice(dir.length + 1, -".gz".length);
      const bytes = gunzip(
        await download({ from, to, architecture: "", dir, files: {} }, name),
        512 * 1024 * 1024,
      );
      files[type] = { name, size: bytes.length, sha256: sha256(bytes) };
      const listed = release.files[key]!.uncompressedHash;
      if (listed && listed !== files[type].sha256)
        throw new Error(
          `${direction}: ${name} is not the registry's ${listed}`,
        );
    }
    pins.push({ from, to, architecture: release.architecture, dir, files });
  }
  console.log(JSON.stringify(pins, null, 2));
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { pin: { type: "boolean", default: false } },
  });
  if (values.pin) return printPins(positionals);
  const unknown = positionals.filter(
    (name) => !MT_MODELS.some((pin) => modelPackName(pin) === name),
  );
  if (unknown.length > 0)
    throw new Error(`Not a pinned model pack: ${unknown.join(", ")}`);
  return build(
    positionals.length === 0
      ? MT_MODELS
      : MT_MODELS.filter((pin) => positionals.includes(modelPackName(pin))),
  );
}

if (import.meta.main) await main();
