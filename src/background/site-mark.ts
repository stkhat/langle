import type { Settings } from "../core/settings";
import type { SetupStage } from "../core/setup";
import { coversEveryHost, patternHost } from "../core/site-access/origins";
import {
  undecidedUrlRegexes,
  type DecidedHosts,
} from "../core/site-access/undecided-url";
import { serial } from "../core/util";
import { reportError } from "./report";

/** The marked toolbar icon (`scripts/make-icons.ts`), at the sizes the toolbar draws. */
export const MARK_ICON_PATHS = {
  16: "/icon-new/16.png",
  32: "/icon-new/32.png",
} as const;

/** The mark's one rule. */
export const MARK_RULE_ID = "mark";

/**
 * The mark's rule as plain data: pages in the learning language on a host the user has
 * not decided on (architecture.md "Site access": the mark). Each condition is one piece
 * of the undecided-host regex; any of them shows the icon. `tag` names what it was
 * built from, so a worker start that finds the same rule leaves it.
 */
export interface MarkRule {
  conditions: { urlMatches: string; css: string[] }[];
  tag: string;
}

/** What the rule is built from. */
export interface MarkInputs {
  stage: SetupStage;
  /** Read only once Langle is set up. */
  settings: Settings | undefined;
  /** `permissions.getAll().origins`. */
  granted: readonly string[];
  /** The seen hosts (`siteSeen`). */
  seen: readonly string[];
  /** The manifest's own content-script matches (the video sites). */
  staticMatches: readonly string[];
}

/** A language tag as `<html lang>` and a CSS string can both carry it. */
const LANG_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i;

/** The hosts a list of match patterns names, with their subdomains where it says so. */
function patternHosts(patterns: readonly string[]): DecidedHosts {
  const hosts = patterns.flatMap((pattern) => patternHost(pattern) ?? []);
  return {
    exact: hosts.filter((h) => !h.subdomains).map((h) => h.host),
    withSubdomains: hosts.filter((h) => h.subdomains).map((h) => h.host),
  };
}

/** 32-bit FNV-1a, in base 36: enough to tell two builds apart. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(36)}-${text.length.toString(36)}`;
}

/**
 * The mark's rule, or undefined for none: none while Langle is not set up or is
 * switched off, while articles are off, or while every host is granted (each one is on
 * then). The decided hosts are the granted ones, the seen ones, Never run on and the
 * popup's off list (each with its subdomains, as `hostBlocked` reads them) and the video
 * sites.
 */
export function markRule(inputs: MarkInputs): MarkRule | undefined {
  const { settings } = inputs;
  if (inputs.stage !== "ready" || !settings) return undefined;
  if (!settings.enabled || !settings.sites.articles) return undefined;
  if (!LANG_TAG.test(settings.learningLang)) return undefined;
  if (inputs.granted.some(coversEveryHost)) return undefined;
  const patterns = patternHosts([...inputs.granted, ...inputs.staticMatches]);
  const regexes = undecidedUrlRegexes({
    exact: [...patterns.exact, ...inputs.seen],
    withSubdomains: [
      ...patterns.withSubdomains,
      ...settings.neverRunOn,
      ...settings.disabledSites,
    ],
  });
  const css = [`html[lang|="${settings.learningLang}"]`];
  return {
    conditions: regexes.map((urlMatches) => ({ urlMatches, css })),
    tag: fingerprint(JSON.stringify([css, regexes])),
  };
}

/** The settings the rule reads; a change to any other leaves it. */
const ruleSettings = (settings: Settings) =>
  JSON.stringify([
    settings.enabled,
    settings.learningLang,
    settings.sites.articles,
    settings.neverRunOn,
    settings.disabledSites,
  ]);

interface Listenable<A extends unknown[]> {
  addListener(listener: (...args: A) => void): void;
}

/** The installed rules, as `declarativeMarkRules` gives them from the browser's. */
export interface MarkRules {
  /** The installed mark rule's tag, or undefined for none. */
  installedTag(): Promise<string | undefined>;
  /** Removes every rule, then adds `rule` if there is one. */
  replace(rule: MarkRule | undefined): Promise<void>;
}

/** What following the inputs needs; the background passes the browser's. */
export interface SiteMarkDeps {
  staticMatches: readonly string[];
  rules: MarkRules;
  getSettings(): Promise<Settings>;
  watchSettings(
    listener: (settings: Settings, previous: Settings) => void,
  ): () => void;
  getSetupStage(): Promise<SetupStage>;
  watchSetupStage(listener: (stage: SetupStage) => void): () => void;
  getSiteSeen(): Promise<string[]>;
  watchSiteSeen(listener: (hosts: string[]) => void): () => void;
  permissions: {
    getAll(): Promise<{ origins?: string[] }>;
    onAdded: Listenable<[unknown]>;
    onRemoved: Listenable<[unknown]>;
  };
  /** `runtime.onInstalled` and `onStartup`: the rules are made again, never trusted. */
  onInstalled: Listenable<[]>;
  onStartup: Listenable<[]>;
}

/**
 * Keeps the mark's rule built from what it reads (`markRule`): at every worker start
 * (left as it is when the installed rule's tag matches), and made again at install,
 * update and browser start (S0: rules do not always survive those) and on every change
 * to the setup, the settings it reads, the grants and the seen hosts. Builds run one at
 * a time, and changes during one make a single next build, which reads them all.
 * Registers its listeners synchronously, so an event that wakes the worker is heard.
 * Returns the work's idle promise (tests).
 */
export function followSiteMark(deps: SiteMarkDeps): {
  readonly idle: Promise<unknown>;
} {
  const work = serial(reportError);
  let queued = false;
  let forced = false;

  async function build(force: boolean) {
    const stage = await deps.getSetupStage();
    const settings = stage === "ready" ? await deps.getSettings() : undefined;
    const rule = markRule({
      stage,
      settings,
      granted: settings
        ? ((await deps.permissions.getAll()).origins ?? [])
        : [],
      seen: settings ? await deps.getSiteSeen() : [],
      staticMatches: deps.staticMatches,
    });
    if (!force && (await deps.rules.installedTag()) === rule?.tag) return;
    await deps.rules.replace(rule);
  }

  const schedule = (force = false) => {
    forced ||= force;
    if (queued) return;
    queued = true;
    void work.run(() => {
      queued = false;
      const force = forced;
      forced = false;
      return build(force);
    });
  };

  deps.onInstalled.addListener(() => schedule(true));
  deps.onStartup.addListener(() => schedule(true));
  deps.permissions.onAdded.addListener(() => schedule());
  deps.permissions.onRemoved.addListener(() => schedule());
  deps.watchSetupStage(() => schedule());
  deps.watchSettings((settings, previous) => {
    if (ruleSettings(settings) !== ruleSettings(previous)) schedule();
  });
  deps.watchSiteSeen(() => schedule());
  schedule();

  return {
    get idle() {
      return work.idle;
    },
  };
}

/** `chrome.declarativeContent`, as far as it is used here. */
export interface DeclarativeContent {
  PageStateMatcher: new (options: {
    pageUrl?: { urlMatches?: string };
    css?: string[];
  }) => object;
  SetIcon: new (options: { imageData: Record<number, ImageData> }) => object;
  onPageChanged: {
    getRules(
      callback: (rules: { id?: string; tags?: string[] }[]) => void,
    ): void;
    removeRules(ruleIds: string[] | undefined, callback: () => void): void;
    addRules(
      rules: {
        id: string;
        tags: string[];
        conditions: object[];
        actions: object[];
      }[],
      callback: () => void,
    ): void;
  };
}

/**
 * The browser's rules for `followSiteMark`: the mark's conditions as `PageStateMatcher`s
 * and its action a `SetIcon` with the marked icon (`icon`, decoded once per worker).
 * The callback forms, whose errors come through `lastError` (S0).
 */
export function declarativeMarkRules(
  api: DeclarativeContent,
  icon: () => Promise<Record<number, ImageData>>,
  lastError: () => { message?: string } | undefined,
): MarkRules {
  const call = <T>(start: (done: (value: T) => void) => void) =>
    new Promise<T>((resolve, reject) => {
      start((value) => {
        const error = lastError();
        if (error) reject(new Error(error.message ?? "declarativeContent"));
        else resolve(value);
      });
    });
  let images: Promise<Record<number, ImageData>> | undefined;
  return {
    async installedTag() {
      const rules = await call<{ id?: string; tags?: string[] }[]>((done) =>
        api.onPageChanged.getRules(done),
      );
      return rules.find((rule) => rule.id === MARK_RULE_ID)?.tags?.[0];
    },
    async replace(rule) {
      await call<undefined>((done) =>
        api.onPageChanged.removeRules(undefined, () => done(undefined)),
      );
      if (!rule) return;
      images ??= icon().catch((error: unknown) => {
        images = undefined;
        throw error;
      });
      const imageData = await images;
      await call<undefined>((done) =>
        api.onPageChanged.addRules(
          [
            {
              id: MARK_RULE_ID,
              tags: [rule.tag],
              conditions: rule.conditions.map(
                ({ urlMatches, css }) =>
                  new api.PageStateMatcher({ pageUrl: { urlMatches }, css }),
              ),
              actions: [new api.SetIcon({ imageData })],
            },
          ],
          () => done(undefined),
        ),
      );
    },
  };
}

/** Decodes the extension's PNGs into `ImageData` in the worker, as `SetIcon` takes it. */
export async function decodeIcon<Path extends string>(
  paths: Record<number, Path>,
  url: (path: Path) => string,
): Promise<Record<number, ImageData>> {
  const entries = await Promise.all(
    Object.entries(paths).map(async ([key, path]) => {
      const size = Number(key);
      const bitmap = await createImageBitmap(
        await (await fetch(url(path))).blob(),
      );
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0, size, size);
      return [size, context.getImageData(0, 0, size, size)] as const;
    }),
  );
  return Object.fromEntries(entries);
}
