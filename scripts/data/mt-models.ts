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
  {
    from: "en",
    to: "es",
    architecture: "base-memory",
    dir: "models/en-es/retrain_hr_fix_names_CUAEXUHoQum_cFqh-ZAryw/exported",
    files: {
      lex: {
        name: "lex.50.50.enes.s2t.bin",
        size: 4198436,
        sha256:
          "7d51237c0a07027dcd61643cfbbb0f8c48597d19907ef53d2cae9d6bec2cf25c",
      },
      model: {
        name: "model.enes.intgemm.alphas.bin",
        size: 31561787,
        sha256:
          "3b1c399511c01c84c36fae5c0524df44096288efdc8236e182b5c97d7ad2244c",
      },
      vocab: {
        name: "vocab.enes.spm",
        size: 816054,
        sha256:
          "5ae254fa9b15aa182e70fd2a6186b1333c63a29a48043a9224c6aa4fcac058ad",
      },
    },
  },
  {
    from: "en",
    to: "pt",
    architecture: "base-memory",
    dir: "models/en-pt/retrain_hr_fix_names_Vnb0RUXTTd67hR-oLHM3eg/exported",
    files: {
      lex: {
        name: "lex.50.50.enpt.s2t.bin",
        size: 3970340,
        sha256:
          "ccb4c31c9e1899d77a200e71a86958e6ef6c8649627d0bbf3f873b57d9f236bd",
      },
      model: {
        name: "model.enpt.intgemm.alphas.bin",
        size: 31561787,
        sha256:
          "07892fd2544ee79dcb643615d8f2debb9793fae16842e87c328e27a3dd26a770",
      },
      vocab: {
        name: "vocab.enpt.spm",
        size: 816726,
        sha256:
          "d9f46182823d5bbc84201252b2dfcac28f63e561f0ec827ed858f241864c9def",
      },
    },
  },
  {
    from: "en",
    to: "ru",
    architecture: "base-memory",
    dir: "models/en-ru/retrain_base-memory_KJ23-iDVTcymG1ZldWY17w/exported",
    files: {
      lex: {
        name: "lex.50.50.enru.s2t.bin",
        size: 2774540,
        sha256:
          "4d91839726b960e70b6d05c53d0cffd16262832b1c0e1ea99d66f412dcc6a239",
      },
      model: {
        name: "model.enru.intgemm.alphas.bin",
        size: 31561787,
        sha256:
          "184cb5cda528eeefc0f75f5d0035d787b71d74af135e3c5608d01ae02ecfb920",
      },
      vocab: {
        name: "vocab.enru.spm",
        size: 904455,
        sha256:
          "56ee63e14e8cb926c394242adc3ed7cc602644c3d33058cff2ce2959d52a6258",
      },
    },
  },
  {
    from: "en",
    to: "fr",
    architecture: "base-memory",
    dir: "models/en-fr/retrain_hr_NLIxDbE1TBGyOTI-zwZagw/exported",
    files: {
      lex: {
        name: "lex.50.50.enfr.s2t.bin",
        size: 4372936,
        sha256:
          "2585ed98d3af0bc949865aedeb390493d591f56870814376e73e4144c41ed059",
      },
      model: {
        name: "model.enfr.intgemm.alphas.bin",
        size: 31561787,
        sha256:
          "6322e296d4fecfe395a8d5723da4ec37ecbe6d7613bb1dfcf4b28e2a47498b68",
      },
      vocab: {
        name: "vocab.enfr.spm",
        size: 814404,
        sha256:
          "783abf3abe075afdf8d85d233994bef2c3a064e935ab1bed946820aff6ac002a",
      },
    },
  },
  {
    from: "en",
    to: "de",
    architecture: "base-memory",
    dir: "models/en-de/retrain_hr_fix_names_SCgGhxUPQ2WAECHLRtzrMg/exported",
    files: {
      lex: {
        name: "lex.50.50.ende.s2t.bin",
        size: 4347672,
        sha256:
          "7ed39f1cffbd68a27ddf05bbfe068de2060f1d7e69f1a20e27ae923551dd7393",
      },
      model: {
        name: "model.ende.intgemm.alphas.bin",
        size: 31561787,
        sha256:
          "8df29d9494d19f47fd5d97c6a73474c6f657e9f81c1a607c431d02befdf3810f",
      },
      vocab: {
        name: "vocab.ende.spm",
        size: 810073,
        sha256:
          "69f730becafa48e3bb2c244eab66456877c08959a02f2bd5519b5a3088b62f9c",
      },
    },
  },
  {
    from: "en",
    to: "zh",
    architecture: "base-memory",
    dir: "models/en-zh/llmaat_finetune10M_qe8_f2_ByQcSxGXQRqGi-UTxYE43g/exported",
    files: {
      lex: {
        name: "lex.50.50.enzh.s2t.bin",
        size: 4485184,
        sha256:
          "8575d8daa10e2dbff316dcdf8e1ce475357bcc2c92bdc63b736a2d5add22f681",
      },
      model: {
        name: "model.enzh.intgemm.alphas.bin",
        size: 43849787,
        sha256:
          "4e5accc141373565ddc8fa1565bceaa8d0c3482a82cab8131c719ebcc6c2157c",
      },
      srcvocab: {
        name: "srcvocab.enzh.spm",
        size: 806952,
        sha256:
          "bd9b65504acc6d9726dd281f7defc2adb7c2c22d0688fe2f84697de25197c8c5",
      },
      trgvocab: {
        name: "trgvocab.enzh.spm",
        size: 772004,
        sha256:
          "aded6993c36e440284d11cec3f6b8aef9c0e43188a772d80be342a713adf223d",
      },
    },
  },
  {
    from: "en",
    to: "it",
    architecture: "base-memory",
    dir: "models/en-it/retrain_hr_fix_names_GPSr_u8PSmC9fOx1ZDCHoA/exported",
    files: {
      lex: {
        name: "lex.50.50.enit.s2t.bin",
        size: 4133192,
        sha256:
          "8b21914804625b2777dae7fdb636eb78f02a3eb8b7bceaa50f29ac740961da93",
      },
      model: {
        name: "model.enit.intgemm.alphas.bin",
        size: 31561787,
        sha256:
          "248f47568788ecc351da7e5e07064d4153b4f71e011364ae2c931ffeec4d1cc2",
      },
      vocab: {
        name: "vocab.enit.spm",
        size: 812724,
        sha256:
          "3ef0211d4ae6db21440892f180f2019fe2bfc110a330ffa9d2eca9665e4f2bc5",
      },
    },
  },
  {
    from: "en",
    to: "pl",
    architecture: "base-memory",
    dir: "models/en-pl/retrain_hr_fix_names_YmTlfuUsSKCbUp75UXaUuw/exported",
    files: {
      lex: {
        name: "lex.50.50.enpl.s2t.bin",
        size: 3540052,
        sha256:
          "d7d7b364673f633763c9f8f2e8ee9c7a184e92f4086e8b84abe870a2a8dbe5d5",
      },
      model: {
        name: "model.enpl.intgemm.alphas.bin",
        size: 31561787,
        sha256:
          "b0b59716bcc8f46b8dc6ab5c32a2732acaad42a5a6d9ae9b472526a1bb0d71d4",
      },
      vocab: {
        name: "vocab.enpl.spm",
        size: 821612,
        sha256:
          "2000f182efa8ce5f69bc3f9e574666b5bc2c0af684eedd32f69d15aa9021ea85",
      },
    },
  },
  {
    from: "en",
    to: "th",
    architecture: "base-memory",
    dir: "models/en-th/new-opuscleaner-en-th-onestage-topk10_WIvJuHhrSyiXLtJBJOUrsA/exported",
    files: {
      lex: {
        name: "lex.50.50.enth.s2t.bin",
        size: 3016612,
        sha256:
          "6961ce07f38e6c113a70855706aa7cad4cc828f986d1751c33f14699f885a2e8",
      },
      model: {
        name: "model.enth.intgemm.alphas.bin",
        size: 31561787,
        sha256:
          "80e326097655fca75f841130da3338a849aa245374e1616448bcf37b9523a05a",
      },
      vocab: {
        name: "vocab.enth.spm",
        size: 993517,
        sha256:
          "5deff7093d558768f8c22406449202e27595f023cc383a2b66beed240ed46443",
      },
    },
  },
  {
    from: "en",
    to: "hi",
    architecture: "tiny",
    dir: "models/en-hi/h1-2025_KoJuCNf_Q42R2Bz6j2jlOQ/exported",
    files: {
      lex: {
        name: "lex.50.50.enhi.s2t.bin",
        size: 3504820,
        sha256:
          "b473f6fe41cdb7c1dbeeb714fc50314feab77b0af2b2da6f7830ee14492dd847",
      },
      model: {
        name: "model.enhi.intgemm.alphas.bin",
        size: 17141051,
        sha256:
          "18682fa6aa1c1b2f78a6fcbcb354755094d623e65436ef7821720c5213e11a49",
      },
      vocab: {
        name: "vocab.enhi.spm",
        size: 925360,
        sha256:
          "8017cbf812bae400794c424699b89de90db06ac7a4ca67a420013a9f68b270c1",
      },
    },
  },
  {
    from: "en",
    to: "ar",
    architecture: "base-memory",
    dir: "models/en-ar/retrain_base-memory_G3CmhwG_TZext3cys-udHg/exported",
    files: {
      lex: {
        name: "lex.50.50.enar.s2t.bin",
        size: 3139692,
        sha256:
          "2b7194817c5dd9225ca90c0d908cc92e1d6d1f45625781a5feb037ac568d6a61",
      },
      model: {
        name: "model.enar.intgemm.alphas.bin",
        size: 31561787,
        sha256:
          "ae659d7045fc2e5d6ba50583586a5d94ee4358d92c019847e37b57a0e627faa8",
      },
      vocab: {
        name: "vocab.enar.spm",
        size: 863591,
        sha256:
          "8d93c54aa5e2044c416ec680b5ff9af0227bd698521666e8b1a1ea1b041fbae8",
      },
    },
  },
  {
    from: "en",
    to: "id",
    architecture: "tiny",
    dir: "models/en-id/spring-2024_bbjDBFoDTNGSUo2if3ET_A/exported",
    files: {
      lex: {
        name: "lex.50.50.enid.s2t.bin",
        size: 3515428,
        sha256:
          "d37f72bcab6e7bc52fd223350f95521b5810bb2486a97275f86077988fced3f4",
      },
      model: {
        name: "model.enid.intgemm.alphas.bin",
        size: 17141051,
        sha256:
          "f81f13eef703a4e0650ffc3138a0f4bab7b6c8bfd173ef1b7bda68d16b8bc7e8",
      },
      vocab: {
        name: "vocab.enid.spm",
        size: 773211,
        sha256:
          "61bc7db24d3b6de638a02a280580a273fe0c942ecbe8a8204b2f81978211db22",
      },
    },
  },
  {
    from: "en",
    to: "tr",
    architecture: "tiny",
    dir: "models/en-tr/spring-2024_LiFGeNrEQpKdNlziG2qP_A/exported",
    files: {
      lex: {
        name: "lex.50.50.entr.s2t.bin",
        size: 3261300,
        sha256:
          "3aba0be842bd4c192659c781e6fdce8eb9b2b1fff29a40d22f75da369d59f46f",
      },
      model: {
        name: "model.entr.intgemm.alphas.bin",
        size: 17141051,
        sha256:
          "ea3cd4ee09de190df265c78d84260e277a9a8a3ddff05eb55d72afe7fc0fdbf4",
      },
      vocab: {
        name: "vocab.entr.spm",
        size: 798793,
        sha256:
          "a220363d60391f7ce3df8ec9785424dbc00c24d5786d1a4308cf8ca3ed3385c2",
      },
    },
  },
  {
    from: "en",
    to: "ko",
    architecture: "base-memory",
    dir: "models/en-ko/cjk_retrain_base-memory_GP50C3MpQ9apCWZOW-f3PA/exported",
    files: {
      lex: {
        name: "lex.50.50.enko.s2t.bin",
        size: 6449612,
        sha256:
          "96efba97d4bb93ab362e5569bea0f115184d2f68d63b67305ee663c18e32fbeb",
      },
      model: {
        name: "model.enko.intgemm.alphas.bin",
        size: 43849787,
        sha256:
          "ffe5ef2ce3f2e944055e35310bab186f6a70d533a0ee4394adf716a0e383afbb",
      },
      srcvocab: {
        name: "srcvocab.enko.spm",
        size: 791280,
        sha256:
          "8d4e3141868efd410eb86c2b60d41aa6bc6b46e4c4b2c0b85e3792493c69d802",
      },
      trgvocab: {
        name: "trgvocab.enko.spm",
        size: 815353,
        sha256:
          "2ece21b28dd7022d36127d17423a74dabf544787dfc1cf614f7b565f93a4a1d3",
      },
    },
  },
  {
    from: "de",
    to: "en",
    architecture: "base-memory",
    dir: "models/de-en/retrain_hr2_WZOW24i4QJmIib61LeHfwg/exported",
    files: {
      lex: {
        name: "lex.50.50.deen.s2t.bin",
        size: 4945796,
        sha256:
          "113b98460468360cca68c042e1cddf49c4e1931cbb975ed04349c9a3bd607010",
      },
      model: {
        name: "model.deen.intgemm.alphas.bin",
        size: 31561787,
        sha256:
          "3e6f7c2c2425d10824797270b382bee718ff34af2cab9308841c82ca46dc6f20",
      },
      vocab: {
        name: "vocab.deen.spm",
        size: 810073,
        sha256:
          "69f730becafa48e3bb2c244eab66456877c08959a02f2bd5519b5a3088b62f9c",
      },
    },
  },
  {
    from: "es",
    to: "en",
    architecture: "base-memory",
    dir: "models/es-en/retrain_hr_HbNjJ60BTwmVTbhfFxuduA/exported",
    files: {
      lex: {
        name: "lex.50.50.esen.s2t.bin",
        size: 4636248,
        sha256:
          "e2610211d3b9577d012638fe7e7e74ed7b4b708ce96b9e792e67c282a6492daa",
      },
      model: {
        name: "model.esen.intgemm.alphas.bin",
        size: 31561787,
        sha256:
          "4aed7734152ae0045d1a69ae49c86cfda18f53c61f90e95e1d1de1c7c7c3b033",
      },
      vocab: {
        name: "vocab.esen.spm",
        size: 816054,
        sha256:
          "5ae254fa9b15aa182e70fd2a6186b1333c63a29a48043a9224c6aa4fcac058ad",
      },
    },
  },
  {
    from: "fr",
    to: "en",
    architecture: "base-memory",
    dir: "models/fr-en/retrain_hr_EFgIftH_RrCyzl5gjemVNg/exported",
    files: {
      lex: {
        name: "lex.50.50.fren.s2t.bin",
        size: 4824120,
        sha256:
          "87c6752ea908f5f0347c10ac0cf7d80d9c2f4f20c81c90168f3e8230b56d4440",
      },
      model: {
        name: "model.fren.intgemm.alphas.bin",
        size: 31561787,
        sha256:
          "15f997bc0d13808b0b0fbd0786e684a3c8a52adcd8071844b76123fdacbf2b90",
      },
      vocab: {
        name: "vocab.fren.spm",
        size: 814404,
        sha256:
          "783abf3abe075afdf8d85d233994bef2c3a064e935ab1bed946820aff6ac002a",
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
