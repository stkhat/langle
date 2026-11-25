// The Android app's on-device translator inside its Worker (docs/specs/mobile-translation.md
// "The Android host"): Bergamot's WebAssembly build with Mozilla's models, configured as
// Firefox 145 configures them (toolkit/components/translations, the engine worker), from
// the model packs' files the app serves (`/models/<pack>/…`, joined by native code).
import type { ModelManifest } from "../../core/packs/model-manifest";
import type { EngineAnswer, EngineRequest } from "./protocol";

interface Deletable {
  delete(): void;
}

interface AlignedMemory extends Deletable {
  getByteArrayView(): Uint8Array;
}

interface Vector<T> extends Deletable {
  push_back(item: T): void;
  size(): number;
  get(index: number): T;
}

interface TranslationResponse {
  getTranslatedText(): string;
}

type TranslationModel = Deletable;

interface BlockingService extends Deletable {
  translate(
    model: TranslationModel,
    messages: Vector<string>,
    options: Vector<ResponseOptions>,
  ): Vector<TranslationResponse>;
  translateViaPivoting(
    first: TranslationModel,
    second: TranslationModel,
    messages: Vector<string>,
    options: Vector<ResponseOptions>,
  ): Vector<TranslationResponse>;
}

interface ResponseOptions {
  qualityScores: boolean;
  alignment: boolean;
  html: boolean;
}

/** The parts of the Bergamot module (`loadBergamot`'s embind classes) the engine uses. */
export interface Bergamot {
  AlignedMemory: new (size: number, alignment: number) => AlignedMemory;
  AlignedMemoryList: new () => Vector<AlignedMemory>;
  TranslationModel: new (
    from: string,
    to: string,
    config: string,
    model: AlignedMemory,
    lex: AlignedMemory | null,
    vocabs: Vector<AlignedMemory>,
    qualityModel: null,
  ) => TranslationModel;
  BlockingService: new (options: { cacheSize: number }) => BlockingService;
  VectorString: new () => Vector<string>;
  VectorResponseOptions: new () => Vector<ResponseOptions>;
}

/** Each model file's alignment in Bergamot's memory, by its type (Firefox's). */
export const MODEL_FILE_ALIGNMENTS: Record<string, number> = {
  model: 256,
  lex: 64,
  vocab: 64,
  srcvocab: 64,
  trgvocab: 64,
};

/** Bergamot's text configuration for a model, as Firefox 145 writes it. */
export function configText(gemmPrecision: string): string {
  const options: Record<string, string> = {
    "beam-size": "1",
    normalize: "1.0",
    "word-penalty": "0",
    "max-length-break": "128",
    "mini-batch-words": "1024",
    workspace: "128",
    "max-length-factor": "2.0",
    "skip-cost": "true",
    "cpu-threads": "0",
    quiet: "true",
    "quiet-translation": "true",
    "gemm-precision": gemmPrecision,
    alignment: "soft",
  };
  const indent = "            ";
  return `\n${Object.entries(options)
    .map(([key, value]) => `${indent}${key}: ${value}\n`)
    .join("")}${indent}`;
}

export interface EngineDeps {
  /** The Bergamot module, its runtime initialized; asked for once. */
  bergamot: () => Promise<Bergamot>;
  /** A file the app serves on its origin (`/models/mt-en-ja/model`), or a rejection. */
  fetchBytes: (path: string) => Promise<ArrayBuffer>;
}

export interface Engine {
  /** Loads `packs` (one, or two through English) for `from` → `to`. */
  load(from: string, to: string, packs: readonly string[]): Promise<void>;
  /** `text` translated by a loaded pair. */
  translate(from: string, to: string, text: string): Promise<string>;
}

const pairKey = (from: string, to: string) => `${from}>${to}`;

export function createEngine({ bergamot, fetchBytes }: EngineDeps): Engine {
  let ready:
    Promise<{ module: Bergamot; service: BlockingService }> | undefined;
  const models = new Map<string, Promise<TranslationModel>>();
  const pairs = new Map<string, TranslationModel[]>();

  const start = () =>
    (ready ??= bergamot().then((module) => ({
      module,
      service: new module.BlockingService({ cacheSize: 0 }),
    })));

  async function loadModel(module: Bergamot, pack: string) {
    const base = `/models/${encodeURIComponent(pack)}/`;
    const manifest = JSON.parse(
      new TextDecoder().decode(await fetchBytes(`${base}manifest.json`)),
    ) as ModelManifest;
    const memory: Record<string, AlignedMemory> = {};
    for (const type of Object.keys(manifest.files)) {
      const alignment = MODEL_FILE_ALIGNMENTS[type];
      if (!alignment) throw new Error(`${pack}: unknown model file ${type}`);
      const bytes = new Uint8Array(await fetchBytes(`${base}${type}`));
      const aligned = new module.AlignedMemory(bytes.byteLength, alignment);
      aligned.getByteArrayView().set(bytes);
      memory[type] = aligned;
    }
    const vocabs = new module.AlignedMemoryList();
    if (memory.vocab) vocabs.push_back(memory.vocab);
    else if (memory.srcvocab && memory.trgvocab) {
      vocabs.push_back(memory.srcvocab);
      vocabs.push_back(memory.trgvocab);
    } else throw new Error(`${pack}: no vocabulary`);
    if (!memory.model) throw new Error(`${pack}: no model`);
    return new module.TranslationModel(
      manifest.from,
      manifest.to,
      configText(manifest.gemmPrecision),
      memory.model,
      memory.lex ?? null,
      vocabs,
      null,
    );
  }

  return {
    async load(from, to, packs) {
      if (packs.length < 1 || packs.length > 2)
        throw new Error(`${from} → ${to} needs one or two model packs`);
      const { module } = await start();
      const loaded = await Promise.all(
        packs.map((pack) => {
          let model = models.get(pack);
          if (!model) {
            model = loadModel(module, pack);
            models.set(pack, model);
            // A model that failed is loaded again next time.
            model.catch(() => models.delete(pack));
          }
          return model;
        }),
      );
      pairs.set(pairKey(from, to), loaded);
    },
    async translate(from, to, text) {
      const chain = pairs.get(pairKey(from, to));
      if (!chain) throw new Error(`${from} → ${to} is not loaded`);
      const { module, service } = await start();
      const messages = new module.VectorString();
      const options = new module.VectorResponseOptions();
      let responses: Vector<TranslationResponse> | undefined;
      try {
        messages.push_back(text);
        options.push_back({
          qualityScores: false,
          alignment: false,
          html: false,
        });
        responses =
          chain.length === 1
            ? service.translate(chain[0]!, messages, options)
            : service.translateViaPivoting(
                chain[0]!,
                chain[1]!,
                messages,
                options,
              );
        return responses.get(0).getTranslatedText();
      } finally {
        messages.delete();
        options.delete();
        responses?.delete();
      }
    },
  };
}

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** The engine's answer to one request from the page (the Worker's `message`). */
export async function answer(
  engine: Engine,
  request: EngineRequest,
): Promise<EngineAnswer> {
  if (request.kind === "load") {
    try {
      await engine.load(request.from, request.to, request.packs);
      return { kind: "loaded", id: request.id, ok: true };
    } catch (error) {
      return {
        kind: "loaded",
        id: request.id,
        ok: false,
        error: errorText(error),
      };
    }
  }
  try {
    const text = await engine.translate(request.from, request.to, request.text);
    return { kind: "translated", id: request.id, text };
  } catch (error) {
    return {
      kind: "translated",
      id: request.id,
      text: null,
      error: errorText(error),
    };
  }
}
