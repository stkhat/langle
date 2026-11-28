/**
 * Host access as Chrome keeps it (architecture.md "Site access"): origin match patterns
 * such as `*://example.com/*` from `permissions.getAll()`. Pure, so the background and
 * the content script read them the same way.
 */

/** Every web page: Chrome's "On all sites", and what the registered script then matches. */
const ALL_WEB = "*://*/*";

/** The pattern a host is turned on with: any scheme, any port, any path. */
export const hostOrigin = (host: string) => `*://${host}/*`;

const PATTERN = /^(\*|https?|file|ftp|[a-z][a-z0-9+.-]*):\/\/([^/]*)(\/.*)$/;

/**
 * Whether a match pattern covers a page. Only the scheme and the host count: Chrome's
 * host grants always end in `/*`, and match patterns carry no port.
 */
export function patternCovers(pattern: string, url: URL): boolean {
  const web = url.protocol === "http:" || url.protocol === "https:";
  if (pattern === "<all_urls>") return true;
  const match = PATTERN.exec(pattern);
  if (!match) return false;
  const [, scheme = "", host = ""] = match;
  if (scheme === "*" ? !web : `${scheme}:` !== url.protocol) return false;
  if (host === "*") return true;
  if (host.startsWith("*.")) {
    const domain = host.slice(2);
    return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
  }
  return url.hostname === host;
}

/** Whether any of the patterns covers the host's web pages. */
export const patternsCoverHost = (patterns: readonly string[], host: string) =>
  patterns.some((pattern) =>
    patternCovers(pattern, new URL(`https://${host}/`)),
  );

const coversEveryHost = (pattern: string) =>
  pattern === "<all_urls>" || pattern === ALL_WEB;

const isWebPattern = (pattern: string) =>
  /^(\*|https?):\/\/[^/]+\/.*$/.test(pattern);

/**
 * What the registered article script matches: the granted origins less the manifest's
 * own content-script matches (the video sites, whose scripts are static), web pages
 * only, sorted and once each. When every host is granted (`ALL_WEB` or
 * `<all_urls>`), it is `ALL_WEB` alone.
 */
export function articleMatches(
  granted: readonly string[],
  staticMatches: readonly string[],
): string[] {
  const own = new Set(staticMatches);
  const patterns = granted.filter((pattern) => !own.has(pattern));
  if (patterns.some(coversEveryHost)) return [ALL_WEB];
  return [...new Set(patterns.filter(isWebPattern))].sort();
}
