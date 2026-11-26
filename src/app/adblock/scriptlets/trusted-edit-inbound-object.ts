import { editJson, parseJsonPath } from "./lib/json-path";
import {
  isObject,
  wrapMethod,
  type ScriptletMeta,
  type Win,
} from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "trusted-edit-inbound-object",
  aliases: [],
  trusted: true,
};

/**
 * Edits an object the page passes to a method (`JSON.stringify`): the argument at
 * `position` (negative: from the end) goes on as a copy changed by a uBO-flavored
 * JSONPath query, which may assign.
 */
export default function trustedEditInboundObject(
  win: Win,
  method = "",
  position = "",
  query = "",
) {
  const at = Number.parseInt(position, 10);
  if (method === "" || query === "" || Number.isNaN(at)) return;
  const path = parseJsonPath(query);
  wrapMethod(win, method, (original, self, args) => {
    const index = at < 0 ? args.length + at : at;
    const arg = args[index];
    if (isObject(arg)) {
      let copy: unknown;
      try {
        copy = win.structuredClone(arg);
      } catch {
        copy = undefined;
      }
      if (copy !== undefined && editJson(path, copy, true) > 0) {
        args = [...args];
        args[index] = copy;
      }
    }
    return Reflect.apply(original, self, args);
  });
}
