import { editNodeText } from "./lib/node-text";
import { replaceRegex, type ScriptletMeta, type Win } from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "trusted-replace-node-text",
  aliases: ["trusted-rpnt", "replace-node-text", "rpnt"],
  trusted: true,
};

/**
 * remove-node-text that replaces `pattern` (text everywhere, or `/re/flags`) with
 * `replacement` instead of emptying the node.
 */
export default function trustedReplaceNodeText(win: Win, ...args: string[]) {
  const [, pattern = "", replacement = ""] = args;
  const regex = replaceRegex(pattern);
  if (!regex) return;
  editNodeText(win, args, 3, (text) => text.replace(regex, replacement));
}
