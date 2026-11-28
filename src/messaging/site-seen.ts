import { browser } from "wxt/browser";
import { own } from "../core/util";
import { watchStorage } from "./storage";

/**
 * The hosts the toolbar popup was opened on (architecture.md "Site access": seen
 * hosts), in `storage.local`: per computer, like Chrome's grants. They exist only so
 * the toolbar icon's mark and the popup's bubble show once per host.
 */
export const SITE_SEEN_KEY = "siteSeen";

/** Anything else stored there counts as no hosts. */
const asHosts = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((host): host is string => typeof host === "string")
    : [];

/** The seen hosts, in the order they were first seen. */
export async function getSiteSeen(): Promise<string[]> {
  const stored = await browser.storage.local.get(SITE_SEEN_KEY);
  return asHosts(stored[SITE_SEEN_KEY]);
}

/** Adds a host (lowercased) to the seen hosts; a host seen before stays as it is. */
export async function addSiteSeen(host: string): Promise<void> {
  const name = host.toLowerCase();
  const hosts = await getSiteSeen();
  if (hosts.includes(name)) return;
  await browser.storage.local.set({ [SITE_SEEN_KEY]: [...hosts, name] });
}

/** Calls `listener` with the seen hosts after every change; returns an unwatch. */
export const watchSiteSeen = (listener: (hosts: string[]) => void) =>
  watchStorage("local", (changes) => {
    const change = own(changes, SITE_SEEN_KEY);
    if (change) listener(asHosts(change.newValue));
  });
