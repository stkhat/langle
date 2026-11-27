import { browser } from "wxt/browser";
import { nativeLanguages } from "../core/languages";
import {
  agreed,
  chosen,
  SETUP_KEY,
  setupStage,
  type Setup,
} from "../core/setup";
import { errorText } from "../core/util";
import type { LanguagePair, Reply, SetupStatus } from "../messaging/protocol";
import { getSetupStage } from "../messaging/setup";
import { chosenPair, storeChosenPair } from "./settings-store";

/** The part of `runtime.MessageSender` the setup uses. */
interface Sender {
  url?: string;
  tab?: { id?: number; windowId?: number };
}

export interface SetupDeps {
  /** The setup page's address. Only it can agree and start. */
  pageUrl: string;
  tab: {
    /** Opens the setup, or shows the one that is open. */
    open(): Promise<void>;
    /** The setup ended in this tab: back to the page before it. */
    back(tab: Sender["tab"]): Promise<void>;
  };
  /**
   * Langle ran on this device before it had a setup (its packs are here). Such a
   * device was installed from a build that no store ever offered, so an update sets
   * it up as it is instead of asking.
   */
  ranBefore(): Promise<boolean>;
}

async function storedSetup(): Promise<unknown> {
  return (await browser.storage.local.get(SETUP_KEY))[SETUP_KEY];
}

const storeSetup = (setup: Setup) =>
  browser.storage.local.set({ [SETUP_KEY]: setup });

/** Where the device stands. Browser sync is not read before the user agreed. */
async function status(): Promise<SetupStatus> {
  const stage = await getSetupStage();
  if (stage === "consent") return { stage, pair: null };
  return { stage, pair: await chosenPair() };
}

/**
 * Asked for by the first run's Drive step (ui.md "First run", phone app) once the user
 * agreed: what cloud storage this build offers, and connecting it, so the languages
 * step can show the pair the other devices use.
 */
const AFTER_CONSENT = new Set(["cloudStatus", "cloudConnect"]);

function offeredPair(value: object): LanguagePair {
  const { learningLang, nativeLang } = value as Partial<
    Record<keyof LanguagePair, unknown>
  >;
  if (
    typeof learningLang !== "string" ||
    typeof nativeLang !== "string" ||
    !nativeLanguages(learningLang).includes(nativeLang)
  )
    throw new Error("These languages are not offered");
  return { learningLang, nativeLang };
}

/**
 * The first run in the background (ui.md "First-run consent"): the only requests
 * answered until this device is set up are the setup's own.
 */
export function createSetup({ pageUrl, tab, ranBefore }: SetupDeps) {
  function requirePage(sender: Sender) {
    if (sender.url?.split(/[?#]/, 1)[0] !== pageUrl)
      throw new Error("Only the setup page can do this");
  }

  /** Not waited for: the page gets its answer before its tab closes. */
  function back(sender: Sender) {
    tab
      .back(sender.tab)
      .catch((error: unknown) =>
        console.error("Langle: could not leave the setup", error),
      );
  }

  async function agree(sender: Sender) {
    requirePage(sender);
    const next = agreed(await storedSetup());
    await storeSetup(next);
    const result = await status();
    if (result.stage === "ready") back(sender);
    return result;
  }

  async function start(request: object, sender: Sender) {
    requirePage(sender);
    const stored = await storedSetup();
    if (setupStage(stored) === "consent")
      throw new Error("Langle needs the user's agreement first");
    // The pair first: what waits for the setup then finds it stored.
    await storeChosenPair(offeredPair(request));
    await storeSetup(chosen(stored));
    back(sender);
    return null;
  }

  return {
    /** Answers the setup's requests, and passes the others on once it ended. */
    guard<S extends object>(
      handle: (request: unknown, sender?: S) => Promise<Reply>,
    ) {
      return async (request: unknown, sender?: S): Promise<Reply> => {
        const message = (request ?? {}) as { type?: unknown };
        // The browser's whole sender, whatever part of it `handle` reads.
        const from = (sender ?? {}) as Sender;
        try {
          switch (message.type) {
            case "setupStatus":
              return { ok: true, value: await status() };
            case "openSetup":
              await tab.open();
              return { ok: true, value: null };
            case "agreeSetup":
              return { ok: true, value: await agree(from) };
            case "startLangle":
              return { ok: true, value: await start(message, from) };
          }
          const stage = await getSetupStage();
          if (
            stage === "languages" &&
            typeof message.type === "string" &&
            AFTER_CONSENT.has(message.type)
          )
            requirePage(from);
          else if (stage !== "ready")
            return { ok: false, error: "Langle is not set up yet" };
        } catch (error) {
          return { ok: false, error: errorText(error) };
        }
        return handle(request, sender);
      };
    },

    /**
     * Opens the setup when Langle is installed or updated on a device without one. An
     * update of a device from before the setup sets it up with what it has.
     */
    openOnInstall() {
      browser.runtime.onInstalled.addListener(({ reason }) => {
        if (reason !== "install" && reason !== "update") return;
        (async () => {
          if (
            reason === "update" &&
            (await storedSetup()) === undefined &&
            (await ranBefore())
          )
            return storeSetup(chosen(agreed(undefined)));
          if ((await getSetupStage()) !== "ready") await tab.open();
        })().catch((error: unknown) =>
          console.error("Langle: could not open the setup", error),
        );
      });
    },
  };
}
