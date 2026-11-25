/**
 * What the phone app gives Langle's contexts beside `browser` (mobile-app.md "Shim
 * surface"): the shim sets it as `globalThis.appHost` in every context of the app, and
 * it is missing everywhere else. Code that differs in the app checks that it exists,
 * never the build target.
 */
export interface AppHost {
  /** Opens a web page over Home (the shells answer it, mobile-app.md "The shells"). */
  openPage(url: string): Promise<void>;
}

/** The app's `appHost`, or undefined outside the app. */
export function appHostOf(g: object = globalThis): AppHost | undefined {
  return (g as { appHost?: AppHost }).appHost;
}
