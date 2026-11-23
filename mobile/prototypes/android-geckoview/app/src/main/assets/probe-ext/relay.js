// Isolated world: page messages → background → app, and app commands → page.
/* global browser */
window.addEventListener("message", (e) => {
  if (e.source === window && typeof e.data?.__langleProbe === "string") {
    browser.runtime.sendMessage({
      page: e.data.__langleProbe,
      top: window.top === window,
    });
  }
});
browser.runtime.onMessage.addListener((msg) => {
  if (msg?.cmd) window.postMessage({ __langleCmd: msg.cmd }, "*");
});
