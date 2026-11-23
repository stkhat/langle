import { afterEach, describe, expect, test, vi } from "vitest";
import { createBridge, NO_RECEIVER, type Transport } from "./bridge";

function fakeTransport() {
  const posted: unknown[] = [];
  let receive: (json: string) => void = () => {
    throw new Error("not listening");
  };
  const transport: Transport = {
    post: (json) => posted.push(JSON.parse(json)),
    listen: (r) => {
      receive = r;
    },
  };
  return {
    transport,
    posted,
    deliver: (value: unknown) => receive(JSON.stringify(value)),
    deliverText: (text: string) => receive(text),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createBridge", () => {
  test("posts a call and resolves with its reply's value", async () => {
    const native = fakeTransport();
    const bridge = createBridge(native.transport);
    const result = bridge.call("storage.local.get", ["settings"]);
    expect(native.posted).toEqual([
      {
        v: 1,
        kind: "call",
        id: "c1",
        api: "storage.local.get",
        args: [["settings"]],
      },
    ]);
    native.deliver({
      v: 1,
      kind: "reply",
      id: "c1",
      ok: true,
      value: { settings: {} },
    });
    await expect(result).resolves.toEqual({ settings: {} });
  });

  test("rejects with the error reply's message", async () => {
    const native = fakeTransport();
    const bridge = createBridge(native.transport);
    const result = bridge.call("runtime.sendMessage", { type: "counts" });
    native.deliver({
      v: 1,
      kind: "reply",
      id: "c1",
      ok: false,
      error: { message: NO_RECEIVER },
    });
    await expect(result).rejects.toThrow(/Receiving end does not exist/);
    await expect(result).rejects.toBeInstanceOf(Error);
  });

  test("matches replies to calls by id, in any order", async () => {
    const native = fakeTransport();
    const bridge = createBridge(native.transport);
    const first = bridge.call("tabs.get", 1);
    const second = bridge.call("tabs.get", 2);
    native.deliver({ v: 1, kind: "reply", id: "c2", ok: true, value: "two" });
    native.deliver({ v: 1, kind: "reply", id: "c1", ok: true, value: "one" });
    await expect(first).resolves.toBe("one");
    await expect(second).resolves.toBe("two");
  });

  test("gives an event's args to its handler", () => {
    const native = fakeTransport();
    const bridge = createBridge(native.transport);
    const handler = vi.fn();
    bridge.on("storage.onChanged", handler);
    native.deliver({
      v: 1,
      kind: "event",
      api: "storage.onChanged",
      args: [{ settings: { newValue: 1 } }, "local"],
    });
    expect(handler).toHaveBeenCalledWith([
      { settings: { newValue: 1 } },
      "local",
    ]);
    expect(native.posted).toEqual([]);
  });

  test("answers an event that expects a reply with the handler's result", async () => {
    const native = fakeTransport();
    const bridge = createBridge(native.transport);
    bridge.on("runtime.onMessage", ([message]) =>
      (message as { type: string }).type === "sync"
        ? "now"
        : Promise.resolve("later"),
    );
    native.deliver({
      v: 1,
      kind: "event",
      api: "runtime.onMessage",
      args: [{ type: "sync" }, {}],
      replyId: "n1",
    });
    native.deliver({
      v: 1,
      kind: "event",
      api: "runtime.onMessage",
      args: [{ type: "async" }, {}],
      replyId: "n2",
    });
    await settle();
    expect(native.posted).toEqual([
      { v: 1, kind: "reply", id: "n1", ok: true, value: "now" },
      { v: 1, kind: "reply", id: "n2", ok: true, value: "later" },
    ]);
  });

  test("answers an event with an error when its handler throws or rejects", async () => {
    const native = fakeTransport();
    const bridge = createBridge(native.transport);
    bridge.on("runtime.onMessage", ([message]) => {
      if ((message as { type: string }).type === "throw")
        throw new Error("thrown");
      return Promise.reject(new Error("rejected"));
    });
    for (const [type, replyId] of [
      ["throw", "n1"],
      ["reject", "n2"],
    ])
      native.deliver({
        v: 1,
        kind: "event",
        api: "runtime.onMessage",
        args: [{ type }, {}],
        replyId,
      });
    await settle();
    expect(native.posted).toEqual([
      {
        v: 1,
        kind: "reply",
        id: "n1",
        ok: false,
        error: { message: "thrown" },
      },
      {
        v: 1,
        kind: "reply",
        id: "n2",
        ok: false,
        error: { message: "rejected" },
      },
    ]);
  });

  test("answers an event nobody handles with Chrome's missing receiver error", async () => {
    const native = fakeTransport();
    createBridge(native.transport);
    native.deliver({
      v: 1,
      kind: "event",
      api: "runtime.onMessage",
      args: [{ type: "counts" }, {}],
      replyId: "n1",
    });
    await settle();
    expect(native.posted).toEqual([
      {
        v: 1,
        kind: "reply",
        id: "n1",
        ok: false,
        error: {
          message:
            "Could not establish connection. Receiving end does not exist.",
        },
      },
    ]);
  });

  test("ignores a bad envelope and reports it once", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const native = fakeTransport();
    createBridge(native.transport);
    native.deliverText('{"v":2,"kind":"event","api":"alarms.onAlarm"}');
    expect(error).toHaveBeenCalledOnce();
    expect(native.posted).toEqual([]);
  });

  test("ignores a reply to no call and reports it", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const native = fakeTransport();
    createBridge(native.transport);
    native.deliver({ v: 1, kind: "reply", id: "c9", ok: true });
    expect(error).toHaveBeenCalledOnce();
  });

  test("takes one handler per event", () => {
    const bridge = createBridge(fakeTransport().transport);
    bridge.on("alarms.onAlarm", () => {});
    expect(() => bridge.on("alarms.onAlarm", () => {})).toThrow();
  });
});
