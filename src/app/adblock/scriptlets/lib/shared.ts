// What the scriptlets share (docs/specs/mobile-app.md "M6: ad blocking" › "Scriptlets").
// Each scriptlet is built into a resource of its own with what it imports from here
// (scripts/adblock-resources.ts), so nothing here may keep state across scriptlets.

/** What a scriptlet's file says about itself, for the resources file. */
export interface ScriptletMeta {
  /** uBO's name, without `.js`. */
  readonly name: string;
  /** uBO's other names for it, without `.js`. */
  readonly aliases: readonly string[];
  /** Only lists trusted with uBO's trusted scriptlets may use it (`trusted-…`). */
  readonly trusted: boolean;
}

/** The window a scriptlet patches: the page's own in the app, an iframe's in tests. */
export type Win = Window & typeof globalThis;

/**
 * A test of a string: `/re/flags` is a regular expression, anything else a part the
 * string must contain. An empty pattern matches everything; an invalid regular
 * expression matches nothing.
 */
export function textTest(pattern: string): (text: string) => boolean {
  if (pattern === "" || pattern === "*") return () => true;
  const regex = regexOf(pattern);
  if (regex)
    return (text) => {
      // A `g` or `y` regex would go on from its last match.
      regex.lastIndex = 0;
      return regex.test(text);
    };
  if (regex === null) return () => false;
  return (text) => text.includes(pattern);
}

/**
 * `pattern` as a regular expression when it is written as one (`/re/flags`): the
 * regex, `null` when it does not compile, `undefined` when it is plain text.
 */
export function regexOf(pattern: string): RegExp | null | undefined {
  const match = /^\/(.+)\/([dgimsuvy]*)$/s.exec(pattern);
  if (!match) return undefined;
  try {
    return new RegExp(match[1] ?? "", match[2]);
  } catch {
    return null;
  }
}

/** `pattern` as a regular expression: plain text is matched as it is, everywhere. */
export function replaceRegex(pattern: string): RegExp | null {
  const regex = regexOf(pattern);
  if (regex !== undefined) return regex;
  return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
}

/** A test that `!` in front of the pattern turns around. */
export function negatableTest(pattern: string): (text: string) => boolean {
  if (pattern.startsWith("!")) {
    const test = textTest(pattern.slice(1));
    return (text) => !test(text);
  }
  return textTest(pattern);
}

/** The named arguments after the positional ones: `name, value` pairs. */
export function namedArgs(
  args: readonly string[],
  from: number,
): Map<string, string> {
  const named = new Map<string, string>();
  for (let i = from; i + 1 < args.length; i += 2)
    named.set(args[i] ?? "", args[i + 1] ?? "");
  return named;
}

/** Runs `run` now, or when the document reaches the stage `runAt` names (uBO's values). */
export function runAt(win: Win, when: string | undefined, run: () => void) {
  const stage = {
    "": 1,
    loading: 1,
    "1": 1,
    interactive: 2,
    end: 2,
    "2": 2,
    complete: 3,
    idle: 3,
    "3": 3,
  }[when ?? ""];
  const reached = () =>
    ({ loading: 1, interactive: 2, complete: 3 })[win.document.readyState];
  if (stage === undefined || reached() >= stage) {
    run();
    return;
  }
  const listener = () => {
    if (reached() < stage) return;
    win.document.removeEventListener("readystatechange", listener);
    run();
  };
  win.document.addEventListener("readystatechange", listener);
}

/** The error a scriptlet throws to stop a page's script, kept out of the console. */
export function abortError(win: Win): Error {
  const marker = "langle-scriptlet-abort";
  const flagged = win as Win & { [marker]?: true };
  if (!flagged[marker]) {
    flagged[marker] = true;
    win.addEventListener("error", (event) => {
      if (String(event.message).includes(marker)) event.preventDefault();
    });
  }
  return new win.ReferenceError(marker);
}

/**
 * Calls `onOwner(owner, property)` once the object a property chain (`a.b.c`) ends in
 * exists on `win`: at once when it does, else when the page sets the missing links.
 */
export function onChain(
  win: Win,
  chain: string,
  onOwner: (owner: Record<string, unknown>, property: string) => void,
) {
  const walk = (owner: Record<string, unknown>, parts: string[]) => {
    const [first = "", ...rest] = parts;
    if (rest.length === 0) {
      onOwner(owner, first);
      return;
    }
    const current = owner[first];
    if (isObject(current)) {
      walk(current, rest);
      return;
    }
    // Wait for the link: keep the value the page sets and walk into it. Another
    // scriptlet's wait on the same link goes on too.
    let value = current;
    const descriptor = Object.getOwnPropertyDescriptor(owner, first);
    if (descriptor && !descriptor.configurable) return;
    Object.defineProperty(owner, first, {
      configurable: true,
      enumerable: true,
      get: () => (descriptor?.get ? descriptor.get.call(owner) : value),
      set(next: unknown) {
        descriptor?.set?.call(owner, next);
        value = next;
        if (isObject(next)) walk(next, rest);
      },
    });
  };
  walk(win as unknown as Record<string, unknown>, chain.split("."));
}

/** The value at a property chain on `win`, or undefined. */
function chainValue(win: Win, chain: string): unknown {
  let value: unknown = win;
  for (const part of chain.split(".")) {
    if (!isObject(value)) return undefined;
    value = value[part];
  }
  return value;
}

/**
 * Wraps the function at a property chain (`JSON.parse`, `Node.prototype.appendChild`)
 * in `wrap`, which gets the original, `this` and the arguments. Returns false when the
 * chain names no function.
 */
export function wrapMethod(
  win: Win,
  chain: string,
  wrap: (
    original: (...args: unknown[]) => unknown,
    self: unknown,
    args: unknown[],
  ) => unknown,
): boolean {
  const dot = chain.lastIndexOf(".");
  const owner = dot < 0 ? win : chainValue(win, chain.slice(0, dot));
  const name = chain.slice(dot + 1);
  if (!isObject(owner)) return false;
  const original = owner[name];
  if (typeof original !== "function") return false;
  owner[name] = new Proxy(original, {
    apply: (target, self, args: unknown[]) =>
      wrap(target as (...args: unknown[]) => unknown, self, args),
  });
  return true;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  );
}

/** A function's source as uBO matches it (`String(fn)`), a listener object's handleEvent. */
export function sourceOf(value: unknown): string {
  try {
    if (isObject(value) && typeof value.handleEvent === "function")
      return String(value.handleEvent);
    return String(value);
  } catch {
    return "";
  }
}

/** Whether the current call's stack trace matches `needle` (`!` turns it around). */
export function stackMatches(win: Win, needle: string): boolean {
  if (needle === "") return true;
  const stack = new win.Error().stack ?? "";
  return negatableTest(needle)(stack.split("\n").slice(2).join("\t"));
}
