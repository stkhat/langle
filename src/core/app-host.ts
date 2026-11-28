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
   * it; resolves once the sheet is done: true when the file went to a target (an app,
   * Save to Files / Save to device), false when the sheet closed without one. Pages in
   * the app have no downloads.
   */
  shareFile(file: SharedFile): Promise<boolean>;
  /**
   * Gives the shells the strings they draw themselves (their bars, ⋮, toasts and
   * labels) in the interface language; they keep the last ones for a cold start.
   * Sent by the background (`followNativeStrings`); missing where the shells have none.
   */
  nativeStrings?(set: NativeStringSet): Promise<void>;
  /**
   * How tall the page's content is (CSS px): the sheet frame an app page shows in (the
   * Langle sheet) takes that height, at most up to the status bar (mock
   * `MobileLangleSheet`). Other frames ignore it. Missing where the shells have none.
   */
  contentHeight?(height: number): Promise<void>;
  /**
   * Langle's own sheet over a web page opened (true) or closed (false): the title bar
   * slides away while it shows (mock `MobileArticle`, `MobileYouTube`). Missing where
   * the shells have none.
   */
  pageSheet?(open: boolean): Promise<void>;
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
  /**
   * Google sign-in through the phone (mobile-app.md "M7"): the auth half of Google
   * Drive's sync in the app. Missing where the shell cannot sign in (no Google Play
   * services).
   */
  googleAuth?: AppGoogleAuth;
  /**
   * The app went to the background (`app.hidden`): the shell keeps it running until
   * every listener's promise settles (or its own time limit). Returns an unsubscribe.
   */
  onHidden(listener: () => Promise<void>): () => void;
  /** The app came back to the foreground (`app.visible`). Returns an unsubscribe. */
  onVisible(listener: () => void): () => void;
}

/** `appHost.googleAuth`, the shells' sign-in (iOS: the system sheet; Android: Play services). */
export interface AppGoogleAuth {
  /**
   * An access token for `drive.appdata`. `interactive` shows Google's account chooser;
   * without it the shell renews silently or answers `unauthorized`. `refused`: a token
   * Drive just refused (401), dropped before a new one is had.
   */
  token(request: {
    interactive: boolean;
    refused?: string;
  }): Promise<AppGoogleToken>;
  /** Forgets this device's tokens; revokes nothing at Google. */
  forget(): Promise<void>;
}

/**
 * `appHost.googleAuth.token`'s answer: a token and when it ends (ms since the epoch), or
 * why there is none: `cancelled` (the user closed or declined the sheet),
 * `unauthorized` (no token without the sheet: Reconnect needed), `retry` (the renewal
 * could not reach Google: try again later).
 */
export type AppGoogleToken =
  { token: string; expiresAt: number } | { error: AppGoogleAuthError };

export type AppGoogleAuthError = "cancelled" | "unauthorized" | "retry";

export const APP_GOOGLE_AUTH_ERRORS: readonly AppGoogleAuthError[] = [
  "cancelled",
  "unauthorized",
  "retry",
];

/** A text file to share: `name` is a plain file name (no folders), `mime` its media type. */
export interface SharedFile {
  name: string;
  mime: string;
  text: string;
}

/**
 * `appHost.nativeStrings`: every `app.` key of en.json in `locale` (English where the
 * locale lacks one), with the direction the shells lay their bars out in.
 */
export interface NativeStringSet {
  locale: string;
  dir: "ltr" | "rtl";
  strings: Record<string, string>;
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
