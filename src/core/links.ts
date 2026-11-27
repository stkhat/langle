/**
 * Where "Support Langle" leads (ui.md: Toolbar popup, Settings page, Word list page,
 * Video UI). Each stays empty until its page exists (docs/status.md "Before
 * publishing"), and a link whose URL is empty is not shown.
 */

/** "Buy me a coffee": the Ko-fi page. */
const KOFI_URL = "https://ko-fi.com/supportlangle";
/** "Send feedback": a short Google Form. */
export const FEEDBACK_URL = "";
/** The consent screen's "Privacy policy": the public policy, hidden while empty. */
/** Its source is `site/langle/privacy/` (docs/specs/ui.md "Website"). */
export const PRIVACY_POLICY_URL = "https://kskt-dev.github.io/langle/privacy/";
/** "Become a sponsor" / "Sponsor this spot": the page for would-be sponsors. */
export const SPONSOR_PAGE_URL = "";

/** The store listings' review pages (`BrowserEnv.reviewUrl`); Chrome's works once the item is public. */
export const REVIEW_URLS = {
  /** `https://chromewebstore.google.com/detail/<id>/reviews` */
  chromeWebStore:
    "https://chromewebstore.google.com/detail/dldcjcapnikfmodbgnnlbkilbcepnbnf/reviews",
  /** `https://addons.mozilla.org/firefox/addon/<slug>/reviews/` */
  firefoxAddOns: "",
} as const;

export interface SupportLinks {
  coffee: string;
  feedback: string;
  sponsor: string;
  /** This browser's store review page ("Rate"). */
  review: string;
}

/** The links for this build; `reviewUrl` comes from `BrowserEnv`. */
export function supportLinks(reviewUrl: string): SupportLinks {
  return {
    coffee: KOFI_URL,
    feedback: FEEDBACK_URL,
    sponsor: SPONSOR_PAGE_URL,
    review: reviewUrl,
  };
}
