/** Where Home's search goes with text that is not an address. */
const SEARCH = "https://m.youtube.com/results?search_query=";

/**
 * The page Home's search field opens for `text` (docs/specs/mobile-app.md "Home"): an
 * http(s) address as typed; text with a dot and no space as an address (`https://`
 * added); anything else a YouTube search. Undefined for blank text.
 */
export function pageForSearch(text: string): string | undefined {
  const typed = text.trim();
  if (!typed) return undefined;
  if (/^https?:\/\//i.test(typed)) return parsed(typed) ?? search(typed);
  if (typed.includes(".") && !/\s/.test(typed))
    return parsed(`https://${typed}`) ?? search(typed);
  return search(typed);
}

const search = (text: string) => SEARCH + encodeURIComponent(text);

/** The address as the browser reads it, if it reads it and it has a host. */
function parsed(text: string): string | undefined {
  try {
    const url = new URL(text);
    return url.hostname ? url.href : undefined;
  } catch {
    return undefined;
  }
}
