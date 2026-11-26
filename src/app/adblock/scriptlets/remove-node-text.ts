import { editNodeText } from "./lib/node-text";
import type { ScriptletMeta, Win } from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "remove-node-text",
  aliases: ["rmnt"],
  trusted: false,
};

/**
 * Empties the nodes named `nodeName` (`#text`, `script` …) whose text matches
 * `pattern`, as the page adds them, until DOMContentLoaded (named arguments
 * `includes`, `excludes`, `sedCount`, `stay`, `quitAfter`).
 */
export default function removeNodeText(win: Win, ...args: string[]) {
  editNodeText(win, args, 2, () => "");
}
