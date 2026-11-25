/**
 * What the phone app gives Langle's contexts beside `browser` (mobile-app.md "Shim
 * surface"): the shim sets it as `globalThis.appHost` in every context of the app, and
 * it is missing everywhere else. Code that differs in the app checks that it exists,
 * never the build target.
 */
export interface AppHost {
  /** Opens a web page over Home (the shells answer it, mobile-app.md "The shells"). */
  openPage(url: string): Promise<void>;
  /**
   * Hands a file to the phone's share sheet, where the user saves it to Files or sends
   * it; resolves once the sheet shows. Pages in the app have no downloads.
   */
  shareFile(file: SharedFile): Promise<void>;
  /**
   * How this app's translator gets its models (mobile-translation.md "The bridge"):
   * `packs`, Langle's model packs downloaded with the pair's packs (Android); `system`,
   * the phone's own (iOS). Missing while the app has no translation host.
   */
  translator?: AppTranslator;
  /**
   * `text` translated by the app's translation host, or null (no translation now, or
   * a page not on screen). `start` false (the lists): neither starts the engine nor
   * counts as a use for its release.
   */
  translate(request: TranslateRequest): Promise<string | null>;
  /** Whether `from` → `to` can be translated here: now, after a download, or not. */
  translatorStatus(pair: PairCodes): Promise<TranslatorStatus>;
  /**
   * iOS: shows Apple's consent sheet to download the pair's models; resolves with the
   * status once it closes.
   */
  prepareTranslator(pair: PairCodes): Promise<TranslatorStatus>;
  /** The model packs' files, which native code downloads and keeps (Android). */
  models: AppModels;
}

/** A text file to share: `name` is a plain file name (no folders), `mime` its media type. */
export interface SharedFile {
  name: string;
  mime: string;
  text: string;
}

/** `appHost.translator`. */
export interface AppTranslator {
  models: "packs" | "system";
}

/** A translation direction, by language code ("en" → "ja"). */
export interface PairCodes {
  from: string;
  to: string;
}

export interface TranslateRequest extends PairCodes {
  text: string;
  start: boolean;
}

/**
 * `ready`: can translate now. `download` (iOS): Apple's models are to be downloaded,
 * which needs the consent sheet (`prepareTranslator`). `packs` (Android): the model
 * packs are not on the phone yet. `unavailable`: never here.
 */
export type TranslatorStatus = "ready" | "download" | "packs" | "unavailable";

export const TRANSLATOR_STATUSES: readonly TranslatorStatus[] = [
  "ready",
  "download",
  "packs",
  "unavailable",
];

/** A model pack's version for native code to bring to the phone (`appHost.models.ensure`). */
export interface ModelPackRequest {
  pack: string;
  version: string;
  files: { path: string; sha256: string; size: number }[];
  /** URL templates with `{file}` (the file's path), tried in order. */
  mirrors: string[];
}

/** `appHost.models.onProgress`: bytes of a pack's files on the phone or received so far. */
export interface ModelProgress {
  pack: string;
  received: number;
  total: number;
}

export interface AppModels {
  /**
   * Brings the pack's files to the phone, each from the mirrors in order and checked by
   * its SHA-256: resolves once all are there (at once when they already were), rejects
   * with why one could not be. Progress comes as `onProgress` events meanwhile.
   */
  ensure(request: ModelPackRequest): Promise<void>;
  /** Deletes the pack's files. */
  remove(pack: string): Promise<void>;
  /** Hears the downloads' progress; returns an unsubscribe. */
  onProgress(listener: (progress: ModelProgress) => void): () => void;
}

/** The app's `appHost`, or undefined outside the app. */
export function appHostOf(g: object = globalThis): AppHost | undefined {
  return (g as { appHost?: AppHost }).appHost;
}
