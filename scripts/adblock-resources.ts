// The phone app's scriptlets as adblock-rust resources (docs/specs/mobile-app.md "M6: ad
// blocking" › "Scriptlets"): each file of src/app/adblock/scriptlets/ is bundled on
// its own with what it imports, and written into the langle-app output as
// adblock/resources.json, which the shells hand to the engine.
//
// The format is adblock-rust's `Resource` (src/resources/mod.rs and
// resource_storage.rs of adblock-rust 0.13.6, read on its master on 2026-11-26):
// `{ name, aliases, kind: { mime: "application/javascript" }, content: <base64>,
// permission? }`. A content that starts `function <name>(` is a function-style
// scriptlet: for each `+js(name, a, b)` rule the engine adds the function once and the
// call `<name>("a", "b")`, each call in its own try/catch, all in one script; the
// shells run that script inside a function of their own, so the functions stay off
// the page's globals.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { rolldown } from "rolldown";
import type { ScriptletMeta } from "../src/app/adblock/scriptlets/lib/shared.ts";

const SCRIPTLETS_DIR = join(
  import.meta.dirname,
  "../src/app/adblock/scriptlets",
);

/** Where the resources go in the langle-app output. */
export const RESOURCES_FILE = "adblock/resources.json";

/**
 * The permission bit of uBO's trusted scriptlets: the shells parse only the lists that
 * mobile/protocol/filter-lists.json marks `trusted` with it, so no other list can use
 * them (adblock-rust's `PermissionMask`).
 */
export const TRUSTED_PERMISSION = 1;

export interface AdblockResource {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly kind: { readonly mime: "application/javascript" };
  readonly content: string;
  readonly permission?: number;
}

/** The scriptlets' files, one scriptlet each. */
export function scriptletFiles(): string[] {
  return readdirSync(SCRIPTLETS_DIR)
    .filter((file) => file.endsWith(".ts") && !file.includes(".test."))
    .sort();
}

const ENTRY = "\0langle-scriptlet";

/** The scriptlet in `file`, with what it imports, as one minified function. */
export async function scriptletResource(
  file: string,
): Promise<AdblockResource> {
  const path = join(SCRIPTLETS_DIR, file);
  const { meta } = (await import(pathToFileURL(path).href)) as {
    meta: ScriptletMeta;
  };
  const bundle = await rolldown({
    input: ENTRY,
    platform: "browser",
    plugins: [
      {
        name: "langle-scriptlet-entry",
        resolveId: (id) => (id === ENTRY ? id : null),
        load: (id) =>
          id === ENTRY
            ? `export { default } from ${JSON.stringify(path)};`
            : null,
      },
    ],
  });
  const { output } = await bundle.generate({
    format: "iife",
    name: "scriptlet",
    exports: "default",
    minify: true,
  });
  await bundle.close();
  const code = output[0].code;
  const fn = `langle_${meta.name.replace(/\W/g, "_")}`;
  const content = `function ${fn}() {\n${code}\nreturn scriptlet(window, ...arguments);\n}\n`;
  return {
    name: `${meta.name}.js`,
    aliases: meta.aliases.map((alias) => `${alias}.js`),
    kind: { mime: "application/javascript" },
    content: Buffer.from(content).toString("base64"),
    ...(meta.trusted && { permission: TRUSTED_PERMISSION }),
  };
}

/** adblock/resources.json's text. */
export async function scriptletResources(): Promise<string> {
  const resources = await Promise.all(scriptletFiles().map(scriptletResource));
  return `${JSON.stringify(resources, null, 1)}\n`;
}
