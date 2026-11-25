import { describe, expect, test } from "vitest";
import { answer, configText, createEngine, type Bergamot } from "./engine";

/** A fake Bergamot module: records what the engine builds, "translates" by tagging text. */
function fakeBergamot() {
  const made: {
    memory: { size: number; alignment: number; bytes: Uint8Array }[];
    models: unknown[][];
    deleted: number;
  } = {
    memory: [],
    models: [],
    deleted: 0,
  };
  class Vector<T> {
    items: T[] = [];
    push_back(item: T) {
      this.items.push(item);
    }
    size() {
      return this.items.length;
    }
    get(index: number) {
      return this.items[index]!;
    }
    delete() {
      made.deleted++;
    }
  }
  class AlignedMemory {
    bytes: Uint8Array;
    readonly size: number;
    readonly alignment: number;
    constructor(size: number, alignment: number) {
      this.size = size;
      this.alignment = alignment;
      this.bytes = new Uint8Array(size);
      made.memory.push(this);
    }
    getByteArrayView() {
      return this.bytes;
    }
    delete() {}
  }
  class TranslationModel {
    readonly name: string;
    constructor(...args: unknown[]) {
      made.models.push(args);
      this.name = String(made.models.length);
    }
    delete() {}
  }
  const response = (text: string) => ({ getTranslatedText: () => text });
  class BlockingService {
    readonly options: { cacheSize: number };
    constructor(options: { cacheSize: number }) {
      this.options = options;
    }
    translate(model: TranslationModel, messages: Vector<string>) {
      const out = new Vector<{ getTranslatedText(): string }>();
      out.push_back(response(`${model.name}(${messages.get(0)})`));
      return out;
    }
    translateViaPivoting(
      first: TranslationModel,
      second: TranslationModel,
      messages: Vector<string>,
    ) {
      const out = new Vector<{ getTranslatedText(): string }>();
      out.push_back(
        response(`${second.name}(${first.name}(${messages.get(0)}))`),
      );
      return out;
    }
    delete() {}
  }
  const module = {
    AlignedMemory,
    AlignedMemoryList: Vector,
    TranslationModel,
    BlockingService,
    VectorString: Vector,
    VectorResponseOptions: Vector,
  } as unknown as Bergamot;
  return { module, made };
}

const manifest = (from: string, to: string, files: string[]) =>
  JSON.stringify({
    v: 1,
    from,
    to,
    gemmPrecision: "int8shiftAlphaAll",
    files: Object.fromEntries(
      files.map((type) => [type, { size: 0, sha256: "", parts: [] }]),
    ),
  });

/** The app's files: each model file's bytes are its path. */
function served(packs: Record<string, string>) {
  const fetched: string[] = [];
  const fetchBytes = (path: string) => {
    fetched.push(path);
    const [, , pack, file] = path.split("/");
    const text = file === "manifest.json" ? packs[pack!] : packs[pack!] && path;
    if (!text) return Promise.reject(new Error(`${path}: HTTP 404`));
    return Promise.resolve(new TextEncoder().encode(text).buffer);
  };
  return { fetchBytes, fetched };
}

describe("the Bergamot engine", () => {
  test("loads a pack's files into aligned memory and translates with its model", async () => {
    const { module, made } = fakeBergamot();
    const { fetchBytes, fetched } = served({
      "mt-en-ja": manifest("en", "ja", [
        "model",
        "lex",
        "srcvocab",
        "trgvocab",
      ]),
    });
    let starts = 0;
    const engine = createEngine({
      bergamot: () => {
        starts++;
        return Promise.resolve(module);
      },
      fetchBytes,
    });
    await engine.load("en", "ja", ["mt-en-ja"]);
    expect(fetched).toEqual([
      "/models/mt-en-ja/manifest.json",
      "/models/mt-en-ja/model",
      "/models/mt-en-ja/lex",
      "/models/mt-en-ja/srcvocab",
      "/models/mt-en-ja/trgvocab",
    ]);
    expect(
      made.memory.map((m) => [m.alignment, new TextDecoder().decode(m.bytes)]),
    ).toEqual([
      [256, "/models/mt-en-ja/model"],
      [64, "/models/mt-en-ja/lex"],
      [64, "/models/mt-en-ja/srcvocab"],
      [64, "/models/mt-en-ja/trgvocab"],
    ]);
    const [args] = made.models;
    expect(args!.slice(0, 3)).toEqual([
      "en",
      "ja",
      configText("int8shiftAlphaAll"),
    ]);
    // Two vocabularies, source first; no quality model.
    expect((args![5] as { items: unknown[] }).items).toEqual([
      made.memory[2],
      made.memory[3],
    ]);
    expect(args![6]).toBeNull();
    await expect(engine.translate("en", "ja", "Hello")).resolves.toBe(
      "1(Hello)",
    );
    // The module starts once; the vectors are freed after each sentence.
    await engine.translate("en", "ja", "Again");
    expect(starts).toBe(1);
    expect(made.deleted).toBe(6);
  });

  test("translates through English with two packs, each loaded once", async () => {
    const { module, made } = fakeBergamot();
    const { fetchBytes } = served({
      "mt-de-en": manifest("de", "en", ["model", "lex", "vocab"]),
      "mt-en-ja": manifest("en", "ja", ["model", "lex", "vocab"]),
    });
    const engine = createEngine({
      bergamot: () => Promise.resolve(module),
      fetchBytes,
    });
    await engine.load("en", "ja", ["mt-en-ja"]);
    await engine.load("de", "ja", ["mt-de-en", "mt-en-ja"]);
    expect(made.models).toHaveLength(2);
    await expect(engine.translate("de", "ja", "Hallo")).resolves.toBe(
      "1(2(Hallo))",
    );
  });

  test("a pair not loaded, a missing file and an unknown file type are errors, answered as such", async () => {
    const { module } = fakeBergamot();
    const { fetchBytes, fetched } = served({
      "mt-en-ja": manifest("en", "ja", [
        "model",
        "lex",
        "vocab",
        "qualityModel",
      ]),
    });
    const engine = createEngine({
      bergamot: () => Promise.resolve(module),
      fetchBytes,
    });
    await expect(
      answer(engine, {
        kind: "translate",
        id: 1,
        from: "en",
        to: "ja",
        text: "Hi",
      }),
    ).resolves.toEqual({
      kind: "translated",
      id: 1,
      text: null,
      error: "en → ja is not loaded",
    });
    await expect(
      answer(engine, {
        kind: "load",
        id: 2,
        from: "en",
        to: "ja",
        packs: ["mt-en-ja"],
      }),
    ).resolves.toEqual({
      kind: "loaded",
      id: 2,
      ok: false,
      error: "mt-en-ja: unknown model file qualityModel",
    });
    await expect(
      answer(engine, {
        kind: "load",
        id: 3,
        from: "en",
        to: "fr",
        packs: ["mt-en-fr"],
      }),
    ).resolves.toMatchObject({
      kind: "loaded",
      id: 3,
      ok: false,
      error: "/models/mt-en-fr/manifest.json: HTTP 404",
    });
    // A pack that failed is fetched again next time.
    fetched.length = 0;
    await answer(engine, {
      kind: "load",
      id: 4,
      from: "en",
      to: "ja",
      packs: ["mt-en-ja"],
    });
    expect(fetched[0]).toBe("/models/mt-en-ja/manifest.json");
  });

  test("a module that does not start fails the load", async () => {
    const engine = createEngine({
      bergamot: () => Promise.reject(new Error("Bergamot aborted: no memory")),
      fetchBytes: () => Promise.reject(new Error("unused")),
    });
    await expect(
      answer(engine, {
        kind: "load",
        id: 1,
        from: "en",
        to: "ja",
        packs: ["mt-en-ja"],
      }),
    ).resolves.toEqual({
      kind: "loaded",
      id: 1,
      ok: false,
      error: "Bergamot aborted: no memory",
    });
  });

  test("the configuration is Firefox's text format", () => {
    const text = configText("int8shiftAll");
    expect(text.startsWith("\n            beam-size: 1\n")).toBe(true);
    expect(text).toContain("            gemm-precision: int8shiftAll\n");
    expect(text.endsWith("alignment: soft\n            ")).toBe(true);
  });
});
