import { adjustTimer } from "./lib/timers";
import type { ScriptletMeta, Win } from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "adjust-setInterval",
  aliases: ["nano-setInterval-booster", "nano-sib"],
  trusted: false,
};

/** adjust-setTimeout for the page's `setInterval` calls. */
export default function adjustSetInterval(win: Win, ...args: string[]) {
  adjustTimer(win, "setInterval", args);
}
