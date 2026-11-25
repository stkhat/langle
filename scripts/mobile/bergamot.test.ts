import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ENGINE_FILES,
  ensureEngine,
  missingFiles,
  problemOf,
  type EngineFile,
} from "./bergamot.ts";

const bytes = (text: string) => new TextEncoder().encode(text);
const pin = (name: string, text: string): EngineFile => ({
  name,
  url: `https://example.org/${name}`,
  size: bytes(text).length,
  sha256: createHash("sha256").update(text).digest("hex"),
});
const contents = { "engine.wasm": "wasm bytes", "glue.js": "glue" };
const files = Object.entries(contents).map(([name, text]) => pin(name, text));
const fetchPinned = async (file: EngineFile) =>
  bytes(contents[file.name as keyof typeof contents]);

let dir: string;
beforeEach(() => {
  dir = join(mkdtempSync(join(tmpdir(), "bergamot-")), "engine");
});
afterEach(() => rmSync(join(dir, ".."), { recursive: true, force: true }));

describe("problemOf", () => {
  it("accepts the pinned bytes and names a wrong size or SHA-256", () => {
    expect(problemOf(files[0]!, bytes("wasm bytes"))).toBeUndefined();
    expect(problemOf(files[0]!, bytes("wasm"))).toBe(
      "engine.wasm: 4 bytes, pinned 10",
    );
    expect(problemOf(files[0]!, bytes("wasm bytez"))).toMatch(
      /^engine\.wasm: SHA-256 [0-9a-f]{64}, pinned /,
    );
  });
});

describe("ensureEngine", () => {
  it("writes the missing files, then keeps them", async () => {
    expect(missingFiles(dir, files)).toEqual(files);
    expect(await ensureEngine(dir, fetchPinned, files)).toEqual([
      "engine.wasm",
      "glue.js",
    ]);
    expect(readFileSync(join(dir, "glue.js"), "utf8")).toBe("glue");
    expect(missingFiles(dir, files)).toEqual([]);
    const fetched: string[] = [];
    expect(
      await ensureEngine(
        dir,
        async (file) => {
          fetched.push(file.name);
          return fetchPinned(file);
        },
        files,
      ),
    ).toEqual([]);
    expect(fetched).toEqual([]);
  });

  it("fetches again a file whose bytes changed", async () => {
    await ensureEngine(dir, fetchPinned, files);
    writeFileSync(join(dir, "glue.js"), "other");
    expect(missingFiles(dir, files).map((file) => file.name)).toEqual([
      "glue.js",
    ]);
    expect(await ensureEngine(dir, fetchPinned, files)).toEqual(["glue.js"]);
  });

  it("refuses a download that is not the pinned file, and writes nothing of it", async () => {
    await expect(
      ensureEngine(
        dir,
        async (file) =>
          file.name === "glue.js" ? bytes("evil") : fetchPinned(file),
        files,
      ),
    ).rejects.toThrow(
      /glue\.js: SHA-256 .* \(from https:\/\/example\.org\/glue\.js\)/,
    );
    expect(readdirSync(dir)).toEqual(["engine.wasm"]);
    expect(existsSync(join(dir, "glue.js"))).toBe(false);
  });
});

describe("ENGINE_FILES", () => {
  it("pins the WebAssembly build, its glue and their licence, each by size and SHA-256", () => {
    expect(ENGINE_FILES.map((file) => file.name)).toEqual([
      "bergamot-translator.wasm",
      "bergamot-translator.js",
      "LICENSE",
    ]);
    for (const file of ENGINE_FILES) {
      expect(file.url).toMatch(/^https:\/\//);
      expect(file.size).toBeGreaterThan(0);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // The glue comes from a fixed commit, never a branch.
    for (const file of ENGINE_FILES.slice(1))
      expect(file.url).toMatch(/\/firefox\/[0-9a-f]{40}\//);
  });
});
