/**
 * The first run on this device (ui.md "First-run consent"): the user agrees to how
 * Langle handles data, then chooses the languages. Until both are done Langle handles
 * no page data, downloads nothing and does not sync.
 */

/**
 * The `storage.local` key that holds this device's setup. Never in `storage.sync`: what
 * another device agreed to is no consent here.
 */
export const SETUP_KEY = "setup";

/**
 * The disclosure's version. Raise it when what the consent screen says about the
 * handling of data changes: every device is asked again.
 */
export const CONSENT_VERSION = 1;

export interface Setup {
  /** The version of the disclosure agreed to. */
  consent?: number;
  /** The languages screen was finished: a device asked again skips it. */
  languages?: true;
}

/** Where a device stands: what it still has to do, or `ready`. */
export type SetupStage = "consent" | "languages" | "ready";

function setupOf(raw: unknown): Setup {
  if (typeof raw !== "object" || raw === null) return {};
  const { consent, languages } = raw as {
    consent?: unknown;
    languages?: unknown;
  };
  return {
    ...(typeof consent === "number" && { consent }),
    ...(languages === true && { languages }),
  };
}

export function setupStage(raw: unknown): SetupStage {
  const { consent, languages } = setupOf(raw);
  if (consent !== CONSENT_VERSION) return "consent";
  return languages ? "ready" : "languages";
}

/** The setup after "Agree and continue". */
export const agreed = (raw: unknown): Setup => ({
  ...setupOf(raw),
  consent: CONSENT_VERSION,
});

/** The setup after "Start". */
export const chosen = (raw: unknown): Setup => ({
  ...setupOf(raw),
  languages: true,
});
