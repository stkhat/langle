// adjust-setTimeout and adjust-setInterval: the delay of the timers whose callback
// matches, multiplied.
import { sourceOf, textTest, wrapMethod, type Win } from "./shared";

export function adjustTimer(
  win: Win,
  method: "setTimeout" | "setInterval",
  [needle = "", delay = "", boost = ""]: readonly string[],
) {
  const matches = textTest(needle);
  const anyDelay = delay === "*";
  const wanted = Number.parseInt(delay, 10) || 1000;
  const factor = Number.parseFloat(boost);
  // 20 times faster by default, at most 50 times either way.
  const multiplier = Number.isFinite(factor)
    ? Math.min(50, Math.max(0.02, factor))
    : 0.05;
  wrapMethod(win, method, (original, self, args) => {
    const [callback, ms] = args;
    if ((anyDelay || Number(ms) === wanted) && matches(sourceOf(callback)))
      args[1] = Number(ms) * multiplier;
    return Reflect.apply(original, self, args);
  });
}
