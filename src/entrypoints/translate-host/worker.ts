// The translation Worker of translate-host.html: Bergamot's glue (an Emscripten script that
// defines `loadBergamot`) and its WebAssembly build come from the app's assets
// (`/bergamot/…`, npm run mobile:bergamot), the models from the app's files (`/models/…`).
import { answer, createEngine, type Bergamot } from "./engine";
import type { EngineRequest, HostEvent } from "./protocol";

interface WorkerGlobals {
  importScripts(...urls: string[]): void;
  loadBergamot(module: object): Bergamot;
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<EngineRequest>) => void,
  ): void;
}

const worker = globalThis as unknown as WorkerGlobals;

/** Firefox 145's start: 40 MiB, grown as the models need it. */
const INITIAL_MEMORY = 41_943_040;

async function fetchBytes(path: string): Promise<ArrayBuffer> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.arrayBuffer();
}

function bergamot(): Promise<Bergamot> {
  return fetchBytes("/bergamot/bergamot-translator.wasm").then(
    (wasmBinary) =>
      new Promise((resolve, reject) => {
        worker.importScripts("/bergamot/bergamot-translator.js");
        const module = worker.loadBergamot({
          INITIAL_MEMORY,
          wasmBinary,
          print: (text: string) => console.info(`Bergamot: ${text}`),
          printErr: (text: string) => console.warn(`Bergamot: ${text}`),
          onAbort: (why: unknown) => {
            const error = `Bergamot aborted: ${String(why)}`;
            reject(new Error(error));
            worker.postMessage({ kind: "failed", error } satisfies HostEvent);
          },
          onRuntimeInitialized: () => {
            // `module` is assigned once loadBergamot returns.
            void Promise.resolve().then(() => resolve(module));
          },
        });
      }),
  );
}

const engine = createEngine({ bergamot, fetchBytes });

// One request at a time, in order: Bergamot's service is synchronous.
let queue = Promise.resolve();
worker.addEventListener("message", (event) => {
  queue = queue.then(async () => {
    worker.postMessage(await answer(engine, event.data));
  });
});
