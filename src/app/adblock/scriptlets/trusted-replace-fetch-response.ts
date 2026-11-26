import { editFetchResponses, requestTest } from "./lib/network";
import { replacer } from "./lib/replace";
import type { ScriptletMeta, Win } from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "trusted-replace-fetch-response",
  aliases: ["trusted-rpfr"],
  trusted: true,
};

/**
 * Replaces `pattern` (`*` for the whole text, text, or `/re/flags`) with `replacement`
 * in the text responses of the page's `fetch` calls that `propsToMatch` matches, when
 * the `includes` argument is found in them.
 */
export default function trustedReplaceFetchResponse(
  win: Win,
  ...args: string[]
) {
  const replace = replacer(args);
  if (!replace) return;
  editFetchResponses(win, requestTest(args[2] ?? ""), replace);
}
