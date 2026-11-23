// Page world, before probe.js: gives it the same `langleNative.postMessage` the WebView app has,
// and runs named commands from the app (no eval: YouTube's CSP would refuse it).
(() => {
  const post = (s) => window.postMessage({ __langleProbe: s }, "*");
  window.langleNative = { postMessage: post };
  const player = () => document.querySelector("#movie_player");
  const commands = {
    variants: () => window.__langleProbeVariants(),
    captions: () => {
      const p = player();
      p.mute?.();
      // The mobile site waits for a tap in Firefox. Captions asked for before it plays come
      // back empty (no PO token yet) and are not asked for again: play first, ask when it plays.
      if (p.getPlayerState?.() !== 1) {
        p.playVideo?.();
        return "playing";
      }
      p.loadModule?.("captions");
      p.setOption("captions", "track", { languageCode: "en" });
      return "ok";
    },
    captionsJa: () => {
      player().setOption("captions", "track", {
        languageCode: "en",
        translationLanguage: { languageCode: "ja", languageName: "Japanese" },
      });
      return "ok";
    },
    state: () => {
      const p = player();
      return {
        state: p?.getPlayerState?.(),
        t: document.querySelector("video")?.currentTime,
        ad: !!p?.classList.contains("ad-showing"),
        pruned: window.__langleProbe?.pruned,
      };
    },
    measure: () => {
      const r = performance.getEntriesByType("resource");
      return {
        resources: r.length,
        hosts: new Set(r.map((x) => new URL(x.name).hostname)).size,
        textChars: document.body?.innerText.length,
        webdriver: navigator.webdriver,
        // eslint-disable-next-line no-restricted-properties -- the probe records the UA the page saw
        ua: navigator.userAgent,
      };
    },
  };
  window.addEventListener("message", (e) => {
    const cmd = e.data?.__langleCmd;
    if (e.source !== window || !cmd || window.top !== window) return;
    Promise.resolve()
      .then(() => commands[cmd]())
      .then(
        (value) => post(JSON.stringify({ type: "cmd", cmd, value })),
        (error) =>
          post(JSON.stringify({ type: "cmd", cmd, error: String(error) })),
      );
  });
})();
