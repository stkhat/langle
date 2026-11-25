import { nativeTransport } from "../../app/bridge/native-transport";
import { startTranslateHost } from "./host";

// The Android app's hidden translation page (docs/specs/mobile-translation.md "The Android
// host"), in a WebView of its own (the `translate` profile) that native code creates when
// the engine starts and destroys when it is released.
const native = nativeTransport();
if (native)
  startTranslateHost(
    native,
    new Worker(new URL("./worker.ts", import.meta.url)),
  );
else console.error("Langle translate host: no bridge to the app");
