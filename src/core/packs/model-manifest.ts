// A model pack (`@langle/mt-<from>-<to>`, `kind: "model"` in the lock) holds one of
// Mozilla's translation models for Bergamot, its files split into parts below the
// CDNs' per-file limit (scripts/data/mt-models.ts writes them). The phone app's
// translation host reads `manifest.json` from the pack's files to know which files make
// the model, their parts in order, and how Bergamot is to be configured
// (docs/specs/architecture.md "Model packs").

/** The pack format of a model pack, its lock entry's `format`; `manifest.json`'s `v`. */
export const MODEL_FORMAT = 1;

/** The file in a model pack that describes it. */
export const MODEL_MANIFEST = "manifest.json";

/** One part of a model file, in a model pack (and in its npm package). */
export interface ModelFilePart {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

/** A model file as Bergamot reads it: its parts joined in order make `size` bytes with `sha256`. */
export interface ModelFile {
  readonly size: number;
  readonly sha256: string;
  readonly parts: readonly ModelFilePart[];
}

/**
 * The files of a model, by Firefox's file types (its `MODEL_FILE_ALIGNMENTS`): the
 * model, the lexical shortlist, and one vocabulary shared by both languages or one per
 * language.
 */
export type ModelFiles = {
  readonly model: ModelFile;
  readonly lex: ModelFile;
} & (
  | { readonly vocab: ModelFile }
  | { readonly srcvocab: ModelFile; readonly trgvocab: ModelFile }
);

export interface ModelManifest {
  readonly v: typeof MODEL_FORMAT;
  /** The source language ("en"). */
  readonly from: string;
  /** The target language ("ja"). */
  readonly to: string;
  /**
   * Bergamot's `gemm-precision`, as Firefox chooses it from the model's file name:
   * `int8shiftAll` for an `intgemm8.bin` model, else `int8shiftAlphaAll`.
   */
  readonly gemmPrecision: "int8shiftAlphaAll" | "int8shiftAll";
  readonly files: ModelFiles;
}
