import type { Bridge } from "../bridge/bridge";
import { createEvent } from "./events";

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type AreaName = "local" | "sync" | "session";
type Keys = string | string[] | Record<string, unknown> | null | undefined;

/**
 * `browser.storage` over native code's key-value store (docs/specs/mobile-app.md "Shim
 * surface"). Native code answers `get` with the stored keys only: Chrome's defaults
 * and `null` (everything) are kept here. `getBytesInUse` and the quotas are left out,
 * so code that checks for them (browser-sync-backend.ts) does without.
 */
export function createStorage(bridge: Bridge) {
  const onChanged = createEvent<[Changes, AreaName]>();
  bridge.on("storage.onChanged", ([changes, area]) => {
    onChanged.emit(changes as Changes, area as AreaName);
  });

  const area = (name: AreaName) => {
    const areaChanged = createEvent<[Changes]>();
    onChanged.addListener((changes, changed) => {
      if (changed === name) areaChanged.emit(changes);
    });
    return {
      get: async (keys?: Keys): Promise<Record<string, unknown>> => {
        const defaults =
          keys && typeof keys === "object" && !Array.isArray(keys)
            ? keys
            : undefined;
        const asked =
          keys === null || keys === undefined
            ? null
            : typeof keys === "string"
              ? [keys]
              : Array.isArray(keys)
                ? keys
                : Object.keys(keys);
        const stored = (await bridge.call(`storage.${name}.get`, asked)) as
          Record<string, unknown> | undefined;
        return { ...defaults, ...stored };
      },
      set: async (items: Record<string, unknown>): Promise<void> => {
        await bridge.call(`storage.${name}.set`, items);
      },
      remove: async (keys: string | string[]): Promise<void> => {
        await bridge.call(
          `storage.${name}.remove`,
          typeof keys === "string" ? [keys] : keys,
        );
      },
      clear: async (): Promise<void> => {
        await bridge.call(`storage.${name}.clear`);
      },
      onChanged: areaChanged,
    };
  };

  return {
    local: area("local"),
    sync: area("sync"),
    session: area("session"),
    onChanged,
  };
}
