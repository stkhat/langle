import type { Transport } from "../../app/bridge/bridge";
import { parseRequest, type EngineAnswer, type HostEvent } from "./protocol";

/** The parts of a Worker the page uses. */
export interface EngineWorker {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<EngineAnswer | HostEvent>) => void,
  ): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
}

/**
 * translate-host.html (docs/specs/mobile-translation.md "The Android host"): passes native
 * code's requests to the engine's Worker and its answers back, and says when the Worker
 * broke, so native code ends the engine. Anything else from native code is dropped.
 */
export function startTranslateHost(native: Transport, worker: EngineWorker) {
  const send = (message: EngineAnswer | HostEvent) => {
    native.post(JSON.stringify(message));
  };
  let failed = false;
  const fail = (error: string) => {
    if (failed) return;
    failed = true;
    send({ kind: "failed", error });
  };
  native.listen((json) => {
    const request = parseRequest(json);
    if (request) worker.postMessage(request);
    else
      console.warn("Langle translate host: not a request", json.slice(0, 200));
  });
  worker.addEventListener("message", (event) => {
    if (event.data.kind === "failed") fail(event.data.error);
    else send(event.data);
  });
  worker.addEventListener("error", (event) => {
    event.preventDefault();
    fail(event.message || "the translation worker failed");
  });
  send({ kind: "ready" });
}
