import { useEffect, useState } from "preact/hooks";
import { createTouchMode, type TouchMode } from "../content/touch/touch-mode";

/**
 * Whether an extension page shows its phone layout (spec mobile-app.md "Phone layouts
 * of the shared pages"): the page is in touch mode, watched, never chosen by the build
 * target. `touch` is the page's touch mode but in tests; it is read once, on mount.
 */
export function usePhoneLayout(touch?: TouchMode): boolean {
  const [mode] = useState(() => touch ?? createTouchMode());
  const [on, setOn] = useState(() => mode.on());
  useEffect(() => {
    // A change between the first render and this effect is not missed.
    setOn(mode.on());
    return mode.watch(setOn);
  }, [mode]);
  return on;
}
