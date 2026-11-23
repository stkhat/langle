import type { DetectLanguage } from "../content/article/should-run";
import type { TranslationProvider } from "../content/translate/translator";
import type { Settings } from "../core/settings";
import type { send } from "../messaging/client";
import type { Request } from "../messaging/protocol";

/** Listeners the test calls, as `storage.onChanged` would. */
export function listeners<T>() {
  const all = new Set<(value: T) => void>();
  return {
    watch(listener: (value: T) => void) {
      all.add(listener);
      return () => {
        all.delete(listener);
      };
    },
    emit(value: T) {
      for (const listener of [...all]) listener(value);
    },
    count: () => all.size,
  };
}

/** `watchSettings`'s listeners: `emit` gives them the settings and the ones emitted before. */
export function settingsListeners(initial: Settings) {
  let previous = initial;
  const all = new Set<(settings: Settings, previous: Settings) => void>();
  return {
    watch(listener: (settings: Settings, previous: Settings) => void) {
      all.add(listener);
      return () => {
        all.delete(listener);
      };
    },
    emit(settings: Settings) {
      const before = previous;
      previous = settings;
      for (const listener of [...all]) listener(settings, before);
    },
    count: () => all.size,
  };
}

export const detectEnglish: DetectLanguage = async () => ({
  isReliable: true,
  languages: [{ language: "en", percentage: 99 }],
});

export const noTranslation: TranslationProvider = {
  translate: async () => undefined,
};

/**
 * A background whose settings writes wait until the test lets them through, one at a
 * time: what a page shows while its changes are on their way.
 */
export function heldWrites(real: typeof send) {
  const answer = real as (request: Request) => Promise<unknown>;
  const held: (() => Promise<unknown>)[] = [];
  return {
    send: ((request: Request) =>
      request.type === "setSettings"
        ? new Promise<unknown>((resolve, reject) => {
            held.push(() => {
              const reply = answer(request);
              reply.then(resolve, reject);
              return reply;
            });
          })
        : answer(request)) as typeof send,
    waiting: () => held.length,
    /** The oldest write is stored, told and answered, and whoever sent it has reacted. */
    async storeNext() {
      await held.shift()!();
      await new Promise((resolve) => setTimeout(resolve));
    },
  };
}
