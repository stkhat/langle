import {
  isParseError,
  parseEnvelope,
  PROTOCOL_VERSION,
  type CallApi,
  type EventApi,
} from "./protocol";

/** Chrome's text when a message has nobody to answer it (`messaging/client.ts` retries on it). */
export const NO_RECEIVER =
  "Could not establish connection. Receiving end does not exist.";

/** One script context's line to native code: JSON strings both ways. */
export interface Transport {
  post(json: string): void;
  listen(receive: (json: string) => void): void;
}

export interface Bridge {
  /** Asks native code; resolves with the reply's value, rejects with its error. */
  call(api: CallApi, ...args: unknown[]): Promise<unknown>;
  /**
   * Handles an event. When native code expects an answer (`replyId`), what the
   * handler returns (or resolves to) is the answer, and what it throws the error.
   */
  on(api: EventApi, handler: (args: unknown[]) => unknown): void;
}

export function createBridge(
  transport: Transport,
  newId: () => string = counterIds(),
): Bridge {
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  const handlers = new Map<EventApi, (args: unknown[]) => unknown>();

  const post = (envelope: object) =>
    transport.post(JSON.stringify({ v: PROTOCOL_VERSION, ...envelope }));

  const answer = (id: string, run: () => unknown) => {
    const reply = (
      envelope:
        | { ok: true; value: unknown }
        | { ok: false; error: { message: string } },
    ) => post({ kind: "reply", id, ...envelope });
    new Promise((resolve) => resolve(run())).then(
      (value) => reply({ ok: true, value }),
      (error: unknown) =>
        reply({
          ok: false,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        }),
    );
  };

  transport.listen((json) => {
    const envelope = parseEnvelope(json);
    if (isParseError(envelope)) {
      console.error(`Langle bridge: ${envelope.error}`, json);
      return;
    }
    switch (envelope.kind) {
      case "reply": {
        const call = pending.get(envelope.id);
        if (!call) {
          console.error(`Langle bridge: a reply to no call (${envelope.id})`);
          return;
        }
        pending.delete(envelope.id);
        if (envelope.ok) call.resolve(envelope.value);
        else call.reject(new Error(envelope.error.message));
        return;
      }
      case "event": {
        const handler = handlers.get(envelope.api);
        if (envelope.replyId === undefined) {
          handler?.(envelope.args);
          return;
        }
        answer(envelope.replyId, () => {
          if (!handler) throw new Error(NO_RECEIVER);
          return handler(envelope.args);
        });
        return;
      }
      case "call":
        console.error(`Langle bridge: a call to a script (${envelope.api})`);
    }
  });

  return {
    call: (api, ...args) =>
      new Promise((resolve, reject) => {
        const id = newId();
        pending.set(id, { resolve, reject });
        post({ kind: "call", id, api, args });
      }),
    on: (api, handler) => {
      if (handlers.has(api)) throw new Error(`${api} is already handled`);
      handlers.set(api, handler);
    },
  };
}

function counterIds(): () => string {
  let next = 0;
  return () => `c${++next}`;
}
