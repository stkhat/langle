import { isPresence, type SetupPing } from "../messaging/page-protocol";
import type { SetupDeps } from "./setup";

interface Tab {
  id?: number;
  windowId?: number;
  status?: string;
}

/** What the setup's tab needs; the background passes the browser's. */
export interface SetupTabDeps {
  pageUrl: string;
  tabs: {
    query(query: {
      active?: boolean;
      lastFocusedWindow?: boolean;
      windowId?: number;
    }): Promise<Tab[]>;
    get(id: number): Promise<Tab>;
    create(properties: { url?: string; windowId?: number }): Promise<Tab>;
    update(id: number, properties: { active: boolean }): Promise<unknown>;
    remove(id: number): Promise<void>;
    reload(id: number): Promise<void>;
    sendMessage(id: number, message: object): Promise<unknown>;
  };
  focusWindow(windowId: number): Promise<unknown>;
  /** `storage.session`: the setup's tab, and the one it goes back to. */
  session: { get(): Promise<unknown>; set(value: Opened): Promise<void> };
  /** `action.openPopup`, where the browser has it. */
  openPopup?: (options: { windowId: number }) => Promise<void>;
  wait?: (ms: number) => Promise<void>;
}

interface Opened {
  setupTab: number;
  returnTo?: number;
}

const LOAD_POLL_MS = 250;
const LOAD_WAIT_MS = 10_000;
/** A content script can still be starting when a page says it is done. */
const ASK_AGAIN_MS = 300;

/**
 * The setup's tab (ui.md "First-run consent", "After Start"): it opens over the page
 * the user was on, and when the setup ends goes back to that page, which is reloaded
 * once if Langle does not run there. No other tab is reloaded, and no tab's address is
 * read. The background does this: the setup page does not outlive its tab.
 */
export function createSetupTab({
  pageUrl,
  tabs,
  focusWindow,
  session,
  openPopup,
  wait = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}: SetupTabDeps): SetupDeps["tab"] {
  async function opened(): Promise<Opened | undefined> {
    const value = await session.get();
    return typeof (value as Opened | undefined)?.setupTab === "number"
      ? (value as Opened)
      : undefined;
  }

  /** The tab; undefined when it is gone. */
  const existing = (id: number) => tabs.get(id).catch(() => undefined);

  /** A tab's answer; undefined when nothing of Langle is there to give one. */
  const ask = (id: number, message: object) =>
    tabs.sendMessage(id, message).catch(() => undefined);

  async function show(tab: Tab & { id: number }) {
    if (tab.windowId !== undefined) await focusWindow(tab.windowId);
    await tabs.update(tab.id, { active: true });
  }

  /** Reloads the tab once if Langle does not run there as it should. */
  async function ensureRunning(id: number) {
    for (let waited = 0; waited < LOAD_WAIT_MS; waited += LOAD_POLL_MS) {
      const tab = await existing(id);
      if (!tab) return;
      if (tab.status !== "loading") break;
      await wait(LOAD_POLL_MS);
    }
    let answer = await ask(id, { type: "pagePresence" });
    if (!isPresence(answer)) {
      await wait(ASK_AGAIN_MS);
      answer = await ask(id, { type: "pagePresence" });
    }
    if (isPresence(answer) && !answer.reload) return;
    // Rejected only when the tab was closed meanwhile.
    await tabs.reload(id).catch(() => undefined);
  }

  return {
    async open() {
      const last = await opened();
      if (last) {
        const ping: SetupPing = { type: "setupPing" };
        const tab = await existing(last.setupTab);
        if (tab && (await ask(last.setupTab, ping)) === true)
          return show({ ...tab, id: last.setupTab });
      }
      const [before] = await tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      const created = await tabs.create({ url: pageUrl });
      if (created.id === undefined) return;
      await session.set({
        setupTab: created.id,
        ...(before?.id !== undefined && { returnTo: before.id }),
      });
    },

    async back(setup) {
      if (setup?.id === undefined) return;
      const { id, windowId } = setup;
      const last = await opened();
      const returnTo = last?.setupTab === id ? last.returnTo : undefined;
      let target =
        returnTo === undefined ? undefined : await existing(returnTo);
      let blank = false;
      if (target) {
        await show({ ...target, id: returnTo! });
      } else if ((await tabs.query({ windowId })).length === 1) {
        // Closing the window's only tab would close the window.
        target = await tabs.create({ windowId });
        blank = true;
      }
      await tabs.remove(id);
      target ??= (await tabs.query({ active: true, windowId }))[0];
      if (!target) return;
      if (!blank && target.id !== undefined) await ensureRunning(target.id);
      if (openPopup && target.windowId !== undefined)
        // Refused (the window is not in front): the icon shows the same on a click.
        await openPopup({ windowId: target.windowId }).catch(() => undefined);
    },
  };
}
