// Kept identical in all prototypes (android-webview, android-geckoview, ios-wkwebview).
// Injected at document start in every frame (page world: WebView has no isolated world).
// Reports to the app through `langleNative` (WebViewCompat.addWebMessageListener).
// 1. YouTube ad fields are pruned from the player response before the player reads it.
// 2. /api/timedtext responses are recorded; window.__langleProbeVariants() refetches variants.
(() => {
  if (window.__langleProbe) return;
  window.__langleProbe = { pruned: {}, timedtext: [] };
  const state = window.__langleProbe;
  const send = (type, data) => {
    try {
      // eslint-disable-next-line no-undef
      langleNative.postMessage(
        JSON.stringify({ type, href: location.href.slice(0, 120), ...data }),
      );
    } catch {
      /* no bridge in this frame */
    }
  };

  const AD_KEYS = [
    "adPlacements",
    "playerAds",
    "adSlots",
    "adBreakHeartbeatParams",
  ];
  const isPlayerResponse = (o) =>
    o && typeof o === "object" && (o.playabilityStatus || o.playerResponse);
  const prune = (o) => {
    if (!isPlayerResponse(o)) return o;
    const removed = [];
    for (const target of [o, o.playerResponse]) {
      if (!target || typeof target !== "object") continue;
      for (const key of AD_KEYS) {
        if (key in target) {
          Reflect.deleteProperty(target, key);
          removed.push(key);
          state.pruned[key] = (state.pruned[key] || 0) + 1;
        }
      }
    }
    const status = (o.playabilityStatus || o.playerResponse?.playabilityStatus)
      ?.status;
    send("playerResponse", { removed, status });
    return o;
  };

  const origParse = JSON.parse;
  JSON.parse = function (...args) {
    const result = origParse.apply(this, args);
    try {
      prune(result);
    } catch {
      /* keep the page working */
    }
    return result;
  };
  const origJson = Response.prototype.json;
  Response.prototype.json = function () {
    return origJson.call(this).then((r) => {
      try {
        prune(r);
      } catch {
        /* keep the page working */
      }
      return r;
    });
  };
  let initial;
  try {
    Object.defineProperty(window, "ytInitialPlayerResponse", {
      configurable: true,
      get: () => initial,
      set: (v) => {
        initial = prune(v);
      },
    });
  } catch {
    /* already defined */
  }

  const record = (url, text, via) => {
    const u = new URL(url, location.href);
    const p = u.searchParams;
    state.timedtext.push(u.href);
    send("timedtext", {
      via,
      bytes: text.length,
      pot: p.has("pot"),
      c: p.get("c"),
      lang: p.get("lang"),
      kind: p.get("kind"),
      fmt: p.get("fmt"),
    });
  };
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__langleUrl = String(url);
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__langleUrl?.includes("/api/timedtext")) {
      this.addEventListener("load", () => {
        const text =
          typeof this.response === "string"
            ? this.response
            : this.responseText || "";
        record(this.__langleUrl, text, "xhr");
      });
    }
    return origSend.apply(this, args);
  };
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input?.url;
    const result = origFetch.call(this, input, init);
    if (url && String(url).includes("/api/timedtext")) {
      result
        .then((r) => r.clone().text())
        .then((t) => record(String(url), t, "fetch"))
        .catch(() => {});
    }
    return result;
  };

  // Refetch the last captured URL with the variants docs/notes/mobile.md measured on the mobile site.
  window.__langleProbeVariants = async () => {
    const last = state.timedtext.at(-1);
    if (!last) return { error: "no timedtext captured" };
    const variants = {
      captured: (u) => u,
      "lang=ja": (u) => u.searchParams.set("lang", "ja"),
      "tlang=ja": (u) => u.searchParams.set("tlang", "ja"),
      "kind=asr": (u) => u.searchParams.set("kind", "asr"),
      "lang=es": (u) => u.searchParams.set("lang", "es"),
      "no pot": (u) => {
        u.searchParams.delete("pot");
        u.searchParams.delete("potc");
      },
    };
    const sizes = {};
    for (const [name, change] of Object.entries(variants)) {
      const u = new URL(last);
      change(u);
      const r = await origFetch(u.href, { credentials: "include" });
      sizes[name] = `${r.status} ${(await r.text()).length}`;
    }
    send("variants", { sizes });
    return sizes;
  };

  if (window.top === window) {
    // The probe records which user agent the page saw (the PO token depends on it).
    // eslint-disable-next-line no-restricted-properties
    send("start", { ua: navigator.userAgent, webdriver: navigator.webdriver });
    if (location.hostname.endsWith("youtube.com")) {
      let wasAd = false;
      setInterval(() => {
        const player = document.querySelector("#movie_player");
        const ad = !!player?.classList.contains("ad-showing");
        if (ad !== wasAd) send("adShowing", { ad });
        wasAd = ad;
      }, 1000);
    }
  }
})();
