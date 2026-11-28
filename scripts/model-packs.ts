// The phone app's model packs as a file of their own (docs/specs/mobile-app.md
// "Translation"): the names of packs.lock.json's model packs (`kind: "model"`), written
// into the langle-app output, so Android's model store can say a pair it has never
// downloaded is `packs` (to come), not `unavailable`, from the first start.
import type { PackLock } from "../src/core/packs/lock.ts";

/** Where the names go in the langle-app output. */
export const MODEL_PACKS_FILE = "packs/models.json";

/** The lock's model packs, sorted, as the JSON array the file holds. */
export function modelPacksFile(lock: Pick<PackLock, "packs">): string {
  const names = Object.entries(lock.packs)
    .filter(([, entry]) => entry.kind === "model")
    .map(([name]) => name)
    .sort();
  return JSON.stringify(names);
}
