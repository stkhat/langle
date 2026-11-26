import { editXhrResponses, requestTest } from "./lib/network";
import { replacer } from "./lib/replace";
import type { ScriptletMeta, Win } from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "trusted-replace-xhr-response",
  aliases: [],
  trusted: true,
};

/** trusted-replace-fetch-response for the page's XMLHttpRequests. */
export default function trustedReplaceXhrResponse(win: Win, ...args: string[]) {
  const replace = replacer(args);
  if (!replace) return;
  editXhrResponses(win, requestTest(args[2] ?? ""), replace);
}
