import {
  sourceOf,
  textTest,
  wrapMethod,
  type ScriptletMeta,
  type Win,
} from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "prevent-setTimeout",
  aliases: ["no-setTimeout-if", "nostif", "setTimeout-defuser"],
  trusted: false,
};

/** A test of a delay: `n`, `min-max`, `min-` or `-max`; empty for any. */
function delayTest(spec: string): (delay: number) => boolean {
  if (spec === "") return () => true;
  const range = /^(\d*)-(\d*)$/.exec(spec);
  if (range) {
    const min = range[1] ? Number(range[1]) : -Infinity;
    const max = range[2] ? Number(range[2]) : Infinity;
    return (delay) => delay >= min && delay <= max;
  }
  const exact = Number(spec);
  return (delay) => delay === exact;
}

/**
 * Makes the page's `setTimeout` calls a no-op when the callback's source matches
 * `needle` and the delay matches `delay` (each turned around by a leading `!`).
 * Without arguments it does nothing (uBO logs).
 */
export default function preventSetTimeout(win: Win, ...args: string[]) {
  if (args.length === 0) return;
  const [needle = "", delay = ""] = args;
  const not = (spec: string) => spec.startsWith("!");
  const matchesSource = textTest(not(needle) ? needle.slice(1) : needle);
  const matchesDelay = delayTest(not(delay) ? delay.slice(1) : delay);
  wrapMethod(win, "setTimeout", (original, self, call) => {
    const [callback, ms] = call;
    if (
      matchesSource(sourceOf(callback)) !== not(needle) &&
      matchesDelay(Number(ms) || 0) !== not(delay)
    )
      call = [function () {}, ms];
    return Reflect.apply(original, self, call);
  });
}
