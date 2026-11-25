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
}

/** A text file to share: `name` is a plain file name (no folders), `mime` its media type. */
export interface SharedFile {
  name: string;
  mime: string;
  text: string;
}

/** The app's `appHost`, or undefined outside the app. */
export function appHostOf(g: object = globalThis): AppHost | undefined {
  return (g as { appHost?: AppHost }).appHost;
}
