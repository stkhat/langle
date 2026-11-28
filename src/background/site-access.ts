import { articleMatches, patternsCoverHost } from "../core/site-access/origins";
import { serial } from "../core/util";
import { isPresence } from "../messaging/page-protocol";
import type { PendingTab, SiteAccessRemoved } from "../messaging/site-access";

/** The registered article script (architecture.md "Site access"). */
export const ARTICLES_SCRIPT_ID = "articles";
/** WXT's bundle of `src/entrypoints/content/index.tsx`. */
export const ARTICLES_SCRIPT_FILE = "content-scripts/content.js";

/** `scripting.RegisteredContentScript`, as far as it is used here. */
export interface RegisteredScript {
  id: string;
  js?: string[];
  matches?: string[];
  runAt?: "document_start" | "document_end" | "document_idle";
  allFrames?: boolean;
  persistAcrossSessions?: boolean;
}

interface Listenable<A extends unknown[]> {
  addListener(listener: (...args: A) => void): void;
}

interface Permissions {
  origins?: string[];
}

/** What following the grants needs; the background passes the browser's. */
export interface SiteAccessDeps {
  /** The manifest's own content-script matches (the video sites): left out. */
  staticMatches: readonly string[];
  permissions: {
    getAll(): Promise<Permissions>;
    onAdded: Listenable<[Permissions]>;
    onRemoved: Listenable<[Permissions]>;
  };
  scripting: {
    getRegisteredContentScripts(filter?: {
      ids?: string[];
    }): Promise<RegisteredScript[]>;
    registerContentScripts(scripts: RegisteredScript[]): Promise<void>;
    updateContentScripts(scripts: RegisteredScript[]): Promise<void>;
    unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
    executeScript(injection: {
      target: { tabId: number; allFrames?: boolean };
      files: string[];
    }): Promise<unknown>;
  };
  tabs: {
    get(tabId: number): Promise<{ url?: string }>;
    query(query: object): Promise<{ id?: number }[]>;
    sendMessage(
      tabId: number,
      message: unknown,
      options: { frameId: number },
    ): Promise<unknown>;
  };
  /** The pending tab, kept in `storage.session` so a worker restart keeps it. */
  pending: {
    get(): Promise<PendingTab | undefined>;
    set(tab: PendingTab): Promise<void>;
    clear(): Promise<void>;
  };
  /** `runtime.onInstalled`: an update drops registered scripts (S0), grants stay. */
  onInstalled: Listenable<[]>;
  /** `runtime.onStartup`. */
  onStartup: Listenable<[]>;
}

export interface SiteAccess {
  /** Keeps the tab the popup is turning a host on in (`siteAccessPending`). */
  setPending(tab: PendingTab): Promise<void>;
  /** Settles once the work queued so far is done (tests). */
  readonly idle: Promise<unknown>;
}

const sameMatches = (a: readonly string[] = [], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((match, i) => match === b[i]);

const quiet = () => undefined;

/**
 * Keeps the registered script `articles` matching exactly the granted article origins
 * (`permissions.getAll()`), at every worker start, install, update and browser start
 * (Chrome drops registered scripts on an update, S0) and on every grant added or
 * removed, whether from the popup or from Chrome's own menus. A grant covering the
 * pending tab's host also injects the article script into that tab, so its page needs
 * no reload; removed grants are told to every tab, whose article script then leaves a
 * page no longer covered. Registers its listeners synchronously, so an event that wakes
 * the worker is heard.
 */
export function followSiteAccess(deps: SiteAccessDeps): SiteAccess {
  const { permissions, scripting, tabs } = deps;
  // One after another, so a change never races the one before it.
  const work = serial((error) => console.error(error));
  const queue = (task: () => Promise<unknown>) => {
    void work.run(task);
  };

  /** Makes the registration match the grants; returns the article matches. */
  async function sync(): Promise<string[]> {
    const matches = articleMatches(
      (await permissions.getAll()).origins ?? [],
      deps.staticMatches,
    );
    const [current] = await scripting.getRegisteredContentScripts({
      ids: [ARTICLES_SCRIPT_ID],
    });
    if (matches.length === 0) {
      if (current)
        await scripting.unregisterContentScripts({ ids: [ARTICLES_SCRIPT_ID] });
    } else if (!current)
      await scripting.registerContentScripts([
        {
          id: ARTICLES_SCRIPT_ID,
          js: [ARTICLES_SCRIPT_FILE],
          matches,
          runAt: "document_idle",
          allFrames: false,
          persistAcrossSessions: true,
        },
      ]);
    else if (!sameMatches(current.matches, matches))
      await scripting.updateContentScripts([
        { id: ARTICLES_SCRIPT_ID, matches },
      ]);
    return matches;
  }

  /** Whether a Langle content script answers in the tab's top frame. */
  const runsLangle = (tabId: number) =>
    tabs
      .sendMessage(tabId, { type: "pagePresence" }, { frameId: 0 })
      .then(isPresence, () => false);

  /** Injects the article script into the pending tab once a grant covers its host. */
  async function injectPending(added: readonly string[]) {
    const pending = await deps.pending.get();
    if (!pending || !patternsCoverHost(added, pending.host)) return;
    await deps.pending.clear();
    const { tabId, host } = pending;
    // Still on that host (its URL shows now that the host is granted), and without
    // a copy already: one the registration started on a page loaded since.
    const url = await tabs.get(tabId).then((tab) => tab.url, quiet);
    if (!url || new URL(url).hostname !== host) return;
    if (await runsLangle(tabId)) return;
    // The tab can still close or navigate meanwhile: its next page gets the
    // registered script then.
    await scripting
      .executeScript({ target: { tabId }, files: [ARTICLES_SCRIPT_FILE] })
      .catch(quiet);
  }

  async function tellRemoved(removed: string[], granted: string[]) {
    const message: SiteAccessRemoved = {
      type: "siteAccessRemoved",
      removed,
      granted,
    };
    const all = await tabs.query({});
    await Promise.all(
      all.flatMap(({ id }) =>
        id === undefined
          ? []
          : [tabs.sendMessage(id, message, { frameId: 0 }).catch(quiet)],
      ),
    );
  }

  deps.onInstalled.addListener(() => queue(sync));
  deps.onStartup.addListener(() => queue(sync));
  permissions.onAdded.addListener(({ origins = [] }) =>
    queue(async () => {
      await sync();
      await injectPending(origins);
    }),
  );
  permissions.onRemoved.addListener(({ origins = [] }) =>
    queue(async () => tellRemoved(origins, await sync())),
  );
  queue(sync);

  return {
    setPending: (tab) => work.run(() => deps.pending.set(tab)),
    get idle() {
      return work.idle;
    },
  };
}
