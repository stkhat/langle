/* global importScripts, loadBergamot, openBergamot */
importScripts("bergamot-translator.js", "engine.js");

const load = async (name) => {
  const response = await fetch(name);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  return response.arrayBuffer();
};

self.onmessage = async ({ data: run }) => {
  try {
    const started = performance.now();
    const log = (message) => self.postMessage({ log: String(message) });
    const engine = await openBergamot(load, loadBergamot, log);
    const set = JSON.parse(new TextDecoder().decode(await load("set.json")));
    const rows = [];
    if (run === "lifecycle") {
      let hash = 0;
      const times = [];
      for (const [i, { en }] of set.entries()) {
        const from = performance.now();
        const out = engine.translate(en);
        times.push(performance.now() - from);
        for (const char of out)
          hash = (Math.imul(hash, 31) + char.codePointAt(0)) | 0;
        if (i === 0) self.postMessage({ first: true });
      }
      // Stays alive, holding its memory, until the page terminates it.
      times.sort((a, b) => a - b);
      self.postMessage({
        held: {
          count: set.length,
          hash,
          heap: engine.heap(),
          p50: times[Math.ceil(times.length * 0.5) - 1],
          p95: times[Math.ceil(times.length * 0.95) - 1],
          within1s: times.filter((ms) => ms <= 1000).length,
        },
      });
      return;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const { id, en } of set) {
        const from = performance.now();
        const out = engine.translate(en);
        rows.push({ id, pass, ms: performance.now() - from, out });
      }
    }
    self.postMessage({
      loadMs: engine.loadMs,
      totalMs: performance.now() - started,
      heap: engine.heap(),
      rows,
    });
  } catch (error) {
    self.postMessage({ error: String(error?.message ?? error) });
  }
};
