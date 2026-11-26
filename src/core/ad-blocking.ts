/**
 * The phone app's ad-blocking switches and its filter lists' date, in the app's
 * `storage.local` (docs/specs/mobile-app.md "M6: ad blocking", "The switches"). The
 * shells read both keys from their key-value store; the desktop extension has neither.
 */

/** `{ on, offSites }`: the switches. Written by Settings › Ad blocking and ⋮. */
export const AD_BLOCKING_KEY = "adBlocking";

/** `{ updatedAt }`: when the filter lists were last updated. Written by the list store. */
export const AD_BLOCKING_LISTS_KEY = "adBlockingLists";

export interface AdBlocking {
  /** "Block ads": false blocks nothing anywhere. */
  on: boolean;
  /** The sites (registrable domains, "youtube.com") where it is off. */
  offSites: string[];
}

/** Blocking is on by default, on every site. */
export const DEFAULT_AD_BLOCKING: AdBlocking = { on: true, offSites: [] };

/** The stored switches; anything missing or of the wrong kind reads as the default. */
export function adBlockingOf(value: unknown): AdBlocking {
  if (typeof value !== "object" || value === null) return DEFAULT_AD_BLOCKING;
  const { on, offSites } = value as Partial<Record<keyof AdBlocking, unknown>>;
  return {
    on: typeof on === "boolean" ? on : DEFAULT_AD_BLOCKING.on,
    offSites: Array.isArray(offSites)
      ? [
          ...new Set(
            offSites.filter((s): s is string => typeof s === "string" && !!s),
          ),
        ]
      : [],
  };
}

/**
 * When the lists were last updated, in ms since the epoch; undefined while no list has
 * been fetched (nothing is blocked until one is). A failed fetch keeps the date.
 */
export function listsUpdatedAt(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { updatedAt } = value as { updatedAt?: unknown };
  return typeof updatedAt === "number" &&
    Number.isFinite(updatedAt) &&
    updatedAt > 0
    ? updatedAt
    : undefined;
}

/** What Settings › Ad blocking shows. */
export interface AdBlockingView extends AdBlocking {
  listsUpdatedAt?: number;
}
