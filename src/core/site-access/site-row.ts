/**
 * What the toolbar popup's "On this site" row shows (ui.md "Articles site by site",
 * architecture.md "The popup on a tab"). Pure: the popup gathers the facts, this
 * decides.
 */

/** What the probe of the tab's `<html lang>` gave: its value, or a failure. */
export type LangProbe = { lang: string } | "failed";

export interface SiteFacts {
  /** The tab's hostname; none on a tab that is not a web page. */
  host: string | undefined;
  /** A Langle content script in the tab answered. */
  answered: boolean;
  /**
   * The row is today's off-list switch alone: the host is one of the manifest's own
   * content-script hosts (the video sites), or this browser has no per-site access
   * (the phone app).
   */
  listOnly: boolean;
  /** The host has a grant; undefined while asking. */
  granted: boolean | undefined;
  /** The synced per-site off list (`disabledSites`) covers the host. */
  offListed: boolean;
  /**
   * The host was among the seen hosts when the popup opened, or its switch was used
   * since; undefined while reading.
   */
  seenBefore: boolean | undefined;
  /** The probe's result; undefined while it runs or when it was not needed. */
  probe: LangProbe | undefined;
  learningLang: string;
}

/**
 * - `hidden`: no row (no web page, a failed probe, or still finding out)
 * - `ask`: the first opening on a page in the learning language: off, ringed, the bubble
 * - `first`: the first opening on another page: off, plain
 * - `later`: opened here before, no grant: off, plain
 * - `on` / `off`: the switch as it stands
 */
export type SiteRow = "hidden" | "ask" | "first" | "later" | "on" | "off";

/**
 * Whether a page's `lang` is the language, as the mark's `html[lang|="xx"]` reads it:
 * the same code, or the code followed by a hyphen, in any case.
 */
export function langIs(lang: string, code: string): boolean {
  const value = lang.trim().toLowerCase();
  const want = code.toLowerCase();
  return value === want || value.startsWith(`${want}-`);
}

export function siteRow(facts: SiteFacts): SiteRow {
  const { host, answered, probe } = facts;
  if (!host) return "hidden";
  const onOrOff = facts.offListed ? "off" : "on";
  if (facts.listOnly) return answered ? onOrOff : "hidden";
  // A script that answers runs under a grant, even before `granted` is known.
  if (facts.granted ?? answered) return onOrOff;
  if (facts.granted === undefined) return "hidden";
  if (!answered && (probe === undefined || probe === "failed")) return "hidden";
  if (facts.seenBefore === undefined) return "hidden";
  if (facts.seenBefore) return "later";
  return probe !== undefined &&
    probe !== "failed" &&
    langIs(probe.lang, facts.learningLang)
    ? "ask"
    : "first";
}
