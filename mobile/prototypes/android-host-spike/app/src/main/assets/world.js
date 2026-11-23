// Injected at document start into the "langle" world (an isolated world) of the page's top frame.
// It records what it sees at that moment, answers native replies and relays the page's postMessage.
(() => {
  const html = document.documentElement;
  const start = {
    t: Math.round(performance.now()),
    readyState: document.readyState,
    scripts: document.scripts.length,
    htmlClass: html ? html.className : null,
    pageGlobalRLQ: typeof window.RLQ,
  };
  // Wikipedia's first inline script swaps <html class="client-nojs"> for "client-js": when that
  // happens after this script, a page script ran after it.
  let pageScriptSeenAt = null;
  const seen = new MutationObserver(() => {
    if (
      pageScriptSeenAt === null &&
      /client-js/.test(document.documentElement?.className ?? "")
    ) {
      pageScriptSeenAt = Math.round(performance.now());
    }
  });
  seen.observe(document, {
    attributes: true,
    subtree: true,
    attributeFilter: ["class"],
    childList: true,
  });

  window.__langleWorld = true;
  const post = (kind, data) =>
    window.langleBridge.postMessage(JSON.stringify({ kind, ...data }));
  window.langleBridge.onmessage = (e) =>
    post("reply-received", { data: e.data });
  window.addEventListener("message", (e) => {
    if (e.data?.langle)
      post("page-postMessage", {
        data: e.data,
        origin: e.origin,
        fromPage: e.source === window,
      });
  });
  post("start", start);
  document.addEventListener("DOMContentLoaded", () =>
    post("dcl", {
      t: Math.round(performance.now()),
      pageScriptSeenAt,
      htmlClass: document.documentElement.className.slice(0, 40),
      pageGlobalRLQ: typeof window.RLQ,
      pageGlobalMw: typeof window.mw,
    }),
  );
})();
