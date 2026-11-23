// Mozilla's Bergamot set up as Firefox 145's translations-engine.worker.js does (one model, plain text).
async function openBergamot(load, loadBergamot, log) {
  const t0 = performance.now();
  const wasmBinary = await load("bergamot-translator.wasm");
  const b = await new Promise((resolve, reject) => {
    const m = loadBergamot({
      INITIAL_MEMORY: 41943040,
      print: log,
      printErr: log,
      wasmBinary,
      onAbort: () => reject(new Error("wasm aborted")),
      onRuntimeInitialized: () => queueMicrotask(() => resolve({ m })),
    });
  });
  const bergamot = b.m;
  const aligned = async (name, align) => {
    const bytes = new Uint8Array(await load(name));
    const memory = new bergamot.AlignedMemory(bytes.length, align);
    memory.getByteArrayView().set(bytes);
    return memory;
  };
  const model = await aligned("model.enja.intgemm.alphas.bin", 256);
  const lex = await aligned("lex.50.50.enja.s2t.bin", 64);
  const vocabs = new bergamot.AlignedMemoryList();
  vocabs.push_back(await aligned("srcvocab.enja.spm", 64));
  vocabs.push_back(await aligned("trgvocab.enja.spm", 64));
  const pad = " ".repeat(12);
  const config =
    "\n" +
    [
      "beam-size: 1",
      "normalize: 1.0",
      "word-penalty: 0",
      "max-length-break: 128",
      "mini-batch-words: 1024",
      "workspace: 128",
      "max-length-factor: 2.0",
      "skip-cost: true",
      "cpu-threads: 0",
      "quiet: true",
      "quiet-translation: true",
      "gemm-precision: int8shiftAlphaAll",
      "alignment: soft",
    ]
      .map((line) => pad + line + "\n")
      .join("") +
    pad;
  const tm = new bergamot.TranslationModel(
    "en",
    "ja",
    config,
    model,
    lex,
    vocabs,
    null,
  );
  const service = new bergamot.BlockingService({ cacheSize: 0 });
  return {
    loadMs: performance.now() - t0,
    heap: () => bergamot.HEAPU8?.length,
    translate(text) {
      const messages = new bergamot.VectorString();
      const options = new bergamot.VectorResponseOptions();
      messages.push_back(text);
      options.push_back({ qualityScores: false, alignment: true, html: false });
      const responses = service.translate(tm, messages, options);
      const out = responses.get(0).getTranslatedText();
      responses.delete();
      messages.delete();
      options.delete();
      return out;
    },
  };
}
globalThis.openBergamot = openBergamot;
