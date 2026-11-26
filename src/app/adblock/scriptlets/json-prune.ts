import { jsonPruner } from "./lib/prune";
import {
  stackMatches,
  wrapMethod,
  type ScriptletMeta,
  type Win,
} from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "json-prune",
  aliases: [],
  trusted: false,
};

/**
 * Removes properties from what `JSON.parse` and `Response.prototype.json` give the page:
 * the space-separated paths of `prune`, once every path of `needles` is there, when
 * the call's stack trace matches `stack`. Without `prune` it does nothing (uBO logs).
 */
export default function jsonPrune(
  win: Win,
  prune = "",
  needles = "",
  stack = "",
) {
  if (prune === "") return;
  const pruner = jsonPruner(prune, needles);
  wrapMethod(win, "JSON.parse", (original, self, args) => {
    const value: unknown = Reflect.apply(original, self, args);
    if (stackMatches(win, stack)) pruner(value);
    return value;
  });
  wrapMethod(win, "Response.prototype.json", (original, self, args) => {
    const matched = stackMatches(win, stack);
    return (Reflect.apply(original, self, args) as Promise<unknown>).then(
      (value) => {
        if (matched) pruner(value);
        return value;
      },
    );
  });
}
