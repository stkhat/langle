import type { Transport } from "./bridge";

/**
 * What the app's native code puts in Langle's world (docs/specs/mobile-app.md "Bridge
 * protocol"): on iOS a `WKScriptMessageHandler` named `langleBridge`, answered by
 * calling `__langleBridgeReceive(json)`; on Android the `addWebMessageListener` object
 * `langleBridge`, answered through its `onmessage`.
 */
interface NativeGlobals {
  webkit?: {
    messageHandlers?: { langleBridge?: { postMessage(json: string): void } };
  };
  __langleBridgeReceive?: (json: string) => void;
  langleBridge?: {
    postMessage(json: string): void;
    onmessage?: ((event: { data: string }) => void) | null;
  };
}

/** The platform's transport, or undefined outside the app. */
export function nativeTransport(): Transport | undefined {
  const native = globalThis as NativeGlobals;
  const ios = native.webkit?.messageHandlers?.langleBridge;
  if (ios)
    return {
      post: (json) => ios.postMessage(json),
      listen: (receive) => {
        native.__langleBridgeReceive = receive;
      },
    };
  const android = native.langleBridge;
  if (android && typeof android.postMessage === "function")
    return {
      post: (json) => android.postMessage(json),
      listen: (receive) => {
        android.onmessage = (event) => receive(event.data);
      },
    };
  return undefined;
}
