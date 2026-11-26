import {
  namedArgs,
  onChain,
  runAt,
  type ScriptletMeta,
  type Win,
} from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "set-constant",
  aliases: ["set"],
  trusted: false,
};

/** uBO's predefined values; undefined for a value it does not know. */
function constantOf(win: Win, text: string): { value: unknown } | undefined {
  const named: Record<string, () => unknown> = {
    undefined: () => undefined,
    false: () => false,
    true: () => true,
    null: () => null,
    noopFunc: () => function () {},
    trueFunc: () => () => true,
    falseFunc: () => () => false,
    throwFunc: () => () => {
      throw new win.Error();
    },
    "": () => "",
    "''": () => "",
    "[]": () => new win.Array(),
    emptyArr: () => new win.Array(),
    "{}": () => new win.Object(),
    emptyObj: () => new win.Object(),
  };
  if (Object.hasOwn(named, text)) return { value: named[text]?.() };
  if (/^\d+$/.test(text) && Number(text) <= 0x7fff)
    return { value: Number(text) };
  return undefined;
}

function wrapped(win: Win, value: unknown, as: string | undefined): unknown {
  switch (as) {
    case "function":
      return () => value;
    case "callback":
      return () => () => value;
    case "resolved":
      return win.Promise.resolve(value);
    case "rejected":
      return win.Promise.reject(value);
    default:
      return value;
  }
}

/**
 * Sets a property chain on `window` (`ytInitialPlayerResponse.adPlacements`) to one of
 * uBO's predefined values and keeps it there: the links of the chain the page has not
 * made yet are waited for. The page's writes are ignored, except a write of another
 * type over a value that is neither undefined nor null. A property holding a value of
 * another type is left alone.
 */
export default function setConstant(win: Win, ...args: string[]) {
  const [chain = "", raw = ""] = args;
  const constant = constantOf(win, raw);
  if (chain === "" || !constant) return;
  // An odd argument after the value is the older form of `runAt`.
  const named = namedArgs(args, args.length % 2 === 1 ? 3 : 2);
  const when = args.length % 2 === 1 ? args[2] : named.get("runAt");
  const value = wrapped(win, constant.value, named.get("as"));
  const nullish = (v: unknown) => v === undefined || v === null;
  runAt(win, when, () =>
    onChain(win, chain, (owner, property) => {
      const current = owner[property];
      if (
        !nullish(current) &&
        !nullish(value) &&
        typeof current !== typeof value
      )
        return;
      const descriptor = Object.getOwnPropertyDescriptor(owner, property);
      if (descriptor && !descriptor.configurable) return;
      let held = value;
      Object.defineProperty(owner, property, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get: () => held,
        set(next: unknown) {
          if (!nullish(value) && !nullish(next) && typeof next !== typeof value)
            held = next;
        },
      });
    }),
  );
}
