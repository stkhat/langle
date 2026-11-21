// Evaluate an expression in the prototype's WebView page over the DevTools protocol (adb forward).
// Usage: node mobile/prototypes/cdp.mjs <package> '<expression>'   (needs scripts/mobile/env.sh)
// The expression may return a promise; the result is printed as JSON.
import { execFileSync } from "node:child_process";
import process from "node:process";

const [pkg, expression] = process.argv.slice(2);
const pid = execFileSync("adb", ["shell", "pidof", pkg]).toString().trim();
if (!pid) throw new Error(`${pkg} is not running`);
const port = 9333;
execFileSync("adb", [
  "forward",
  `tcp:${port}`,
  `localabstract:webview_devtools_remote_${pid}`,
]);
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page target");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id !== 1) return;
  const r = msg.result?.result;
  console.log(
    JSON.stringify(msg.result?.exceptionDetails ?? r?.value ?? r, null, 1),
  );
  ws.close();
};
ws.send(
  JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: { expression, awaitPromise: true, returnByValue: true },
  }),
);
