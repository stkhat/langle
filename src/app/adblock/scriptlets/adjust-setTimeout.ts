import { adjustTimer } from "./lib/timers";
import type { ScriptletMeta, Win } from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "adjust-setTimeout",
  aliases: ["nano-setTimeout-booster", "nano-stb"],
  trusted: false,
};

/**
 * Multiplies the delay of the page's `setTimeout` calls whose callback matches
 * `needle` and whose delay is `delay` (1000 by default, `*` for any) by `boost`
 * (0.05 by default, between 0.02 and 50).
 */
export default function adjustSetTimeout(win: Win, ...args: string[]) {
  adjustTimer(win, "setTimeout", args);
}
