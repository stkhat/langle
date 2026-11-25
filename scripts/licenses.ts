import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

/**
 * Licenses of packages whose npm package has no license file, taken from the package's
 * repository: `scripts/package-licenses/<package name>.txt`.
 */
const FALLBACK_DIR = new URL("./package-licenses/", import.meta.url).pathname;

/**
 * A package's license files: LICENSE, LICENCE, COPYING or NOTICE, maybe with a suffix
 * (LICENSE-MIT) and a text extension (.md, .txt).
 */
const LICENSE_FILE =
  /^(licen[cs]e|copying|notice)(-[a-z0-9]+)?(\.(md|markdown|txt|rst))?$/i;

/** Style sheets are taken out of the scripts, so their modules render no script code. */
const STYLE = /\.(css|scss|sass|less|styl|stylus|pcss|postcss|sss)$/i;

/** `foo` or `@scope/foo`: the package a bare specifier (`foo/a/b`) imports from. */
function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

function installed(root: string, name: string): string | undefined {
  const dir = join(root, "node_modules", name);
  return existsSync(join(dir, "package.json")) ? dir : undefined;
}

/**
 * The directory of the package a module of the build comes from, or undefined for the
 * project's own code. A file under `node_modules` belongs to the package right after the
 * last `node_modules`. A virtual module (`\0…`) is named after the package that makes
 * it: `\0vite/modulepreload-polyfill.js` is Vite's, `\0virtual:wxt-plugins?…` WXT's and
 * `\0virtual:langle-notices` the project's own. Throws for a module it cannot place, so
 * no code reaches the build without its package being known.
 */
export function packageDirOf(id: string, root: string): string | undefined {
  const own = (
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      name: string;
    }
  ).name;
  let path = id.split("?")[0]!;
  if (path.startsWith("\0")) {
    path = path.slice(1);
    if (!isAbsolute(path)) {
      const spec = path.replace(/^virtual:/, "");
      for (const name of [packageName(spec), spec.split(/[-/]/)[0]!]) {
        if (name === own) return undefined;
        const dir = installed(root, name);
        if (dir) return dir;
      }
      throw new Error(
        `No package makes the virtual module ${JSON.stringify(id)}`,
      );
    }
  }
  const file = resolve(root, path);
  const parts = file.split(sep);
  const last = parts.lastIndexOf("node_modules");
  if (last >= 0) {
    const scoped = parts[last + 1]?.startsWith("@");
    return parts.slice(0, last + (scoped ? 3 : 2)).join(sep);
  }
  if (!relative(root, file).startsWith("..")) return undefined;
  throw new Error(
    `The module ${file} is neither in the project nor in a package`,
  );
}

interface OutputFile {
  type: "chunk" | "asset";
  modules?: Record<string, { renderedLength: number }>;
  originalFileNames?: readonly string[];
}

/**
 * The modules and files of one build's output that ship something: modules whose code
 * is in a script (tree-shaken ones render none), style sheets (extracted into the
 * build's CSS), and the files an asset was copied from (fonts).
 */
export function shippedSources(files: Iterable<OutputFile>): string[] {
  const ids: string[] = [];
  for (const file of files) {
    for (const [id, module] of Object.entries(file.modules ?? {}))
      if (module.renderedLength > 0 || STYLE.test(id.split("?")[0]!))
        ids.push(id);
    ids.push(...(file.originalFileNames ?? []));
  }
  return ids;
}

interface PackageJson {
  name: string;
  version: string;
  license?: string;
}

/** A package's license texts: its own license files, else the fallback, else none. */
export function licenseTexts(
  dir: string,
  fallbackDir = FALLBACK_DIR,
): string[] {
  const own = readdirSync(dir)
    .filter((file) => LICENSE_FILE.test(file))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => readFileSync(join(dir, file), "utf8").trim());
  if (own.length > 0) return own;
  const { name } = JSON.parse(
    readFileSync(join(dir, "package.json"), "utf8"),
  ) as PackageJson;
  const fallback = join(fallbackDir, `${name}.txt`);
  return existsSync(fallback) ? [readFileSync(fallback, "utf8").trim()] : [];
}

const RULE = "=".repeat(72);

/** Code a build ships that is not an npm package, with its license text. */
export interface ShippedCode {
  name: string;
  version: string;
  license: string;
  text: string;
}

/**
 * The parts of the Bergamot engine the Android app ships in its APK (Firefox 145's
 * WebAssembly build of bergamot-translator v0.6.0, scripts/mobile/bergamot.ts), each
 * with the license of its repository: `scripts/engine-licenses/<name>.txt`.
 */
const ENGINE_PARTS = [
  ["bergamot-translator", "MPL-2.0"],
  ["marian", "MIT"],
  ["intgemm", "MIT"],
  ["sentencepiece", "Apache-2.0"],
  ["ssplit-cpp", "Apache-2.0"],
  ["pcre2", "BSD-3-Clause WITH PCRE2-exception"],
  ["yaml-cpp", "MIT"],
  ["spdlog", "MIT"],
  ["zlib", "Zlib"],
] as const;

const ENGINE_LICENSES_DIR = new URL("./engine-licenses/", import.meta.url)
  .pathname;

export function engineLicenses(dir = ENGINE_LICENSES_DIR): ShippedCode[] {
  return ENGINE_PARTS.map(([name, license]) => ({
    name,
    version:
      name === "bergamot-translator" ? "0.6.0" : "(bergamot-translator 0.6.0)",
    license,
    text: readFileSync(join(dir, `${name}.txt`), "utf8").trim(),
  }));
}

/**
 * The licenses file: every package, by name, with its version, its license as its
 * package.json declares it and the full text of its license files. Throws for a package
 * with no license text, so a new dependency cannot ship without one.
 */
export function licensesFile(
  dirs: Iterable<string>,
  fallbackDir?: string,
  code: ShippedCode[] = [],
): string {
  const packages = [
    ...[...new Set(dirs)].map((dir) => ({
      json: JSON.parse(
        readFileSync(join(dir, "package.json"), "utf8"),
      ) as PackageJson,
      texts: licenseTexts(dir, fallbackDir),
    })),
    ...code.map(({ name, version, license, text }) => ({
      json: { name, version, license },
      texts: [text],
    })),
  ];
  const missing = packages.filter((p) => p.texts.length === 0);
  if (missing.length > 0)
    throw new Error(
      `No license text for ${missing.map((p) => p.json.name).join(", ")}: add the license of the package's repository to scripts/package-licenses/<name>.txt`,
    );
  packages.sort((a, b) => a.json.name.localeCompare(b.json.name));
  const sections = packages.map(
    ({ json, texts }) =>
      `${RULE}\n${json.name} ${json.version}${json.license ? ` (${json.license})` : ""}\n${RULE}\n\n${texts.join("\n\n")}\n`,
  );
  return [
    "Third-party licenses",
    "",
    "Langle includes the code or fonts of the packages below. Each one is listed with its version, its license and the full text of its license files.",
    "The language data Langle downloads lists its sources and licenses on its own page (Settings, About, Licenses).",
    "",
    ...sections,
  ].join("\n");
}

/**
 * Finds the packages every build of the extension ships, by reading what each Vite
 * build's output holds (`plugin`, one per WXT build), and writes their licenses
 * (`file`) once all builds are done.
 */
export function bundledLicenses(root: string) {
  const dirs = new Set<string>();
  return {
    reset: () => dirs.clear(),
    plugin: (): Plugin => ({
      name: "langle-licenses",
      apply: "build",
      generateBundle(_options, bundle) {
        for (const id of shippedSources(Object.values(bundle))) {
          const dir = packageDirOf(id, root);
          if (dir) dirs.add(dir);
        }
      },
    }),
    /** `app`: the phone app's build, which also ships the translation engine. */
    file: ({ app = false } = {}) =>
      licensesFile(dirs, undefined, app ? engineLicenses() : []),
  };
}
