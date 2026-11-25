import { appHostOf } from "../../core/app-host";
import { bridgeBackend } from "./bridge-backend";
import {
  builtInTranslatorAvailable,
  createBuiltInTranslator,
  downloadModelsOnFirstActivation,
  downloadTranslationModels,
  startTranslationModels,
  type TranslationProvider,
  type TranslatorGlobal,
} from "./translator";

/**
 * Where this platform's translations come from (mobile-translation.md: "Parts"): the
 * browser's built-in translator in the extension; the app's translation host in the
 * phone app (`bridge-backend.ts`), chosen by whether `appHost` exists.
 */
export interface TranslatorBackend {
  /** The translator for `from` → `to`; nothing is loaded until it is used. */
  create(from: string, to: string): TranslationProvider;
  /** Whether `from` → `to` can be translated here, now or after a download. */
  available(from: string, to: string): Promise<boolean>;
  /** Starts the downloads Langle translates `learning` → `native` with. */
  downloadModels(learning: string, native: string): Promise<void>;
  /**
   * Whether a model Langle translates `learning` → `native` with waits for the user
   * to agree to its download (iOS: Apple's sheet was declined); `downloadModels`
   * asks again. The browser's models never wait for that.
   */
  waitsForConsent(learning: string, native: string): Promise<boolean>;
  /**
   * `downloadModels` for a page that closes after the click (the setup): resolves once
   * every download is asked for, `downloaded` once they ended.
   */
  startModels(
    learning: string,
    native: string,
  ): Promise<{ downloaded: Promise<unknown> }>;
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
    waitsForConsent: async () => false,
    startModels: (learning, native) =>
      startTranslationModels(learning, native, g),
    downloadOnFirstActivation: (target, languages, options) =>
      downloadModelsOnFirstActivation(target, languages, options, g),
  };
}

/** This platform's translator part: the app's where `appHost` exists, else the browser's. */
export function translatorBackend(): TranslatorBackend {
  const app = appHostOf();
  return app ? bridgeBackend(app) : builtInBackend();
}
