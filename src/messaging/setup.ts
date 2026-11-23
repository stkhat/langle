import { browser } from "wxt/browser";
import { SETUP_KEY, setupStage, type SetupStage } from "../core/setup";
import { watchStorage } from "./storage";

export async function getSetupStage(): Promise<SetupStage> {
  return setupStage((await browser.storage.local.get(SETUP_KEY))[SETUP_KEY]);
}

/** Calls `listener` with the stage after each change of this device's setup. */
export function watchSetupStage(
  listener: (stage: SetupStage) => void,
): () => void {
  return watchStorage("local", (changes) => {
    const change = changes[SETUP_KEY];
    if (change) listener(setupStage(change.newValue));
  });
}

/**
 * Calls `run` once this device is set up: at once, or when the user finishes the setup.
 * `waiting` is called when it is not set up yet. A setup that cannot be read is not
 * taken for one. Returns a cancel.
 */
export function whenSetUp(run: () => void, waiting?: () => void): () => void {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    unwatch();
    run();
  };
  // Watched first, so a setup that ends while it is being read is heard.
  const unwatch = watchSetupStage((stage) => {
    if (stage === "ready") go();
  });
  getSetupStage().then(
    (stage) => {
      if (stage === "ready") go();
      else if (!done) waiting?.();
    },
    () => {
      if (!done) waiting?.();
    },
  );
  return () => {
    done = true;
    unwatch();
  };
}
