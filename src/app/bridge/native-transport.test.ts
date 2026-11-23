import { afterEach, describe, expect, test, vi } from "vitest";
import { nativeTransport } from "./native-transport";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("nativeTransport", () => {
  test("is missing outside the app", () => {
    expect(nativeTransport()).toBeUndefined();
  });

  test("posts to the iOS message handler and receives through __langleBridgeReceive", () => {
    const postMessage = vi.fn();
    vi.stubGlobal("webkit", {
      messageHandlers: { langleBridge: { postMessage } },
    });
    const transport = nativeTransport();
    const received: string[] = [];
    transport?.listen((json) => received.push(json));
    transport?.post("out");
    (
      globalThis as unknown as { __langleBridgeReceive: (json: string) => void }
    ).__langleBridgeReceive("in");
    expect(postMessage).toHaveBeenCalledWith("out");
    expect(received).toEqual(["in"]);
  });

  test("posts to the Android listener object and receives its messages", () => {
    const listener: {
      postMessage: (json: string) => void;
      onmessage?: (event: { data: string }) => void;
    } = { postMessage: vi.fn() };
    vi.stubGlobal("langleBridge", listener);
    const transport = nativeTransport();
    const received: string[] = [];
    transport?.listen((json) => received.push(json));
    transport?.post("out");
    listener.onmessage?.({ data: "in" });
    expect(listener.postMessage).toHaveBeenCalledWith("out");
    expect(received).toEqual(["in"]);
  });
});
