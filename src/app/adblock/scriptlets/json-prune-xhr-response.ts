import { editXhrResponses, requestTest } from "./lib/network";
import { jsonPruner } from "./lib/prune";
import {
  namedArgs,
  stackMatches,
  type ScriptletMeta,
  type Win,
} from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "json-prune-xhr-response",
  aliases: [],
  trusted: false,
};

/** json-prune on the JSON responses of the page's XMLHttpRequests that `propsToMatch` matches. */
export default function jsonPruneXhrResponse(win: Win, ...args: string[]) {
  const [prune = "", needles = ""] = args;
  if (prune === "") return;
  const named = namedArgs(args, 2);
  const pruner = jsonPruner(prune, needles);
  const matches = requestTest(named.get("propsToMatch") ?? "");
  const stack = named.get("stackToMatch") ?? "";
  editXhrResponses(
    win,
    (props) => matches(props) && stackMatches(win, stack),
    (text) => {
      const value: unknown = JSON.parse(text);
      return pruner(value) ? JSON.stringify(value) : undefined;
    },
  );
}
