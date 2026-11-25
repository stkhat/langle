import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModelPin } from "./mt-models.ts";
import {
  gemmPrecision,
  joinParts,
  modelPackFiles,
  modelPackName,
  MT_MODELS,
  PART_BYTES,
  releaseFor,
  splitFile,
  writeModelPack,
} from "./mt-models.ts";
import { listPackFiles } from "./publish.ts";

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const bytesOf = (length: number, seed = 1) =>
  Uint8Array.from({ length }, (_, i) => (i * 31 + seed) % 251);

describe("splitFile and joinParts", () => {
  it("keeps a file that fits in one part under its own name", () => {
    const bytes = bytesOf(10);
    expect(splitFile("lex.bin", bytes, 10)).toEqual([
      { path: "lex.bin", bytes },
    ]);
  });
  it("splits a larger file into numbered parts of at most the part size, in order", () => {
    const bytes = bytesOf(25);
    const parts = splitFile("model.bin", bytes, 10);
    expect(parts.map((part) => [part.path, part.bytes.length])).toEqual([
      ["model.bin.1", 10],
      ["model.bin.2", 10],
      ["model.bin.3", 5],
    ]);
    expect(joinParts(parts.map((part) => part.bytes))).toEqual(
      Buffer.from(bytes),
    );
  });
  it("splits a file of exactly n parts into n full parts", () => {
    const parts = splitFile("model.bin", bytesOf(20), 10);
    expect(parts.map((part) => part.bytes.length)).toEqual([10, 10]);
  });
  it("keeps every part below jsDelivr's 50 MB per-file limit", () => {
    expect(PART_BYTES).toBeLessThan(50_000_000);
  });
});

describe("gemmPrecision", () => {
  it("is Firefox's choice by the model's file name", () => {
    expect(gemmPrecision("model.enja.intgemm.alphas.bin")).toBe(
      "int8shiftAlphaAll",
    );
    expect(gemmPrecision("model.enes.intgemm8.bin")).toBe("int8shiftAll");
  });
});

describe("writeModelPack", () => {
  let dir: string;
  const model = bytesOf(25, 1);
  const lex = bytesOf(7, 2);
  const src = bytesOf(4, 3);
  const trg = bytesOf(5, 4);
  const file = (name: string, bytes: Uint8Array) => ({
    name,
    size: bytes.length,
    sha256: sha256(bytes),
  });
  const pin: ModelPin = {
    from: "en",
    to: "xx",
    architecture: "base-memory",
    dir: "models/en-xx/run/exported",
    files: {
      model: file("model.enxx.intgemm.alphas.bin", model),
      lex: file("lex.50.50.enxx.s2t.bin", lex),
      srcvocab: file("srcvocab.enxx.spm", src),
      trgvocab: file("trgvocab.enxx.spm", trg),
    },
  };
  const contents = new Map([
    [pin.files.model!.name, model],
    [pin.files.lex!.name, lex],
    [pin.files.srcvocab!.name, src],
    [pin.files.trgvocab!.name, trg],
  ]);
  const read = (f: { name: string }) => contents.get(f.name)!;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mt-models-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("writes the parts and a manifest naming each file's parts in order", () => {
    const manifest = writeModelPack(pin, read, join(dir, "mt-en-xx"), 10);
    expect(manifest).toEqual({
      v: 1,
      from: "en",
      to: "xx",
      gemmPrecision: "int8shiftAlphaAll",
      files: {
        model: {
          size: 25,
          sha256: sha256(model),
          parts: [
            {
              path: "model.enxx.intgemm.alphas.bin.1",
              size: 10,
              sha256: sha256(model.subarray(0, 10)),
            },
            {
              path: "model.enxx.intgemm.alphas.bin.2",
              size: 10,
              sha256: sha256(model.subarray(10, 20)),
            },
            {
              path: "model.enxx.intgemm.alphas.bin.3",
              size: 5,
              sha256: sha256(model.subarray(20)),
            },
          ],
        },
        lex: {
          size: 7,
          sha256: sha256(lex),
          parts: [
            { path: "lex.50.50.enxx.s2t.bin", size: 7, sha256: sha256(lex) },
          ],
        },
        srcvocab: expect.objectContaining({ size: 4 }),
        trgvocab: expect.objectContaining({ size: 5 }),
      },
    });
    const out = join(dir, "mt-en-xx");
    expect(
      JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")),
    ).toEqual(manifest);
    const joined = joinParts(
      manifest.files.model.parts.map((part) =>
        readFileSync(join(out, part.path)),
      ),
    );
    expect(sha256(joined)).toBe(manifest.files.model.sha256);
  });

  it("lists the same files for the lock from the manifest alone as from the folder", () => {
    const out = join(dir, "mt-en-xx");
    writeModelPack(pin, read, out, 10);
    const fromFolder = listPackFiles(out);
    expect(modelPackFiles(out)).toEqual(fromFolder);
    expect(fromFolder.map((f) => f.path)).toContain("manifest.json");
    for (const f of fromFolder)
      if (f.path !== "manifest.json") rmSync(join(out, f.path));
    expect(modelPackFiles(out)).toEqual(fromFolder);
  });

  it("refuses a file that is not the pinned one, and writes nothing of it", () => {
    const out = join(dir, "mt-en-xx");
    const wrong = (f: { name: string }) =>
      f.name === pin.files.lex!.name ? bytesOf(7, 9) : read(f);
    expect(() => writeModelPack(pin, wrong, out, 10)).toThrow(
      /lex\.50\.50\.enxx\.s2t\.bin: SHA-256/,
    );
    expect(existsSync(join(out, "manifest.json"))).toBe(false);
    const short = (f: { name: string }) =>
      f.name === pin.files.lex!.name ? bytesOf(6, 2) : read(f);
    expect(() => writeModelPack(pin, short, out, 10)).toThrow(
      /6 bytes, pinned 7/,
    );
  });

  it("refuses a pin without a model, a lex or its vocabularies", () => {
    const files = { ...pin.files };
    delete files.trgvocab;
    expect(() =>
      writeModelPack({ ...pin, files }, read, join(dir, "x"), 10),
    ).toThrow(/needs a model, a lex and a vocab/);
  });
});

describe("releaseFor", () => {
  const entry = (architecture: string, releaseStatus: string | null) => ({
    architecture,
    releaseStatus,
    files: {},
  });
  it("takes the registry's Android release, else its release", () => {
    expect(
      releaseFor([
        entry("base", "Release Desktop"),
        entry("base-memory", "Release Android"),
        entry("tiny", null),
      ])?.architecture,
    ).toBe("base-memory");
    expect(
      releaseFor([entry("base", null), entry("base-memory", "Release")])
        ?.architecture,
    ).toBe("base-memory");
    expect(releaseFor([entry("base", null)])).toBeUndefined();
  });
});

describe("MT_MODELS", () => {
  it("pins each direction once, each with a model, a lex and its vocabularies", () => {
    const names = MT_MODELS.map(modelPackName);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("mt-en-ja");
    for (const pin of MT_MODELS) {
      expect(pin.files.model?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(pin.files.lex?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(
        pin.files.vocab ?? (pin.files.srcvocab && pin.files.trgvocab),
      ).toBeTruthy();
      expect(pin.dir).toMatch(
        new RegExp(`^models/${pin.from}-${pin.to}/[^/]+/exported$`),
      );
    }
  });
});
