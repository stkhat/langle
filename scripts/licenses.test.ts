import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  engineLicenses,
  licensesFile,
  licenseTexts,
  packageDirOf,
  shippedSources,
} from "./licenses.ts";

const root = join(import.meta.dirname, "..");
const modules = join(root, "node_modules");
const fallbackDir = join(import.meta.dirname, "package-licenses");

/** A package with a package.json and the given files, in a folder of its own. */
function fakePackage(name: string, files: Record<string, string> = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), "langle-licenses-")), name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name, version: "1.0.0", license: "MIT" }),
  );
  for (const [file, text] of Object.entries(files))
    writeFileSync(join(dir, file), text);
  return dir;
}

describe("packageDirOf", () => {
  it("places a file under node_modules in the package after the last node_modules", () => {
    expect(packageDirOf(join(modules, "preact/dist/preact.mjs"), root)).toBe(
      join(modules, "preact"),
    );
    expect(
      packageDirOf(join(modules, "@fontsource/nunito/files/a.woff2?url"), root),
    ).toBe(join(modules, "@fontsource/nunito"));
    expect(
      packageDirOf(join(modules, "wxt/node_modules/defu/dist/defu.mjs"), root),
    ).toBe(join(modules, "wxt/node_modules/defu"));
    expect(
      packageDirOf(
        "node_modules/@fontsource-variable/inter/files/a.woff2",
        root,
      ),
    ).toBe(join(modules, "@fontsource-variable/inter"));
  });

  it("leaves the project's own files out", () => {
    expect(packageDirOf(join(root, "src/ui/styles.ts"), root)).toBeUndefined();
    expect(
      packageDirOf("src/entrypoints/popup/index.html", root),
    ).toBeUndefined();
  });

  it("places a virtual module in the package it is named after", () => {
    expect(packageDirOf("\0rolldown/runtime.js", root)).toBe(
      join(modules, "rolldown"),
    );
    expect(packageDirOf("\0vite/modulepreload-polyfill.js", root)).toBe(
      join(modules, "vite"),
    );
    expect(packageDirOf("\0virtual:wxt-plugins?entrypoint=popup", root)).toBe(
      join(modules, "wxt"),
    );
    expect(packageDirOf("\0virtual:langle-notices", root)).toBeUndefined();
  });

  it("refuses a module it cannot place", () => {
    expect(() => packageDirOf("\0virtual:nobody-made-this", root)).toThrow(
      /virtual module/,
    );
    expect(() => packageDirOf(join(tmpdir(), "elsewhere.js"), root)).toThrow(
      /neither in the project nor in a package/,
    );
  });
});

describe("shippedSources", () => {
  it("takes the modules that render code, style sheets and the files assets come from", () => {
    expect(
      shippedSources([
        {
          type: "chunk",
          modules: {
            "/a/node_modules/preact/dist/preact.mjs": { renderedLength: 10 },
            "/a/node_modules/wxt/dist/utils/storage.mjs": { renderedLength: 0 },
            "/a/node_modules/@fontsource/nunito/latin-600.css": {
              renderedLength: 0,
            },
          },
        },
        {
          type: "asset",
          originalFileNames: ["node_modules/@fontsource/nunito/files/a.woff2"],
        },
        { type: "asset" },
      ]),
    ).toEqual([
      "/a/node_modules/preact/dist/preact.mjs",
      "/a/node_modules/@fontsource/nunito/latin-600.css",
      "node_modules/@fontsource/nunito/files/a.woff2",
    ]);
  });
});

describe("licenseTexts", () => {
  it("reads every license file of the package", () => {
    const texts = licenseTexts(join(modules, "dexie"));
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain("Apache License");
    expect(texts[1]).toContain("Copyright (c) 2014-2017 David Fahlander");
  });

  it("falls back to the repository's license for a package that has no file", () => {
    expect(licenseTexts(join(modules, "wxt"))[0]).toMatch(
      /^MIT License\n\nCopyright \(c\) \d{4} Aaron/,
    );
  });

  // A fallback for a package that ships its own license file, or for one no longer
  // installed, would be a stale copy.
  it("keeps fallbacks only for installed packages without a license file", () => {
    const names = readdirSync(fallbackDir, {
      recursive: true,
      encoding: "utf8",
    })
      .filter((file) => file.endsWith(".txt"))
      .map((file) => file.replace(/\.txt$/, ""));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const dir = join(modules, name);
      expect(readdirSync(dir), name).not.toContainEqual(
        expect.stringMatching(/^(licen[cs]e|copying|notice)/i),
      );
    }
  });
});

describe("licensesFile", () => {
  it("lists each package with its version, license and license texts", () => {
    const file = licensesFile([
      join(modules, "preact"),
      join(modules, "@fontsource/nunito"),
      join(modules, "@fontsource-variable/inter"),
      join(modules, "preact"),
    ]);
    expect(file.match(/^preact \d+\.\d+\.\d+ \(MIT\)$/gm)).toHaveLength(1);
    expect(file).toMatch(/^@fontsource\/nunito \S+ \(OFL-1\.1\)$/m);
    // The fonts carry their copyright lines and the full SIL Open Font License.
    expect(file).toContain("Copyright 2014 The Nunito Project Authors");
    expect(file).toContain("Copyright 2016 The Inter Project Authors");
    expect(file.match(/SIL OPEN FONT LICENSE Version 1\.1/g)).toHaveLength(2);
    expect(file).toContain("TERMINATION");
    expect(file.indexOf("@fontsource-variable/inter")).toBeLessThan(
      file.indexOf("preact "),
    );
  });

  it("lists the phone app's translation engine, each part with its repository's license", () => {
    const file = licensesFile(
      [join(modules, "preact")],
      undefined,
      engineLicenses(),
    );
    expect(file).toMatch(/^bergamot-translator 0\.6\.0 \(MPL-2\.0\)$/m);
    expect(file).toMatch(/^marian \(bergamot-translator 0\.6\.0\) \(MIT\)$/m);
    for (const part of [
      "intgemm",
      "sentencepiece",
      "ssplit-cpp",
      "pcre2",
      "yaml-cpp",
      "spdlog",
      "zlib",
    ])
      expect(file).toMatch(new RegExp(`^${part} `, "m"));
    expect(file).toContain("Mozilla Public License Version 2.0");
    expect(file).toContain("Jean-loup Gailly and Mark Adler");
  });

  it("refuses a package with no license text", () => {
    const dir = fakePackage("unlicensed-package", { "README.md": "Hi" });
    expect(() =>
      licensesFile([join(modules, "preact"), dir], fallbackDir),
    ).toThrow(/No license text for unlicensed-package/);
  });

  it("takes LICENSE, LICENCE, COPYING and NOTICE files, not code named like them", () => {
    const dir = fakePackage("licensed-package", {
      "LICENSE-MIT.txt": "MIT text",
      "notice.md": "Notice text",
      "license-checker.js": "code",
    });
    expect(licenseTexts(dir, fallbackDir)).toEqual(["MIT text", "Notice text"]);
  });
});
