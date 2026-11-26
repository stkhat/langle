import { adblockVersion } from "../licenses.ts";
import { LICENSES } from "./formats.ts";

/**
 * What the phone app's data sources and licenses page credits for ad blocking
 * (docs/specs/mobile-app.md "M6: ad blocking"): the filter lists the shells download,
 * unchanged, from their own homes (`mobile/protocol/filter-lists.json`, by `ids`), and
 * the engine they block with. Each list's licence is the one its own header links to.
 */
export const AD_BLOCKING_NOTICES = {
  lists: [
    {
      ids: ["easylist"],
      title: "EasyList",
      url: "https://easylist.to/",
      by: "The EasyList authors",
      license: {
        name: "GPL 3.0 or later, or CC BY-SA 3.0 or later",
        url: "https://easylist.to/pages/licence.html",
      },
      used: "rules that block ads and hide the space they leave",
    },
    {
      ids: ["easyprivacy"],
      title: "EasyPrivacy",
      url: "https://easylist.to/",
      by: "The EasyList authors",
      license: {
        name: "GPL 3.0 or later, or CC BY-SA 3.0 or later",
        url: "https://easylist.to/pages/licence.html",
      },
      used: "rules that block trackers",
    },
    {
      ids: ["ublock-filters", "ublock-quick-fixes", "ublock-unbreak"],
      title: "uBlock filters",
      url: "https://github.com/uBlockOrigin/uAssets",
      by: "The uBlock Origin contributors",
      license: {
        name: "GPL 3.0",
        url: "https://github.com/uBlockOrigin/uAssets/blob/master/LICENSE",
      },
      used: "uBlock filters, Quick fixes and Unbreak: rules that block ads (YouTube's among them) and name the scriptlets that run on a site, and fixes for sites other rules break",
    },
  ],
  engine: {
    version: adblockVersion(),
    title: "adblock-rust",
    url: "https://github.com/brave/adblock-rust",
    by: "Brave Software",
    license: LICENSES.mpl2,
    used: "the engine that reads the filter lists, blocks requests and hides elements",
  },
} as const;
