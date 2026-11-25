import { describe, expect, test } from "vitest";
import { startTranslateHost, type EngineWorker } from "./host";
import { parseRequest } from "./protocol";

function setUp() {
  const posted: unknown[] = [];
  let receive: ((json: string) => void) | undefined;
  const native = {
    post: (json: string) => posted.push(JSON.parse(json)),
    listen: (listener: (json: string) => void) => {
      receive = listener;
    },
  };
  const target = new EventTarget();
  const toWorker: unknown[] = [];
  const worker = Object.assign(target, {
    postMessage: (message: unknown) => toWorker.push(message),
  }) as unknown as EngineWorker & EventTarget;
  startTranslateHost(native, worker);
  return {
    posted,
    toWorker,
    fromNative: (message: unknown) => receive!(JSON.stringify(message)),
    fromWorker: (data: unknown) =>
      target.dispatchEvent(new MessageEvent("message", { data })),
    workerError: (message: string) => {
      const event = new ErrorEvent("error", { message, cancelable: true });
      target.dispatchEvent(event);
      return event;
    },
  };
}

describe("translate-host.html", () => {
  test("says it is ready, and passes requests to the Worker and answers back", () => {
    const host = setUp();
    expect(host.posted).toEqual([{ kind: "ready" }]);
    const load = {
      kind: "load",
      id: 1,
      from: "en",
      to: "ja",
      packs: ["mt-en-ja"],
    };
    host.fromNative(load);
    expect(host.toWorker).toEqual([load]);
    host.fromWorker({ kind: "loaded", id: 1, ok: true });
    const translate = {
      kind: "translate",
      id: 2,
      from: "en",
      to: "ja",
      text: "Hello",
    };
    host.fromNative(translate);
    host.fromWorker({ kind: "translated", id: 2, text: "こんにちは" });
    expect(host.toWorker).toEqual([load, translate]);
    expect(host.posted.slice(1)).toEqual([
      { kind: "loaded", id: 1, ok: true },
      { kind: "translated", id: 2, text: "こんにちは" },
    ]);
  });

  test("drops anything that is not a request", () => {
    const host = setUp();
    host.fromNative({ kind: "translate", id: 1, from: "en", to: "ja" });
    host.fromNative({ kind: "eval", id: 2, from: "en", to: "ja" });
    host.fromNative("text");
    expect(host.toWorker).toEqual([]);
    expect(parseRequest("{")).toBeUndefined();
  });

  test("a Worker error or a Bergamot abort is one failure for native code", () => {
    const host = setUp();
    const event = host.workerError("RuntimeError: memory access out of bounds");
    expect(event.defaultPrevented).toBe(true);
    host.fromWorker({ kind: "failed", error: "Bergamot aborted: OOM" });
    expect(host.posted.slice(1)).toEqual([
      { kind: "failed", error: "RuntimeError: memory access out of bounds" },
    ]);
  });
});
