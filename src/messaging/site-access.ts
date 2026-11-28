/**
 * Turning a site's access on and off (architecture.md "Site access"): what the popup
 * tells the background, and what the background tells the tabs.
 */

/**
 * The tab the popup is turning a host on in, sent (`siteAccessPending`) right before
 * `permissions.request`. Chrome's prompt closes the popup, so the background injects
 * the article script into this tab once a grant covers the host.
 */
export interface PendingTab {
  tabId: number;
  /** The tab's hostname, as `hostOrigin` turns it into the requested origin. */
  host: string;
}

export function isPendingTab(value: unknown): value is PendingTab {
  if (typeof value !== "object" || value === null) return false;
  const { tabId, host } = value as Partial<Record<keyof PendingTab, unknown>>;
  return (
    Number.isInteger(tabId) &&
    (tabId as number) >= 0 &&
    typeof host === "string" &&
    host.length > 0
  );
}

/**
 * Sent to every tab's top frame (`tabs.sendMessage`, which needs no host access) when
 * grants were removed: an article script on a page that `removed` covers and `granted`
 * (the article origins still granted) does not leaves the page, as when the site is
 * switched off.
 */
export interface SiteAccessRemoved {
  type: "siteAccessRemoved";
  removed: string[];
  granted: string[];
}

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export function isSiteAccessRemoved(
  message: unknown,
): message is SiteAccessRemoved {
  if (typeof message !== "object" || message === null) return false;
  const { type, removed, granted } = message as Record<string, unknown>;
  return (
    type === "siteAccessRemoved" && isStrings(removed) && isStrings(granted)
  );
}
