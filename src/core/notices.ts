/**
 * The data sources and licenses page (`entrypoints/notices`), made at build time from
 * `scripts/data/formats.ts` and the full notices in `scripts/data/licenses/`
 * (`scripts/notices-data.ts`, served as `virtual:langle-notices` by `scripts/notices.ts`).
 */

/**
 * The file at the extension's root with the licenses of the packages whose code or
 * fonts the build ships (written by `scripts/licenses.ts`); the page links to it.
 */
export const LICENSES_FILE = "THIRD_PARTY_LICENSES.txt";

export interface NoticesData {
  /** Every language pack, as its npm package carries its notices. */
  packs: NoticePack[];
  /**
   * The phone app's ad blocking: the filter lists it downloads and the engine it
   * blocks with. Missing in the extension.
   */
  adBlocking?: { lists: NoticeSource[]; engine: NoticeSource };
  /** The full notices a license asks every copy to carry (WordNet-style). */
  notices: { title: string; text: string }[];
}

interface NoticeLicense {
  name: string;
  url?: string;
}

export interface NoticePack {
  /** The npm package (`@langle/en-ja`). */
  package: string;
  title: string;
  /** The pack's license as a whole. */
  license: NoticeLicense;
  /** How the files differ from the sources. */
  changes: string;
  sources: NoticeSource[];
}

export interface NoticeSource {
  title: string;
  url: string;
  /** How the data was taken from the source, if not directly. */
  via?: string;
  by: string;
  license: NoticeLicense;
  /** What the pack takes from the source. */
  used: string;
}
