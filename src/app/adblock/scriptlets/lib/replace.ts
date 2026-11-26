// The text replacement of trusted-replace-fetch-response and -xhr-response.
import { namedArgs, replaceRegex, textTest } from "./shared";

/**
 * `[pattern, replacement, propsToMatch, ...named]` as a text edit, or undefined when
 * there is no pattern: `*` replaces the whole text, `/re/flags` as the regex says,
 * plain text everywhere it occurs; `includes` must be found in the text first.
 */
export function replacer(
  args: readonly string[],
): ((text: string) => string | undefined) | undefined {
  const [pattern = "", replacement = ""] = args;
  if (pattern === "") return undefined;
  const named = namedArgs(args, 3);
  const includes = textTest(named.get("includes") ?? "");
  const regex = pattern === "*" ? undefined : replaceRegex(pattern);
  if (regex === null) return undefined;
  return (text) => {
    if (!includes(text)) return undefined;
    return regex ? text.replace(regex, replacement) : replacement;
  };
}
