import { browser } from "wxt/browser";
import {
  AD_BLOCKING_KEY,
  AD_BLOCKING_LISTS_KEY,
  adBlockingOf,
  listsUpdatedAt,
  type AdBlocking,
  type AdBlockingView,
} from "../core/ad-blocking";
import { PACK_STATE_KEY, type PackStates } from "../core/packs/state";
import { mergeSettings, SETTINGS_KEY, type Settings } from "../core/settings";
import { own } from "../core/util";

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export type StorageChangedListener = (
  changes: Record<string, StorageChange>,
  areaName: string,
) => void;

/** `storage.onChanged`. */
export interface StorageChangedEvent {
  addListener(listener: StorageChangedListener): void;
  removeListener(listener: StorageChangedListener): void;
}

/** Calls `listener` with each change in `area`; returns an unwatch. */
export function watchStorage(
  area: "sync" | "local",
  listener: (changes: Record<string, StorageChange>) => void,
  event: StorageChangedEvent = browser.storage.onChanged,
): () => void {
  const onChanged: StorageChangedListener = (changes, areaName) => {
    if (areaName === area) listener(changes);
  };
  event.addListener(onChanged);
  return () => {
    // A content script cut off by an extension reload has no `browser.storage` any
    // more: nothing is listening then.
    try {
      event.removeListener(onChanged);
    } catch {
      // Gone with the extension.
    }
  };
}

const watchStorageKey = (
  area: "sync" | "local",
  key: string,
  listener: (change: StorageChange) => void,
) =>
  watchStorage(area, (changes) => {
    const change = own(changes, key);
    if (change) listener(change);
  });

/** Calls `listener` whenever the settings change (on any device), with the ones before. */
export const watchSettings = (
  listener: (settings: Settings, previous: Settings) => void,
) =>
  watchStorageKey("sync", SETTINGS_KEY, ({ newValue, oldValue }) =>
    listener(mergeSettings(newValue), mergeSettings(oldValue)),
  );

/** Anything else stored under `packState` counts as no states. */
const asStates = (value: unknown): PackStates =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as PackStates)
    : {};

/**
 * Calls `listener` with the background's pack states as they are now, then after every
 * change. The states read first are dropped when a change arrived before them.
 */
export function watchPackState(
  listener: (states: PackStates) => void,
): () => void {
  let heard = false;
  let stopped = false;
  const unwatch = watchStorageKey("local", PACK_STATE_KEY, ({ newValue }) => {
    heard = true;
    listener(asStates(newValue));
  });
  browser.storage.local.get(PACK_STATE_KEY).then(
    (stored) => {
      if (!heard && !stopped) listener(asStates(stored[PACK_STATE_KEY]));
    },
    () => {
      if (!heard && !stopped) listener({});
    },
  );
  return () => {
    stopped = true;
    unwatch();
  };
}

/**
 * The phone app's ad-blocking switches and its lists' date (core/ad-blocking.ts), as
 * they are now and after every change, from ⋮ and the list store too. A key read
 * first is dropped when a change to it arrived before the read.
 */
export function watchAdBlocking(
  listener: (view: AdBlockingView) => void,
): () => void {
  const keys = [AD_BLOCKING_KEY, AD_BLOCKING_LISTS_KEY];
  const stored: Record<string, unknown> = {};
  const heard = new Set<string>();
  let stopped = false;
  const emit = () =>
    listener({
      ...adBlockingOf(stored[AD_BLOCKING_KEY]),
      listsUpdatedAt: listsUpdatedAt(stored[AD_BLOCKING_LISTS_KEY]),
    });
  const unwatch = watchStorage("local", (changes) => {
    const changed = keys.filter((key) => own(changes, key));
    for (const key of changed) {
      stored[key] = own(changes, key)!.newValue;
      heard.add(key);
    }
    if (changed.length > 0) emit();
  });
  const read = (values: Record<string, unknown>) => {
    if (stopped) return;
    for (const key of keys) if (!heard.has(key)) stored[key] = values[key];
    emit();
  };
  browser.storage.local.get(keys).then(read, () => read({}));
  return () => {
    stopped = true;
    unwatch();
  };
}

/** Saves the ad-blocking switches; the shells follow the change. */
export const setAdBlocking = (state: AdBlocking) =>
  browser.storage.local.set({ [AD_BLOCKING_KEY]: state });
