import { editFetchResponses, requestTest } from "./lib/network";
import { jsonPruner } from "./lib/prune";
import {
  namedArgs,
  stackMatches,
  type ScriptletMeta,
  type Win,
} from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "json-prune-fetch-response",
  aliases: [],
  trusted: false,
};

/**
 * json-prune on the JSON responses of the page's `fetch` calls that `propsToMatch`
 * matches (and whose stack trace `stackToMatch` matches).
 */
export default function jsonPruneFetchResponse(win: Win, ...args: string[]) {
  const [prune = "", needles = ""] = args;
  if (prune === "") return;
  const named = namedArgs(args, 2);
  const pruner = jsonPruner(prune, needles);
  const matches = requestTest(named.get("propsToMatch") ?? "");
  const stack = named.get("stackToMatch") ?? "";
  editFetchResponses(
    win,
    (props) => matches(props) && stackMatches(win, stack),
    (text) => {
      const value: unknown = JSON.parse(text);
      return pruner(value) ? JSON.stringify(value) : undefined;
    },
  );
}
