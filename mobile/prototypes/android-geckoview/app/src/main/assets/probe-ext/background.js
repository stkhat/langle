// Background: the native port, and the same prototype ad blocking as the WebView app
// (EasyList `||host^` rules through blocking webRequest, generic `##` rules through insertCSS).
/* global browser */
const EASYLIST = "https://easylist.to/easylist/easylist.txt";
const UNSUPPORTED = [
  ":-abp-",
  ":has-text",
  ":style(",
  ":matches-",
  ":xpath",
  ":upward",
  ":remove",
  ":watch-attr",
];
let port;
let blocked = new Set();
let allowed = new Set();
let css = "";
let enabled = false;
let count = 0;

const send = (msg) => port?.postMessage(msg);

function hostOf(rule) {
  const caret = rule.indexOf("^");
  if (caret <= 0) return null;
  const rest = rule.slice(caret + 1);
  if (rest && rest !== "$third-party") return null;
  const host = rule.slice(0, caret);
  return /^[a-z0-9.-]+$/i.test(host) ? host : null;
}

async function loadList() {
  const text = await (await fetch(EASYLIST)).text();
  const selectors = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("@@||")) {
      const h = hostOf(line.slice(4));
      if (h) allowed.add(h);
    } else if (line.startsWith("||")) {
      const h = hostOf(line.slice(2));
      if (h) blocked.add(h);
    } else if (line.startsWith("##")) {
      const sel = line.slice(2).trim();
      if (!UNSUPPORTED.some((u) => sel.includes(u))) selectors.push(sel);
    }
  }
  css = selectors.map((s) => `${s}{display:none!important}`).join("\n");
  return {
    hosts: blocked.size,
    allow: allowed.size,
    selectors: selectors.length,
  };
}

function isBlocked(url) {
  let h;
  try {
    h = new URL(url).hostname;
  } catch {
    return false;
  }
  for (;;) {
    if (allowed.has(h)) return false;
    if (blocked.has(h)) return true;
    const dot = h.indexOf(".");
    if (dot < 0) return false;
    h = h.slice(dot + 1);
  }
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!enabled || details.type === "main_frame" || !isBlocked(details.url))
      return {};
    count += 1;
    send({ type: "blocked", n: count, host: new URL(details.url).hostname });
    return { cancel: true };
  },
  { urls: ["<all_urls>"] },
  ["blocking"],
);

browser.webNavigation.onCommitted.addListener(({ tabId, frameId, url }) => {
  if (frameId === 0) count = 0;
  if (!enabled || !css || !url.startsWith("http")) return;
  browser.scripting
    .insertCSS({ target: { tabId, frameIds: [frameId] }, css, origin: "USER" })
    .catch((e) => send({ type: "log", msg: `insertCSS ${e}` }));
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg?.page) send({ type: "page", top: msg.top, data: msg.page });
});

// On a restart the background runs before the app has set its message delegate, and that
// connection never answers; reconnect until the app sends its config.
let configured = false;
function connect() {
  const p = browser.runtime.connectNative("langle");
  port = p;
  p.onDisconnect.addListener(() => {
    if (port === p) port = undefined;
    if (!configured) setTimeout(connect, 500);
  });
  setTimeout(() => {
    if (!configured && port === p) {
      p.disconnect();
      port = undefined;
      connect();
    }
  }, 1000);
  p.onMessage.addListener(async (msg) => {
    if (msg.config) {
      configured = true;
      enabled = msg.config.block;
      let info = {};
      if (enabled && !css)
        info = await loadList().catch((e) => ({ error: String(e) }));
      send({ type: "ready", block: enabled, ...info });
    } else if (msg.cmd) {
      for (const tab of await browser.tabs.query({})) {
        browser.tabs
          .sendMessage(tab.id, { cmd: msg.cmd }, { frameId: 0 })
          .catch(() => {});
      }
    }
  });
  send({ type: "hello" });
}
connect();
