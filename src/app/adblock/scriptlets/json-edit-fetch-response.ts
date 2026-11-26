import { editJson, parseJsonPath } from "./lib/json-path";
import { editFetchResponses, requestTest } from "./lib/network";
import { namedArgs, type ScriptletMeta, type Win } from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "json-edit-fetch-response",
  aliases: [],
  trusted: false,
};

/**
 * Removes what a uBO-flavored JSONPath query finds in the JSON responses of the page's
 * `fetch` calls that `propsToMatch` matches. A query that assigns is ignored here (only
 * the trusted version may assign).
 */
export default function jsonEditFetchResponse(win: Win, ...args: string[]) {
  const [query = ""] = args;
  if (query === "") return;
  const path = parseJsonPath(query);
  if (path.assignment) return;
  const matches = requestTest(namedArgs(args, 1).get("propsToMatch") ?? "");
  editFetchResponses(win, matches, (text) => {
    const value: unknown = JSON.parse(text);
    return editJson(path, value, false) > 0 ? JSON.stringify(value) : undefined;
  });
}
