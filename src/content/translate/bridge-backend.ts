import type { AppHost, PairCodes, TranslatorStatus } from "../../core/app-host";
import { modelPacksFor } from "../../core/packs/pairs";
import {
  packUsable,
  type PackState,
  type PackStates,
} from "../../core/packs/state";
import { own } from "../../core/util";
import { watchPackState } from "../../messaging/storage";
import type { TranslatorBackend } from "./backend";
import type { ModelDownload, TranslationProvider } from "./translator";

/** The background's pack states, now and after every change (`watchPackState`). */
type WatchStates = (listener: (states: PackStates) => void) => () => void;

export interface BridgeBackendOptions {
  watchStates?: WatchStates;
}

const keyOf = (pair: PairCodes) => `${pair.from}>${pair.to}`;

/** The pair's model packs that have a state, with their states. */
function modelStates(states: PackStates, pair: PairCodes): PackState[] {
  const has = (pack: string) => own<PackState>(states, pack) !== undefined;
  return modelPacksFor(pair.from, pair.to, has).map(
    (pack) => own<PackState>(states, pack) as PackState,
  );
}

/**
 * The pair's model download as the packs' states show it: undefined once every pack
 * is usable, else their share (usable packs whole), or no share before any has a size.
 */
function packsDownload(
  states: PackStates,
  pair: PairCodes,
): ModelDownload | undefined {
  const found = modelStates(states, pair);
  if (found.length > 0 && found.every(packUsable)) return undefined;
  let received = 0;
  let total = 0;
  for (const state of found) {
    received += packUsable(state) ? state.total : state.received;
    total += state.total;
  }
  return total > 0 ? { share: Math.min(received, total) / total } : {};
}

/**
 * The phone app's translator (mobile-translation.md "The bridge provider"): the app's
 * translation host over `appHost`. Android's models are packs the background keeps in
 * `packState`; iOS's are Apple's, downloaded after its consent sheet, which only
 * `downloadModels` (the languages just chosen) and Settings' "Download" show.
 */
export function bridgeBackend(
  host: AppHost,
  { watchStates = watchPackState }: BridgeBackendOptions = {},
): TranslatorBackend {
  /** Hears the status each pair's consent sheet closed with (iOS). */
  const prepared = new Map<string, Set<(status: TranslatorStatus) => void>>();

  const statusOf = (pair: PairCodes): Promise<TranslatorStatus> =>
    host.translatorStatus(pair).catch(() => "unavailable" as const);

  async function prepare(pair: PairCodes): Promise<void> {
    let status: TranslatorStatus;
    try {
      status = await host.prepareTranslator(pair);
    } catch {
      return;
    }
    for (const listener of [...(prepared.get(keyOf(pair)) ?? [])])
      listener(status);
  }

  function onPrepared(
    pair: PairCodes,
    listener: (status: TranslatorStatus) => void,
  ): () => void {
    const key = keyOf(pair);
    const listeners = prepared.get(key) ?? new Set();
    listeners.add(listener);
    prepared.set(key, listeners);
    return () => listeners.delete(listener);
  }

  /** True once the pair's model packs are usable, false when one failed. */
  function packsArrive(pair: PairCodes): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      // Filled after watchStates returns, which may have called back already.
      const stops: (() => void)[] = [];
      const end = (ready: boolean) => {
        done = true;
        for (const stop of stops) stop();
        resolve(ready);
      };
      stops.push(
        watchStates((states) => {
          if (done) return;
          const found = modelStates(states, pair);
          if (found.length > 0 && found.every(packUsable)) end(true);
          else if (found.some((s) => s.state === "failed" && !packUsable(s)))
            end(false);
        }),
      );
      if (done) for (const stop of stops) stop();
    });
  }

  function create(from: string, to: string): TranslationProvider {
    const pair = { from, to };
    let ready = false;
    return {
      async open({ download = true } = {}) {
        if (ready) return true;
        const status = await statusOf(pair);
        // Packs on their way are waited for; Apple's sheet is never shown from here.
        ready =
          status === "ready" ||
          (status === "packs" && download && (await packsArrive(pair)));
        return ready;
      },
      async translate(text, { start = true } = {}) {
        try {
          return (await host.translate({ ...pair, text, start })) ?? undefined;
        } catch {
          return undefined;
        }
      },
      watchDownload(listener) {
        let stopped = false;
        let unwatch: (() => void) | undefined;
        void statusOf(pair).then((status) => {
          if (stopped) return;
          if (status === "packs")
            unwatch = watchStates((states) => {
              if (!stopped) listener(packsDownload(states, pair));
            });
          else if (status === "download") {
            listener({});
            unwatch = onPrepared(pair, (now) =>
              listener(now === "download" ? {} : undefined),
            );
          } else listener(undefined);
        });
        return () => {
          stopped = true;
          unwatch?.();
        };
      },
    };
  }

  /** The pairs `learning` → `native` translates with (the definitions' and the pages'). */
  const pairsOf = (learning: string, native: string): PairCodes[] =>
    [...new Set(["en", learning])]
      .filter((from) => from !== native)
      .map((from) => ({ from, to: native }));

  /** Those of the pairs whose models are Apple's to download (iOS). */
  async function toDownload(learning: string, native: string) {
    const pairs = pairsOf(learning, native);
    const statuses = await Promise.all(pairs.map(statusOf));
    return pairs.filter((_, i) => statuses[i] === "download");
  }

  /** Asks for the sheets of `learning` → `native`'s pairs whose models are Apple's to download. */
  async function startModels(learning: string, native: string) {
    const sheets = (await toDownload(learning, native)).map((pair) =>
      prepare(pair),
    );
    return { downloaded: Promise.all(sheets) };
  }

  return {
    create,
    available: async (from, to) =>
      (await statusOf({ from, to })) !== "unavailable",
    startModels,
    async downloadModels(learning, native) {
      await (
        await startModels(learning, native)
      ).downloaded;
    },
    waitsForConsent: async (learning, native) =>
      (await toDownload(learning, native)).length > 0,
    // The app's models never wait for a user activation.
    downloadOnFirstActivation: () => () => {},
  };
}
