import { describe, expect, it, vi } from "vitest";
import { createBridge } from "../../app/bridge/bridge";
import { createAppHost } from "../../app/shim/app-host";
import {
  createReferenceNative,
  type ReferenceTranslator,
} from "../../app/testing/reference-native";
import type { TranslatorStatus } from "../../core/app-host";
import type { PackState, PackStates } from "../../core/packs/state";
import { bridgeBackend } from "./bridge-backend";
import { createTranslationQueue } from "./queue";
import type { ModelDownload } from "./translator";

const EN_JA = { from: "en", to: "ja" };
const ARTICLE = "https://example.com/article";
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Pack states the test changes, heard as the background's `packState`. */
function fakeStates(initial: PackStates = {}) {
  let states = initial;
  const listeners = new Set<(states: PackStates) => void>();
  return {
    watchStates(listener: (states: PackStates) => void) {
      listeners.add(listener);
      queueMicrotask(() => listeners.has(listener) && listener(states));
      return () => void listeners.delete(listener);
    },
    set(next: PackStates) {
      states = next;
      for (const listener of [...listeners]) listener(states);
    },
    get listening() {
      return listeners.size;
    },
  };
}

const downloading = (received: number, total: number): PackState => ({
  state: "downloading",
  received,
  total,
});
const ready = (total: number): PackState => ({
  state: "ready",
  received: total,
  total,
});

/**
 * The app's bridge provider in a content script of the tab on screen, over the
 * reference native with `translator` as the app's translation host.
 */
function setup(
  translator: ReferenceTranslator,
  states = fakeStates(),
  { onScreen = true } = {},
) {
  const native = createReferenceNative({ translator });
  const tab = native.openTab(ARTICLE);
  if (!onScreen) native.openTab("https://example.com/other");
  const { transport } = native.connect({ kind: "content", tabId: tab });
  const host = createAppHost(createBridge(transport));
  return {
    backend: bridgeBackend(host, { watchStates: states.watchStates }),
    states,
  };
}

/** A host whose status for every pair is `status` and that translates to `ja(…)`. */
function hostWith(
  status: TranslatorStatus | ReferenceTranslator["status"],
  extra: Partial<ReferenceTranslator> = {},
) {
  const asked: unknown[] = [];
  const translator: ReferenceTranslator = {
    status: typeof status === "function" ? status : () => status,
    translate: (request) => {
      asked.push(request);
      return `ja(${request.text})`;
    },
    ...extra,
  };
  return { translator, asked };
}

describe("bridgeBackend", () => {
  it("translates through appHost.translate, passing start on", async () => {
    const { translator, asked } = hostWith("ready");
    const provider = setup(translator).backend.create("en", "ja");
    expect(await provider.open?.()).toBe(true);
    expect(await provider.translate("A cat.")).toBe("ja(A cat.)");
    expect(await provider.translate("A list.", { start: false })).toBe(
      "ja(A list.)",
    );
    expect(asked).toEqual([
      { ...EN_JA, text: "A cat.", start: true },
      { ...EN_JA, text: "A list.", start: false },
    ]);
  });

  it("gives no translation for the host's null, a page not on screen, or an error", async () => {
    const empty = setup(
      hostWith("ready", { translate: () => null }).translator,
    );
    expect(
      await empty.backend.create("en", "ja").translate("A cat."),
    ).toBeUndefined();
    const { translator, asked } = hostWith("ready");
    const hidden = setup(translator, fakeStates(), { onScreen: false });
    expect(
      await hidden.backend.create("en", "ja").translate("A cat."),
    ).toBeUndefined();
    expect(asked).toEqual([]);
    const failing = setup(
      hostWith("ready", {
        translate: () => Promise.reject(new Error("The engine stopped")),
      }).translator,
    );
    expect(
      await failing.backend.create("en", "ja").translate("A cat."),
    ).toBeUndefined();
  });

  it("is available unless the host says unavailable", async () => {
    for (const status of ["ready", "download", "packs"] as const)
      expect(
        await setup(hostWith(status).translator).backend.available("en", "ja"),
      ).toBe(true);
    expect(
      await setup(hostWith("unavailable").translator).backend.available(
        "en",
        "ja",
      ),
    ).toBe(false);
    // A host that cannot say counts as none.
    expect(
      await setup(
        hostWith(() => {
          throw new Error("No host");
        }).translator,
      ).backend.available("en", "ja"),
    ).toBe(false);
  });

  it("opens ready where the host is, never showing Apple's sheet", async () => {
    const prepare = vi.fn(() => "ready" as const);
    const { backend } = setup(hostWith("download", { prepare }).translator);
    const provider = backend.create("en", "ja");
    expect(await provider.open?.()).toBe(false);
    expect(await provider.open?.({ download: false })).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
    expect(
      await setup(hostWith("unavailable").translator)
        .backend.create("en", "ja")
        .open?.(),
    ).toBe(false);
  });

  it("waits for the model packs to open, unless the lists ask (Android)", async () => {
    let status: TranslatorStatus = "packs";
    const states = fakeStates({ "mt-en-ja": downloading(0, 10) });
    const { backend } = setup(hostWith(() => status).translator, states);
    expect(await backend.create("en", "ja").open?.({ download: false })).toBe(
      false,
    );
    const opened = backend.create("en", "ja").open?.();
    await settle();
    states.set({ "mt-en-ja": downloading(5, 10) });
    await settle();
    status = "ready";
    states.set({ "mt-en-ja": ready(10) });
    expect(await opened).toBe(true);
    expect(states.listening).toBe(0);
  });

  it("opens not ready when a model pack fails", async () => {
    const states = fakeStates({
      "mt-de-en": ready(4),
      "mt-en-fr": downloading(2, 6),
    });
    const { backend } = setup(hostWith("packs").translator, states);
    const opened = backend.create("de", "fr").open?.();
    await settle();
    states.set({
      "mt-de-en": ready(4),
      "mt-en-fr": { state: "failed", received: 0, total: 6, error: "offline" },
    });
    expect(await opened).toBe(false);
  });

  it("shows the model packs' download with their share, through English too (Android)", async () => {
    const states = fakeStates({
      "mt-de-en": ready(4),
      "mt-en-fr": downloading(1, 6),
    });
    const { backend } = setup(hostWith("packs").translator, states);
    const heard: (ModelDownload | undefined)[] = [];
    const stop = backend.create("de", "fr").watchDownload!((download) =>
      heard.push(download),
    );
    await settle();
    await settle();
    states.set({ "mt-de-en": ready(4), "mt-en-fr": downloading(4, 6) });
    states.set({ "mt-de-en": ready(4), "mt-en-fr": ready(6) });
    stop();
    states.set({ "mt-de-en": ready(4), "mt-en-fr": downloading(0, 6) });
    expect(heard).toEqual([{ share: 0.5 }, { share: 0.8 }, undefined]);
  });

  it("shows a download with no share before the packs have a state", async () => {
    const { backend } = setup(hostWith("packs").translator);
    const heard: (ModelDownload | undefined)[] = [];
    backend.create("en", "ja").watchDownload!((d) => heard.push(d));
    await settle();
    await settle();
    expect(heard).toEqual([{}]);
  });

  it("shows Apple's models as to come until their sheet is accepted (iOS)", async () => {
    let status: TranslatorStatus = "download";
    const { backend } = setup(
      hostWith(() => status, {
        prepare: () => {
          status = "ready";
          return status;
        },
      }).translator,
    );
    const heard: (ModelDownload | undefined)[] = [];
    backend.create("en", "ja").watchDownload!((d) => heard.push(d));
    await settle();
    expect(heard).toEqual([{}]);
    await backend.downloadModels("en", "ja");
    expect(heard).toEqual([{}, undefined]);
  });

  it("shows no download where the translator is ready or there is none", async () => {
    for (const status of ["ready", "unavailable"] as const) {
      const { backend } = setup(hostWith(status).translator);
      const heard: (ModelDownload | undefined)[] = [];
      backend.create("en", "ja").watchDownload!((d) => heard.push(d));
      await settle();
      expect(heard).toEqual([undefined]);
    }
  });

  it("downloadModels shows the sheet for each pair whose models Apple has to download (iOS)", async () => {
    const statuses: Record<string, TranslatorStatus> = {
      "en>ja": "download",
      "es>ja": "download",
      "fr>ja": "ready",
    };
    const prepared: string[] = [];
    const { backend } = setup(
      hostWith((pair) => statuses[`${pair.from}>${pair.to}`]!, {
        prepare: (pair) => {
          prepared.push(`${pair.from}>${pair.to}`);
          return "ready";
        },
      }).translator,
    );
    await backend.downloadModels("es", "ja");
    expect(prepared.sort()).toEqual(["en>ja", "es>ja"]);
    prepared.length = 0;
    await backend.downloadModels("fr", "ja");
    // en>ja's sheet is shown again: its status still says download.
    expect(prepared).toEqual(["en>ja"]);
  });

  it("downloadModels does nothing on Android, and for English learners into English", async () => {
    const prepare = vi.fn(() => "ready" as const);
    const android = setup(hostWith("packs", { prepare }).translator);
    await android.backend.downloadModels("en", "ja");
    const english = setup(hostWith("download", { prepare }).translator);
    await english.backend.downloadModels("en", "en");
    expect(prepare).not.toHaveBeenCalled();
  });

  it("waitsForConsent while a pair the languages use needs Apple's sheet (iOS)", async () => {
    const statuses: Record<string, TranslatorStatus> = {
      "en>ja": "ready",
      "es>ja": "download",
    };
    const { backend } = setup(
      hostWith((pair) => statuses[`${pair.from}>${pair.to}`] ?? "ready")
        .translator,
    );
    await expect(backend.waitsForConsent("es", "ja")).resolves.toBe(true);
    await expect(backend.waitsForConsent("en", "ja")).resolves.toBe(false);
    statuses["en>ja"] = "download";
    // English learners into English translate nothing.
    await expect(backend.waitsForConsent("en", "en")).resolves.toBe(false);
    for (const status of ["packs", "unavailable"] as const)
      await expect(
        setup(hostWith(status).translator).backend.waitsForConsent("en", "ja"),
      ).resolves.toBe(false);
  });

  it("downloadOnFirstActivation does nothing", () => {
    const status = vi.fn(() => "download" as const);
    const { backend } = setup(hostWith(status).translator);
    const target = new EventTarget();
    const disarm = backend.downloadOnFirstActivation(target, () => ({
      learning: "en",
      native: "ja",
    }));
    target.dispatchEvent(new Event("pointerup"));
    disarm();
    expect(status).not.toHaveBeenCalled();
  });

  it("drops a request aborted while its model packs download, never translating it", async () => {
    const { translator, asked } = hostWith("packs");
    const states = fakeStates({ "mt-en-ja": downloading(0, 10) });
    const { backend } = setup(translator, states);
    const queue = createTranslationQueue((from, to) =>
      backend.create(from, to),
    );
    const abort = new AbortController();
    const answer = queue.translate("A cat.", "subtitle", EN_JA, {
      signal: abort.signal,
    });
    await settle();
    abort.abort();
    states.set({ "mt-en-ja": ready(10) });
    await expect(answer).resolves.toBeUndefined();
    await settle();
    expect(asked).toEqual([]);
    // The packs being there, the next request is translated.
    await expect(queue.translate("A dog.", "subtitle", EN_JA)).resolves.toBe(
      "ja(A dog.)",
    );
  });
});
