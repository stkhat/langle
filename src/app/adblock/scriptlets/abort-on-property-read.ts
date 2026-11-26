import {
  abortError,
  onChain,
  type ScriptletMeta,
  type Win,
} from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "abort-on-property-read",
  aliases: ["aopr"],
  trusted: false,
};

/** Throws in the script that reads a property chain on `window`; writes are ignored. */
export default function abortOnPropertyRead(win: Win, chain = "") {
  if (chain === "") return;
  onChain(win, chain, (owner, property) => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, property);
    if (descriptor && !descriptor.configurable) return;
    Object.defineProperty(owner, property, {
      configurable: true,
      get() {
        throw abortError(win);
      },
      set() {},
    });
  });
}
