import {
  builtInTranslatorAvailable,
  createBuiltInTranslator,
  downloadModelsOnFirstActivation,
  downloadTranslationModels,
  type TranslationProvider,
  type TranslatorGlobal,
} from "./translator";

/**
 * Where this platform's translations come from (mobile-translation.md: "Parts"): the
 * browser's built-in translator in the extension; the app's translation host in the
 * phone app, chosen by whether the app's bridge exists (not built yet).
 */
export interface TranslatorBackend {
  /** The translator for `from` → `to`; nothing is loaded until it is used. */
  create(from: string, to: string): TranslationProvider;
  /** Whether `from` → `to` can be translated here, now or after a download. */
  available(from: string, to: string): Promise<boolean>;
  /** Starts the downloads Langle translates `learning` → `native` with. */
  downloadModels(learning: string, native: string): Promise<void>;
  /** Starts them at the first user activation on `target`; returns the disarm. */
  downloadOnFirstActivation(
    target: EventTarget,
    languages: () => { learning: string; native: string },
    options?: { now?: boolean },
  ): () => void;
}

/** The browser's built-in translator (Translator API), over `translator.ts`. */
export function builtInBackend(
  g: TranslatorGlobal = globalThis as TranslatorGlobal,
): TranslatorBackend {
  return {
    create: (from, to) => createBuiltInTranslator(from, to, g),
    available: (from, to) => builtInTranslatorAvailable(from, to, g),
    downloadModels: (learning, native) =>
      downloadTranslationModels(learning, native, g),
    downloadOnFirstActivation: (target, languages, options) =>
      downloadModelsOnFirstActivation(target, languages, options, g),
  };
}

/** This platform's translator part. */
export const translatorBackend = (): TranslatorBackend => builtInBackend();
