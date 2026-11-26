import {
  namedArgs,
  regexOf,
  runAt,
  sourceOf,
  textTest,
  wrapMethod,
  type ScriptletMeta,
  type Win,
} from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "addEventListener-defuser",
  aliases: ["aeld", "prevent-addEventListener"],
  trusted: false,
};

/**
 * Drops the page's `addEventListener` calls for the event `type` (its name, or
 * `/re/`; empty for any) whose listener's source matches `needle`, on the targets the
 * `elements` argument names (a selector, `window` or `document`; all by default).
 * Without arguments it does nothing (uBO logs).
 */
export default function addEventListenerDefuser(win: Win, ...args: string[]) {
  if (args.length === 0) return;
  const [type = "", needle = ""] = args;
  const named = namedArgs(args, 2);
  const typeRegex = regexOf(type);
  const matchesType =
    type === ""
      ? () => true
      : typeRegex !== undefined
        ? textTest(type)
        : (name: string) => name === type;
  const matchesListener = textTest(needle);
  const selector = named.get("elements") ?? "";
  const onTarget = (target: unknown) =>
    selector === "" ||
    selector.split(",").some((part) => {
      const css = part.trim();
      if (css === "window") return target === win;
      if (css === "document") return target === win.document;
      try {
        return target instanceof win.Element && target.matches(css);
      } catch {
        return false;
      }
    });
  runAt(win, named.get("runAt"), () =>
    wrapMethod(
      win,
      "EventTarget.prototype.addEventListener",
      (original, self, call) => {
        const [name, listener] = call;
        if (
          matchesType(String(name)) &&
          matchesListener(sourceOf(listener)) &&
          onTarget(self)
        )
          return undefined;
        return Reflect.apply(original, self, call);
      },
    ),
  );
}
