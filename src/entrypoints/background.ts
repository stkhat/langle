import { startBackground } from "../background/start";

// The body lives in src/background/start.ts, so the phone app's test can run it on the
// app's shim outside WXT (src/app/app-host.browser.test.ts).
export default defineBackground(startBackground);
