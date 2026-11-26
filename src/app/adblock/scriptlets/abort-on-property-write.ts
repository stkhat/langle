import {
  abortError,
  onChain,
  type ScriptletMeta,
  type Win,
} from "./lib/shared";

export const meta: ScriptletMeta = {
  name: "abort-on-property-write",
  aliases: ["aopw"],
  trusted: false,
};

/** Throws in the script that writes a property chain on `window`; reads still work. */
export default function abortOnPropertyWrite(win: Win, chain = "") {
  if (chain === "") return;
  onChain(win, chain, (owner, property) => {
    const descriptor = Object.getOwnPropertyDescriptor(owner, property);
    if (descriptor && !descriptor.configurable) return;
    const value = owner[property];
    Object.defineProperty(owner, property, {
      configurable: true,
      get: () => value,
      set() {
        throw abortError(win);
      },
    });
  });
}
