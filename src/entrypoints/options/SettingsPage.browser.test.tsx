import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-preact";
import type {
  CloudStatus,
  HistoryStatus,
  ImportResult,
  PackStatus,
  Request,
  SyncStatus,
} from "../../messaging/protocol";
import type { TranslatorStatus } from "../../core/app-host";
import type { SyncPlace } from "../../core/browser-env";
import type { PackState, PackStates } from "../../core/packs/state";
import type { SupportLinks } from "../../core/links";
import { mergeSettings, type Settings } from "../../core/settings";
import type { ExplanationProvider } from "../../core/explain/provider";
import type { LanguagePair } from "../../core/packs/pairs";
import { fakeExplanationProvider } from "../../testing/explain";
import en from "../../i18n/locales/en.json";
import { SettingsPage, type SettingsDeps } from "./SettingsPage";
import { heldWrites, listeners, settingsListeners } from "../../testing/stubs";
import { fixedTouchMode } from "../../testing/touch";

const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const SYNC: SyncStatus = {
  enabled: true,
  termsInCloud: false,
  bytesUsed: 41 * 1024,
  quotaBytes: 102_400,
  lastSavedAt: NOW - 2 * MINUTE,
  syncedCount: 10,
  localOnlyCount: 0,
  droppedKnownCount: 0,
};

/** Connected to Google Drive, saved 2 minutes ago, checked 1 minute ago. */
const CONNECTED: CloudStatus = {
  available: ["googleDrive"],
  provider: "googleDrive",
  lastSavedAt: NOW - 2 * MINUTE,
  lastCheckedAt: NOW - MINUTE,
  bytes: 1.4 * 1024 * 1024,
  devices: 3,
};
/** Not connected, in a build that can connect to Google Drive. */
const CAN_CONNECT: CloudStatus = {
  available: ["googleDrive"],
  bytes: 0,
  devices: 0,
};

interface FakeOptions {
  settings?: Partial<Settings>;
  /** What `cloudStatus` answers first (default: a build with no provider). */
  cloud?: CloudStatus;
  /** The on-device AI (default: none, as in Firefox). */
  explainProvider?: ExplanationProvider;
  lastExport?: number | null;
  importResult?: ImportResult | Error;
  history?: HistoryStatus;
  /** What `packStatus` answers for the settings (default: `japanese()`). */
  packStatus?: (settings: Settings) => PackStatus;
  /** The Support Langle links (default: none set). */
  links?: Partial<SupportLinks>;
  /** Where the data is kept (default: Chrome sync). */
  place?: SyncPlace;
  /** The phone layout (default: the page's own touch mode, off in tests). */
  phone?: boolean;
  /** The phone app's `appHost` exists (default: no). */
  app?: boolean;
}

const MB = 1024 * 1024;
const HISTORY: HistoryStatus = { bytes: 18 * MB, cap: 50 * MB, pages: 1240 };

function fake(options: FakeOptions = {}) {
  let settings = mergeSettings(options.settings ?? {});
  let lastExport = options.lastExport ?? null;
  let history = options.history ?? HISTORY;
  let cloud: CloudStatus = options.cloud ?? {
    available: [],
    bytes: 0,
    devices: 0,
  };
  const settingsWatchers = settingsListeners(settings);
  const packWatchers = listeners<PackStates>();
  const removed = new Set<string>();
  const sent: Request[] = [];
  const downloads: { name: string; text: string }[] = [];
  const deps: SettingsDeps = {
    send: (async (request: Request) => {
      sent.push(request);
      switch (request.type) {
        case "getSettings":
          return settings;
        case "setSettings":
          settings = mergeSettings(request.patch, settings);
          settingsWatchers.emit(settings);
          return settings;
        case "syncStatus":
          return { ...SYNC, enabled: settings.syncEnabled };
        case "cloudStatus":
          return cloud;
        case "cloudConnect":
          cloud = { ...CONNECTED, provider: request.provider };
          settings = mergeSettings(
            { cloudProvider: request.provider },
            settings,
          );
          settingsWatchers.emit(settings);
          return null;
        case "cloudDisconnect":
          cloud = { available: cloud.available, bytes: 0, devices: 0 };
          settings = mergeSettings({ cloudProvider: "none" }, settings);
          settingsWatchers.emit(settings);
          return null;
        case "lastExport":
          return lastExport;
        case "exportJson":
          lastExport = NOW;
          return '{"format":"langle-export"}';
        case "historyStatus":
          return history;
        case "clearHistory":
          history = { ...history, bytes: 0, pages: 0 };
          return null;
        case "packStatus": {
          const status = options.packStatus?.(settings) ?? japanese();
          return {
            ...status,
            others: status.others.filter((o) => !removed.has(o.pack)),
          };
        }
        case "retryPacks":
          return null;
        case "removePack":
          removed.add(request.pack);
          return null;
        case "importJson": {
          const result = options.importResult ?? {
            terms: 3,
            sources: 1,
            occurrences: 2,
          };
          if (result instanceof Error) throw result;
          return result;
        }
        default:
          throw new Error(`unexpected ${request.type}`);
      }
    }) as SettingsDeps["send"],
    watchSettings: settingsWatchers.watch,
    watchPackState: packWatchers.watch,
    env: {
      name: "Chrome",
      sync: options.place ?? { kind: "browser", name: "Chrome sync" },
      features: { fileSystemAccess: true, appHost: options.app ?? false },
    },
    ...(options.phone && { touch: fixedTouchMode(true) }),
    ...(options.explainProvider && {
      explainProvider: options.explainProvider,
    }),
    version: "0.1.0",
    noticesUrl: "chrome-extension://langle/notices.html",
    links: {
      coffee: "",
      feedback: "",
      sponsor: "",
      review: "",
      ...options.links,
    },
    now: () => NOW,
    saveFile: (name, text) => void downloads.push({ name, text }),
    refreshMs: 60_000,
  };
  return {
    deps,
    sent,
    downloads,
    settings: () => settings,
    changeSettings(patch: Partial<Settings>) {
      settings = mergeSettings(patch, settings);
      settingsWatchers.emit(settings);
    },
    /** The background writes `packState`. */
    setPackStates(states: PackStates) {
      packWatchers.emit(states);
    },
  };
}

const MB_ = 1024 * 1024;
const ready = (total: number): PackState => ({
  state: "ready",
  received: total,
  total,
});
/** The Spanish pair's packs (3.0 and 3.4 MB), downloaded, in these states. */
const spanish = (
  es: PackState,
  esEn: PackState,
  others: PackStatus["others"] = [],
): PackStatus => ({
  pair: {
    packs: [
      { pack: "es", size: 3 * MB_, ...es },
      { pack: "es-en", size: 3.4 * MB_, ...esEn },
    ],
  },
  others,
});
/** The default pair's packs (English → Japanese, 32 MB), downloaded. */
const japanese = (others: PackStatus["others"] = []): PackStatus => ({
  pair: {
    packs: [
      { pack: "en", size: 6 * MB_, ...ready(6 * MB_) },
      { pack: "en-ja", size: 7 * MB_, ...ready(7 * MB_) },
      { pack: "en-defs", size: 19 * MB_, ...ready(19 * MB_) },
    ],
  },
  others,
});

beforeAll(async () => {
  await page.viewport(1200, 800);
});
afterEach(() => {
  cleanup();
  scrollTo(0, 0);
  vi.unstubAllGlobals();
});

async function open(options: FakeOptions = {}) {
  const f = fake(options);
  const screen = await render(<SettingsPage deps={f.deps} />);
  await expect
    .element(screen.getByRole("heading", { name: "About" }))
    .toBeVisible();
  return { ...f, screen };
}

const optionLabels = (select: Element) =>
  [...(select as HTMLSelectElement).options].map((o) => o.label);

const setSettingsPatches = (sent: Request[]) =>
  sent.flatMap((r) => (r.type === "setSettings" ? [r.patch] : []));

const section = (screen: Awaited<ReturnType<typeof render>>, name: string) =>
  screen.getByRole("region", { name });

describe("SettingsPage", () => {
  it("has a section and a nav link for each group, the first one current", async () => {
    const { screen } = await open();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    for (const name of [
      "Languages",
      "Appearance",
      "New-word level",
      "Highlighting",
      "Dictionaries and AI",
      "Video subtitles",
      "Sites",
      "Sentence history",
      "Sync and backup",
      "About",
    ]) {
      await expect.element(section(screen, name)).toBeInTheDocument();
      await expect.element(nav.getByRole("link", { name })).toBeInTheDocument();
    }
    await expect
      .element(nav.getByRole("link", { name: "Languages" }))
      .toHaveAttribute("aria-current", "true");
  });

  it("marks the section scrolled into view in the nav", async () => {
    const { screen } = await open();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    document.getElementById("video")!.scrollIntoView();
    await expect
      .element(nav.getByRole("link", { name: "Video subtitles" }))
      .toHaveAttribute("aria-current", "true");
    await expect
      .element(nav.getByRole("link", { name: "Languages" }))
      .not.toHaveAttribute("aria-current");
  });

  it("offers only the languages that exist", async () => {
    const { screen } = await open();
    const learning = screen.getByRole("combobox", {
      name: /Learning language/,
    });
    await expect.element(learning).toHaveDisplayValue("English");
    expect(optionLabels(learning.element())).toEqual([
      "English",
      "Spanish (Español)",
      "French (Français)",
      "German (Deutsch)",
    ]);
    const native = screen.getByRole("combobox", { name: /Your language/ });
    await expect.element(native).toHaveDisplayValue("Japanese (日本語)");
    expect(optionLabels(native.element())).toEqual([
      "Japanese (日本語)",
      "Spanish (Español)",
      "Portuguese (Português)",
      "Russian (Русский)",
      "French (Français)",
      "German (Deutsch)",
      "Chinese, Simplified (简体中文)",
      "Italian (Italiano)",
      "Polish (Polski)",
      "Thai (ภาษาไทย)",
      "Hindi (हिन्दी)",
      "Arabic (العربية)",
      "Indonesian (Bahasa Indonesia)",
      "Turkish (Türkçe)",
      "Korean (한국어)",
    ]);
    const ui = screen.getByRole("combobox", { name: /Interface language/ });
    await expect.element(ui).toHaveDisplayValue("English");
    expect(optionLabels(ui.element())).toEqual(["English"]);
  });

  it("offers as your language only those with a dictionary for the learning language", async () => {
    const { screen } = await open({
      settings: { learningLang: "es", nativeLang: "en" },
    });
    await expect
      .element(screen.getByRole("combobox", { name: /Learning language/ }))
      .toHaveDisplayValue("Spanish (Español)");
    const native = screen.getByRole("combobox", { name: /Your language/ });
    await expect.element(native).toHaveDisplayValue("English");
    expect(optionLabels(native.element())).toEqual(["English"]);
    await expect
      .element(
        screen.getByRole("slider", {
          name: "Treat the 3,000 most common Spanish words as known",
        }),
      )
      .toBeVisible();
  });

  it("offers French → English, with French words in the level", async () => {
    const { screen } = await open({
      settings: { learningLang: "fr", nativeLang: "en" },
    });
    await expect
      .element(screen.getByRole("combobox", { name: /Learning language/ }))
      .toHaveDisplayValue("French (Français)");
    const native = screen.getByRole("combobox", { name: /Your language/ });
    expect(optionLabels(native.element())).toEqual(["English"]);
    await expect
      .element(
        screen.getByRole("slider", {
          name: "Treat the 3,000 most common French words as known",
        }),
      )
      .toBeVisible();
  });

  it("offers German → English and German → French, with German words in the level", async () => {
    const { screen } = await open({
      settings: { learningLang: "de", nativeLang: "en" },
    });
    await expect
      .element(screen.getByRole("combobox", { name: /Learning language/ }))
      .toHaveDisplayValue("German (Deutsch)");
    const native = screen.getByRole("combobox", { name: /Your language/ });
    expect(optionLabels(native.element())).toEqual([
      "English",
      "French (Français)",
    ]);
    await expect
      .element(
        screen.getByRole("slider", {
          name: "Treat the 3,000 most common German words as known",
        }),
      )
      .toBeVisible();
  });

  it("changes your language with the learning language, in one change", async () => {
    const f = await open();
    const learning = f.screen.getByRole("combobox", {
      name: /Learning language/,
    });
    await userEvent.selectOptions(learning, "Spanish (Español)");
    const native = f.screen.getByRole("combobox", { name: /Your language/ });
    await expect.element(native).toHaveDisplayValue("English");
    expect(setSettingsPatches(f.sent)).toEqual([
      { learningLang: "es", nativeLang: "en" },
    ]);
    await expect.poll(() => f.settings().nativeLang).toBe("en");
    await userEvent.selectOptions(learning, "English");
    await expect.element(native).toHaveDisplayValue("Japanese (日本語)");
    expect(setSettingsPatches(f.sent)).toEqual([
      { learningLang: "es", nativeLang: "en" },
      { learningLang: "en", nativeLang: "ja" },
    ]);
  });

  it("keeps the last language chosen while the choices before it are stored", async () => {
    const f = fake();
    const writes = heldWrites(f.deps.send);
    const screen = await render(
      <SettingsPage deps={{ ...f.deps, send: writes.send }} />,
    );
    const learning = screen.getByRole("combobox", {
      name: /Learning language/,
    });
    await expect.element(learning).toBeVisible();
    for (const value of ["de", "en"])
      await userEvent.selectOptions(learning, value);
    const native = screen.getByRole("combobox", { name: /Your language/ });
    const offered = optionLabels(native.element());

    // German is stored while English is still on its way.
    await writes.storeNext();
    expect((learning.element() as HTMLSelectElement).value).toBe("en");
    expect(optionLabels(native.element())).toEqual(offered);

    await writes.storeNext();
    expect((learning.element() as HTMLSelectElement).value).toBe("en");
    expect(f.settings()).toMatchObject({
      learningLang: "en",
      nativeLang: "ja",
    });
  });

  it("loses no site added while the ones before it are stored", async () => {
    const f = fake();
    const writes = heldWrites(f.deps.send);
    const screen = await render(
      <SettingsPage deps={{ ...f.deps, send: writes.send }} />,
    );
    const add = async (host: string) => {
      const button = screen.getByRole("button", { name: "+ Add site" });
      if (button.query()) await userEvent.click(button);
      const input = screen.getByRole("textbox", {
        name: en["settings.sites.addInput"],
      });
      await userEvent.fill(input, host);
      await userEvent.keyboard("{Enter}");
    };
    await expect
      .element(screen.getByRole("button", { name: "+ Add site" }))
      .toBeVisible();
    await add("a.com");
    await add("b.com");
    await writes.storeNext();
    await add("c.com");
    while (writes.waiting()) await writes.storeNext();
    expect(f.settings().neverRunOn).toEqual(["a.com", "b.com", "c.com"]);
  });

  it("starts the translator's model download when a language is chosen", async () => {
    const created: string[] = [];
    vi.stubGlobal("Translator", {
      availability: async (pair: {
        sourceLanguage: string;
        targetLanguage: string;
      }) => (pair.sourceLanguage === "es" ? "available" : "downloadable"),
      create: async (pair: {
        sourceLanguage: string;
        targetLanguage: string;
      }) => {
        created.push(`${pair.sourceLanguage}>${pair.targetLanguage}`);
        return { translate: async (text: string) => text, destroy() {} };
      },
    });
    const f = await open({
      settings: { learningLang: "es", nativeLang: "en" },
    });
    const learning = f.screen.getByRole("combobox", {
      name: /Learning language/,
    });
    expect(created).toEqual([]);
    await userEvent.selectOptions(learning, "English");
    // English → Japanese: the definitions' model is the subtitles' one.
    await expect.poll(() => created).toEqual(["en>ja"]);
    await userEvent.selectOptions(learning, "Spanish (Español)");
    // Spanish → English is there already, and nothing translates into English.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(created).toEqual(["en>ja"]);
  });

  describe("Language data", () => {
    const SPANISH = { learningLang: "es", nativeLang: "en" };
    const dataRow = (screen: Awaited<ReturnType<typeof render>>) =>
      section(screen, "Languages").getByText("Language data");

    it("shows the chosen pair's size and its download's share, then Downloaded", async () => {
      const f = await open({
        settings: SPANISH,
        packStatus: () =>
          spanish(ready(3 * MB_), {
            state: "downloading",
            received: 0.4 * MB_,
            total: 3.4 * MB_,
          }),
      });
      const languages = section(f.screen, "Languages");
      await expect.element(dataRow(f.screen)).toBeVisible();
      await expect
        .element(
          languages.getByText(
            "Words and dictionaries Langle keeps on this device.",
          ),
        )
        .toBeVisible();
      await expect
        .element(languages.getByText("Spanish → English"))
        .toBeVisible();
      await expect.element(languages.getByText("6.4 MB")).toBeVisible();
      await expect
        .element(languages.getByText("Downloading · 53%"))
        .toBeVisible();

      f.setPackStates({ "es-en": ready(3.4 * MB_) });
      await expect.element(languages.getByText("Downloaded")).toBeVisible();
      expect(languages.getByText(/Downloading/).query()).toBeNull();
    });

    it("shows an update downloading while the older data is in use", async () => {
      const f = await open({
        settings: SPANISH,
        packStatus: () =>
          spanish(ready(3 * MB_), {
            state: "downloading",
            received: 1.7 * MB_,
            total: 3.4 * MB_,
            updating: true,
          }),
      });
      await expect
        .element(section(f.screen, "Languages").getByText("Downloading · 73%"))
        .toBeVisible();
    });

    it("offers Download while Apple's translator waits for consent, which shows the sheet again (iOS)", async () => {
      let status: TranslatorStatus = "download";
      const sheets: string[] = [];
      vi.stubGlobal("appHost", {
        translator: { models: "system" },
        translatorStatus: async () => status,
        prepareTranslator: async (pair: { from: string; to: string }) => {
          sheets.push(`${pair.from}>${pair.to}`);
          status = "ready";
          return status;
        },
      });
      const f = await open({ app: true });
      const languages = section(f.screen, "Languages");
      await expect
        .element(languages.getByText("32.0 MB · Translator not downloaded"))
        .toBeVisible();
      expect(languages.getByText("Downloaded").query()).toBeNull();

      await languages.getByRole("button", { name: "Download" }).click();
      await expect.element(languages.getByText("Downloaded")).toBeVisible();
      await expect.element(languages.getByText("32.0 MB")).toBeVisible();
      expect(
        languages.getByRole("button", { name: "Download" }).query(),
      ).toBeNull();
      // English → Japanese: the definitions' translator is the pages' one.
      expect(sheets).toEqual(["en>ja"]);
    });

    it("keeps the usual states where no consent is waited for (Android, the browser)", async () => {
      vi.stubGlobal("appHost", {
        translator: { models: "packs" },
        translatorStatus: async () => "packs",
        prepareTranslator: async () => "packs",
      });
      const f = await open({ app: true });
      const languages = section(f.screen, "Languages");
      await expect.element(languages.getByText("Downloaded")).toBeVisible();
      await expect.element(languages.getByText("32.0 MB")).toBeVisible();
      expect(
        languages.getByText(/Translator not downloaded/).query(),
      ).toBeNull();
    });

    it("says the download failed, and Retry asks the background to try again", async () => {
      const f = await open({
        settings: SPANISH,
        packStatus: () =>
          spanish(ready(3 * MB_), {
            state: "failed",
            received: 0,
            total: 3.4 * MB_,
            error: "HTTP 404",
          }),
      });
      const languages = section(f.screen, "Languages");
      await expect
        .element(languages.getByText("Couldn't download"))
        .toBeVisible();
      await languages.getByRole("button", { name: "Retry" }).click();
      expect(f.sent).toContainEqual({ type: "retryPacks" });
      f.setPackStates({
        "es-en": { state: "downloading", received: 0, total: 3.4 * MB_ },
      });
      await expect
        .element(languages.getByText("Downloading · 46%"))
        .toBeVisible();
    });

    it("lists data the chosen pair does not use, by its pair, and Remove deletes its packs", async () => {
      const f = await open({
        packStatus: () =>
          japanese([
            { pack: "es", size: 3 * MB_ },
            { pack: "es-en", size: 6.1 * MB_ },
          ]),
      });
      const languages = section(f.screen, "Languages");
      await expect.element(dataRow(f.screen)).toBeVisible();
      await expect
        .element(languages.getByText("Spanish → English"))
        .toBeVisible();
      await expect
        .element(languages.getByText("Not used by your languages now · 9.1 MB"))
        .toBeVisible();
      await expect
        .element(languages.getByText("English → Japanese"))
        .toBeVisible();

      await languages
        .getByRole("button", { name: "Remove Spanish → English data" })
        .click();
      await expect
        .element(languages.getByText("Spanish → English"))
        .not.toBeInTheDocument();
      // The chosen pair's data stays.
      await expect.element(languages.getByText("Downloaded")).toBeVisible();
      expect(
        f.sent.flatMap((r) => (r.type === "removePack" ? [r.pack] : [])),
      ).toEqual(["es", "es-en"]);
    });

    it("lists a translation model pack with its pair's other data, and Remove deletes both (Android)", async () => {
      vi.stubGlobal("appHost", {
        translator: { models: "packs" },
        translatorStatus: async () => "ready",
        prepareTranslator: async () => "ready",
      });
      const f = await open({
        app: true,
        settings: SPANISH,
        packStatus: () =>
          spanish(ready(3 * MB_), ready(3.4 * MB_), [
            { pack: "en-ja", size: 9.1 * MB_ },
            { pack: "mt-en-ja", size: 47.3 * MB_ },
          ]),
      });
      const languages = section(f.screen, "Languages");
      await expect
        .element(
          languages.getByText("Not used by your languages now · 56.4 MB"),
        )
        .toBeVisible();
      expect(languages.getByText("mt-en-ja").query()).toBeNull();

      await languages
        .getByRole("button", { name: "Remove English → Japanese data" })
        .click();
      expect(
        f.sent.flatMap((r) => (r.type === "removePack" ? [r.pack] : [])),
      ).toEqual(["en-ja", "mt-en-ja"]);
    });

    it("lists other data under the chosen pair's", async () => {
      const f = await open({
        settings: SPANISH,
        packStatus: () =>
          spanish(ready(3 * MB_), ready(3.4 * MB_), [
            { pack: "en-ja", size: 9.1 * MB_ },
          ]),
      });
      const languages = section(f.screen, "Languages");
      await expect.element(languages.getByText("Downloaded")).toBeVisible();
      const chosen = languages.getByText("Spanish → English").element();
      const other = languages.getByText("English → Japanese").element();
      expect(
        chosen.compareDocumentPosition(other) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("shows the default pair's data, and asks again for another pair", async () => {
      const f = await open({
        packStatus: (s) =>
          s.learningLang === "es"
            ? spanish(ready(3 * MB_), {
                state: "downloading",
                received: 0,
                total: 3.4 * MB_,
              })
            : japanese(),
      });
      const languages = section(f.screen, "Languages");
      await expect
        .element(languages.getByText("English → Japanese"))
        .toBeVisible();
      await expect.element(languages.getByText("32.0 MB")).toBeVisible();
      await expect.element(languages.getByText("Downloaded")).toBeVisible();
      await userEvent.selectOptions(
        f.screen.getByRole("combobox", { name: /Learning language/ }),
        "Spanish (Español)",
      );
      await expect
        .element(languages.getByText("Downloading · 46%"))
        .toBeVisible();
      expect(languages.getByText("English → Japanese").query()).toBeNull();
    });
  });

  it("sets the new-word level with the slider", async () => {
    const f = await open();
    const slider = f.screen.getByRole("slider", {
      name: "Treat the 3,000 most common English words as known",
    });
    await expect.element(slider).toHaveValue("3000");
    const input = slider.element() as HTMLInputElement;
    input.value = "5500";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await expect
      .element(
        f.screen.getByText(
          "Treat the 5,500 most common English words as known",
        ),
      )
      .toBeVisible();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await expect.poll(() => f.settings().knownLevel).toBe(5500);
  });

  it("switches highlight categories and what happens to unsaved words", async () => {
    const f = await open();
    const newWords = f.screen.getByRole("switch", {
      name: "Highlight New words",
    });
    await expect.element(newWords).not.toBeChecked();
    await newWords.click();
    await expect.element(newWords).toBeChecked();
    expect(f.settings().highlight.new).toBe(true);

    const unsaved = f.screen.getByRole("group", {
      name: "New words you didn't save",
    });
    const keep = unsaved.getByRole("button", { name: "Keep as New" });
    const known = unsaved.getByRole("button", { name: "Mark as Known" });
    await expect.element(keep).toHaveAttribute("aria-pressed", "true");
    await expect.element(known).toHaveAttribute("aria-pressed", "false");
    await known.click();
    await expect.poll(() => f.settings().unsavedAtEnd).toBe("known");
    await expect.element(known).toHaveAttribute("aria-pressed", "true");
    await expect.element(keep).toHaveAttribute("aria-pressed", "false");
  });

  it("picks the theme, System by default", async () => {
    const f = await open();
    const theme = f.screen.getByRole("group", { name: "Theme" });
    const system = theme.getByRole("button", { name: "System" });
    const dark = theme.getByRole("button", { name: "Dark" });
    await expect.element(system).toHaveAttribute("aria-pressed", "true");
    await expect.element(dark).toHaveAttribute("aria-pressed", "false");
    await dark.click();
    await expect.poll(() => f.settings().theme).toBe("dark");
    await expect.element(dark).toHaveAttribute("aria-pressed", "true");
    await expect.element(system).toHaveAttribute("aria-pressed", "false");
  });

  it("follows settings changed elsewhere", async () => {
    const f = await open();
    const known = f.screen.getByRole("switch", {
      name: "Highlight Known words",
    });
    await expect.element(known).not.toBeChecked();
    f.changeSettings({
      highlight: { new: false, learning: true, known: true },
      knownLevel: 8000,
    });
    await expect.element(known).toBeChecked();
    await expect
      .element(
        f.screen.getByText(
          "Treat the 8,000 most common English words as known",
        ),
      )
      .toBeVisible();
  });

  it("changes a step key to the next key pressed, swapping with the action that had it", async () => {
    const f = await open();
    const replay = f.screen.getByRole("button", {
      name: "Replay sentence key: S",
    });
    await replay.click();
    await expect.element(replay).toHaveTextContent("Press a key");
    await userEvent.keyboard("r");
    await expect
      .element(f.screen.getByRole("button", { name: "Replay sentence key: R" }))
      .toBeVisible();
    expect(f.settings().stepKeys).toMatchObject({ replay: "r" });
    const next = f.screen.getByRole("button", { name: "Next sentence key: D" });
    await next.click();
    await userEvent.keyboard("a");
    await expect
      .element(
        f.screen.getByRole("button", { name: "Previous sentence key: D" }),
      )
      .toBeVisible();
    expect(f.settings().stepKeys).toEqual({
      on: true,
      previous: "d",
      replay: "r",
      next: "a",
    });
  });

  it("keeps a step key on Escape, and turns the keys off", async () => {
    const f = await open();
    const previous = f.screen.getByRole("button", {
      name: "Previous sentence key: A",
    });
    await previous.click();
    await userEvent.keyboard("{Escape}");
    await expect.element(previous).toHaveTextContent("A");
    const keys = f.screen.getByRole("switch", { name: "Keyboard shortcuts" });
    await keys.click();
    await expect.element(keys).toHaveAttribute("aria-checked", "false");
    await expect.element(previous).toBeDisabled();
    expect(f.settings().stepKeys.on).toBe(false);
  });

  it("turns dictionaries off and on", async () => {
    const f = await open();
    const reverso = f.screen.getByRole("checkbox", { name: "Reverso Context" });
    await expect.element(reverso).toBeChecked();
    await reverso.click();
    await expect.element(reverso).not.toBeChecked();
    expect(f.settings().dictionaries.reverso).toBe(false);
  });

  describe("On-device AI", () => {
    const AI_TEXT =
      "Chrome's built-in AI explains a word in the sentence you met it in, in the dictionary window. It runs on this device.";
    const UNKNOWN = "Explain words the dictionary doesn't have";

    it("downloads the model: Download, Downloading with its percentage, Ready", async () => {
      let progress: ((loaded: number) => void) | undefined;
      let finish: (() => void) | undefined;
      const { provider } = fakeExplanationProvider({
        availability: "downloadable",
      });
      const asked: LanguagePair[] = [];
      const availability = provider.availability.bind(provider);
      provider.availability = (pair) => {
        asked.push(pair);
        return availability(pair);
      };
      provider.download = (_pair, onProgress) => {
        progress = onProgress;
        return new Promise<void>((resolve) => (finish = resolve));
      };
      const f = await open({ explainProvider: provider });
      const ai = section(f.screen, "Dictionaries and AI");
      await expect.element(ai.getByText("On-device AI")).toBeVisible();
      await expect.element(ai.getByText(AI_TEXT)).toBeVisible();
      expect(asked).toEqual([{ learning: "en", native: "ja" }]);

      await ai.getByRole("button", { name: "Download" }).click();
      await expect
        .element(ai.getByRole("status"))
        .toHaveTextContent("Downloading0%");
      progress!(0.42);
      await expect
        .element(ai.getByRole("status"))
        .toHaveTextContent("Downloading42%");
      finish!();
      await expect.element(ai.getByText("Ready")).toBeVisible();
      expect(ai.getByRole("button", { name: "Download" }).query()).toBeNull();
    });

    it("reads the model again for another pair, and shows Ready when it is there", async () => {
      const { provider } = fakeExplanationProvider();
      const f = await open({ explainProvider: provider });
      const ai = section(f.screen, "Dictionaries and AI");
      await expect.element(ai.getByText("Ready")).toBeVisible();
      provider.availability = async (pair) =>
        pair.native === "pt" ? "unavailable" : "ready";
      f.changeSettings({ nativeLang: "pt" });
      await expect.poll(() => ai.getByText("On-device AI").query()).toBeNull();
      expect(ai.getByRole("switch", { name: UNKNOWN }).query()).toBeNull();
    });

    it("switches explaining words without an entry, on by default", async () => {
      const { provider } = fakeExplanationProvider();
      const f = await open({ explainProvider: provider });
      const ai = section(f.screen, "Dictionaries and AI");
      const unknown = ai.getByRole("switch", { name: UNKNOWN });
      await expect.element(unknown).toHaveAttribute("aria-checked", "true");
      await expect
        .element(
          ai.getByText(
            "As soon as the dictionary window opens. Words with an entry are explained when you press Explain in context.",
          ),
        )
        .toBeVisible();
      await unknown.click();
      await expect.element(unknown).toHaveAttribute("aria-checked", "false");
      expect(f.settings().explainUnknown).toBe(false);
      expect(setSettingsPatches(f.sent)).toContainEqual({
        explainUnknown: false,
      });
    });

    it("shows no rows where the pair cannot run, nor without a provider", async () => {
      const { provider } = fakeExplanationProvider({
        availability: "unavailable",
      });
      const f = await open({ explainProvider: provider });
      await expect
        .element(section(f.screen, "Dictionaries and AI"))
        .toBeVisible();
      expect(f.screen.getByText("On-device AI").query()).toBeNull();
      expect(f.screen.getByText(UNKNOWN).query()).toBeNull();
      cleanup();

      const without = await open();
      expect(without.screen.getByText("On-device AI").query()).toBeNull();
      expect(without.screen.getByText(/built-in AI/).query()).toBeNull();
      expect(without.screen.getByText(UNKNOWN).query()).toBeNull();
    });
  });

  it("picks the subtitle position and the translation switches", async () => {
    const f = await open();
    const group = f.screen.getByRole("group", { name: "Subtitle position" });
    const inVideo = group.getByRole("button", { name: /In the video/ });
    const below = group.getByRole("button", { name: /Below the video/ });
    await expect.element(inVideo).toHaveAttribute("aria-pressed", "true");
    await below.click();
    await expect.element(below).toHaveAttribute("aria-pressed", "true");
    await expect.element(inVideo).toHaveAttribute("aria-pressed", "false");
    expect(f.settings().subtitlePosition).toBe("belowVideo");

    await f.screen
      .getByRole("switch", { name: "Show translation in the transcript" })
      .click();
    await expect.poll(() => f.settings().transcriptTranslation).toBe(false);
    expect(f.settings().subtitleTranslation).toBe(true);
  });

  describe("sites", () => {
    it("switches Langle off for a kind of site", async () => {
      const f = await open();
      await f.screen
        .getByRole("switch", { name: "Run Langle on Netflix" })
        .click();
      await expect.poll(() => f.settings().sites.netflix).toBe(false);
      await expect
        .element(
          f.screen.getByRole("switch", {
            name: "Run Langle on Articles on other sites",
          }),
        )
        .toBeChecked();
    });

    it("switches the YouTube comments on their own", async () => {
      const f = await open();
      const comments = f.screen.getByRole("switch", {
        name: "Run Langle on YouTube comments",
      });
      await expect.element(comments).toBeChecked();
      await expect
        .element(
          f.screen.getByText(
            "Highlights and dictionary in the comments under a video.",
          ),
        )
        .toBeVisible();
      await comments.click();
      await expect.poll(() => f.settings().sites.youtubeComments).toBe(false);
      expect(f.settings().sites.youtube).toBe(true);
    });

    it("lists, adds and removes sites it never runs on", async () => {
      const f = await open({ settings: { neverRunOn: ["mail.google.com"] } });
      const sites = section(f.screen, "Sites");
      await expect.element(sites.getByText("mail.google.com")).toBeVisible();

      await sites.getByRole("button", { name: "+ Add site" }).click();
      const input = sites.getByRole("textbox", {
        name: "Site to never run on",
      });
      await expect.element(input).toHaveFocus();
      await input.fill("not a site");
      await userEvent.keyboard("{Enter}");
      await expect
        .element(sites.getByText("Enter a site such as example.com"))
        .toBeVisible();
      expect(f.settings().neverRunOn).toEqual(["mail.google.com"]);

      await input.fill("https://Docs.example.com/page");
      await userEvent.keyboard("{Enter}");
      await expect.element(sites.getByText("docs.example.com")).toBeVisible();
      expect(f.settings().neverRunOn).toEqual([
        "mail.google.com",
        "docs.example.com",
      ]);
      expect(input.query()).toBeNull();

      await sites
        .getByRole("button", { name: "Remove mail.google.com" })
        .click();
      await expect
        .poll(() => f.settings().neverRunOn)
        .toEqual(["docs.example.com"]);
    });

    it("cancels adding a site with Escape", async () => {
      const f = await open();
      const sites = section(f.screen, "Sites");
      await sites.getByRole("button", { name: "+ Add site" }).click();
      await sites
        .getByRole("textbox", { name: "Site to never run on" })
        .fill("example.com");
      await userEvent.keyboard("{Escape}");
      await expect
        .element(sites.getByRole("button", { name: "+ Add site" }))
        .toBeVisible();
      expect(f.settings().neverRunOn).toEqual([]);
    });
  });

  describe("sentence history", () => {
    it("comes after Sites in the nav", async () => {
      const { screen } = await open();
      const links = screen
        .getByRole("navigation", { name: "Settings sections" })
        .getByRole("link")
        .elements()
        .map((a) => a.textContent);
      expect(
        links.slice(links.indexOf("Sites"), links.indexOf("Sites") + 2),
      ).toEqual(["Sites", "Sentence history"]);
    });

    it("shows the switch, the space used and the pages kept", async () => {
      const f = await open();
      const history = section(f.screen, "Sentence history");
      await expect
        .element(
          history.getByText(
            "Sentences from pages and videos you open with Langle on, kept on this device so the dictionary can show where you met a word before you saved it.",
          ),
        )
        .toBeVisible();
      await expect
        .element(
          history.getByText(
            "Never synced. Pages on your Never run on list are not kept.",
          ),
        )
        .toBeVisible();
      await expect
        .element(history.getByRole("switch", { name: "Keep sentence history" }))
        .toBeChecked();
      await expect.element(history.getByText("Space used")).toBeVisible();
      await expect.element(history.getByText("18 MB of 50 MB")).toBeVisible();
      await expect
        .element(
          history.getByText(
            "1,240 pages and videos · the oldest are removed first when space runs out",
          ),
        )
        .toBeVisible();
      await expect
        .element(history.getByText("Saved words and their sources stay."))
        .toBeVisible();
    });

    it("says nothing is kept when there are no pages", async () => {
      const f = await open({ history: { bytes: 0, cap: 50 * MB, pages: 0 } });
      const history = section(f.screen, "Sentence history");
      await expect.element(history.getByText("Nothing kept yet")).toBeVisible();
      await expect.element(history.getByText("0 MB of 50 MB")).toBeVisible();
    });

    it("counts one page alone, and a little data as 1 MB of the bar", async () => {
      const f = await open({
        history: { bytes: 2048, cap: 50 * MB, pages: 1 },
      });
      const history = section(f.screen, "Sentence history");
      await expect
        .element(
          history.getByText(
            "1 page or video · the oldest are removed first when space runs out",
          ),
        )
        .toBeVisible();
      await expect.element(history.getByText("1 MB of 50 MB")).toBeVisible();
      const fill = history
        .element()
        .querySelector<HTMLElement>('[aria-hidden="true"] > span')!;
      expect(fill.style.width).toBe("1%");
    });

    it("turns sentence history off and on", async () => {
      const f = await open();
      const toggle = section(f.screen, "Sentence history").getByRole("switch", {
        name: "Keep sentence history",
      });
      await toggle.click();
      await expect.element(toggle).not.toBeChecked();
      await expect.poll(() => f.settings().sentenceHistory).toBe(false);
      expect(setSettingsPatches(f.sent)).toEqual([{ sentenceHistory: false }]);
    });

    it("clears the history and shows that nothing is kept", async () => {
      const f = await open();
      const history = section(f.screen, "Sentence history");
      await expect.element(history.getByText(/^1,240 pages/)).toBeVisible();
      await history.getByRole("button", { name: "Clear" }).click();
      await expect.element(history.getByText("Nothing kept yet")).toBeVisible();
      await expect.element(history.getByText("0 MB of 50 MB")).toBeVisible();
      expect(f.sent).toContainEqual({ type: "clearHistory" });
    });
  });

  describe("sync and backup", () => {
    it("names the browser's sync and shows the space used and the last save", async () => {
      const f = await open();
      const sync = section(f.screen, "Sync and backup");
      const toggle = sync.getByRole("switch", {
        name: "Sync word status with Chrome sync",
      });
      await expect.element(toggle).toBeChecked();
      await expect.element(sync.getByText("41 KB of 100 KB")).toBeVisible();
      await expect
        .element(sync.getByText("Last saved 2 minutes ago"))
        .toBeVisible();

      await toggle.click();
      await expect.element(toggle).not.toBeChecked();
      expect(f.settings().syncEnabled).toBe(false);
      await expect.element(sync.getByText("Sync is off")).toBeVisible();
      expect(f.screen.getByText(/Synced/).query()).toBeNull();
    });

    it("on a device that syncs nothing, is just Backup, with no browser sync or cloud rows", async () => {
      const f = await open({ place: { kind: "device" }, cloud: CAN_CONNECT });
      const sync = section(f.screen, "Backup");
      await expect
        .element(f.screen.getByRole("link", { name: "Backup" }))
        .toBeVisible();
      await expect
        .element(
          sync.getByText(
            "Langle has no server. Everything, including your settings, is kept on this phone.",
          ),
        )
        .toBeVisible();
      await expect.element(sync.getByText("Backup file")).toBeVisible();
      expect(sync.getByRole("switch").query()).toBeNull();
      expect(sync.getByText("Sync space").query()).toBeNull();
      expect(sync.getByText("Your own cloud storage").query()).toBeNull();
      expect(sync.getByRole("button", { name: /Connect/ }).query()).toBeNull();
      expect(f.screen.getByText(/Chrome sync/).query()).toBeNull();
    });

    it("exports a dated backup file and shows when", async () => {
      const f = await open({ lastExport: null });
      const sync = section(f.screen, "Sync and backup");
      await expect.element(sync.getByText(/Never exported\./)).toBeVisible();
      await sync.getByRole("button", { name: "Export" }).click();
      await expect
        .element(sync.getByText(/Last export: just now\./))
        .toBeVisible();
      expect(f.downloads).toEqual([
        {
          name: "langle-backup-2026-11-10.json",
          text: '{"format":"langle-export"}',
        },
      ]);
    });

    it("says how long ago the last export was", async () => {
      const f = await open({ lastExport: NOW - 12 * DAY });
      await expect
        .element(
          section(f.screen, "Sync and backup").getByText(
            /Last export: 12 days ago\./,
          ),
        )
        .toBeVisible();
    });

    it("imports a backup file and says how many words came in", async () => {
      const f = await open();
      const sync = section(f.screen, "Sync and backup");
      const file = new File(['{"format":"langle-export"}'], "backup.json", {
        type: "application/json",
      });
      const input =
        f.screen.container.querySelector<HTMLInputElement>(
          'input[type="file"]',
        )!;
      await userEvent.upload(input, file);
      await expect.element(sync.getByText("Imported 3 words")).toBeVisible();
      expect(f.sent).toContainEqual({
        type: "importJson",
        json: '{"format":"langle-export"}',
      });
    });

    it("shows why an import failed", async () => {
      const f = await open({ importResult: new Error("Not a Langle export") });
      const input =
        f.screen.container.querySelector<HTMLInputElement>(
          'input[type="file"]',
        )!;
      await userEvent.upload(
        input,
        new File(["{}"], "x.json", { type: "application/json" }),
      );
      await expect
        .element(
          section(f.screen, "Sync and backup").getByText(
            "Could not import: Not a Langle export",
          ),
        )
        .toBeVisible();
    });

    it("lists your own cloud storage as coming later in a build that cannot connect", async () => {
      const f = await open();
      const sync = section(f.screen, "Sync and backup");
      await expect
        .element(sync.getByText("Your own cloud storage"))
        .toBeVisible();
      await expect.element(sync.getByText("Coming later")).toBeVisible();
      expect(sync.getByRole("button", { name: /Connect/ }).query()).toBeNull();
      await expect
        .element(
          f.screen.getByText(
            "Langle has no server. Everything is kept in this browser; your settings, including the sites Langle is off for, are also saved to Chrome sync.",
          ),
        )
        .toBeVisible();
    });
  });

  describe("your own cloud storage", () => {
    const LEAD =
      "Langle has no server. Everything is kept in this browser and, if you like, your own Google Drive; your settings, including the sites Langle is off for, are also saved to Chrome sync.";
    const DESC =
      "Google Drive. Everything is saved there, in a folder only Langle can open.";
    const syncSwitch = (sync: ReturnType<typeof section>) =>
      sync.getByRole("switch", { name: "Sync word status with Chrome sync" });

    it("offers Google Drive after the backup file, and Connect connects", async () => {
      const f = await open({ cloud: CAN_CONNECT });
      const sync = section(f.screen, "Sync and backup");
      await expect.element(sync.getByText(LEAD)).toBeVisible();
      await expect
        .element(
          sync.getByText(
            "Save everything, including sources and sentences, to your Google Drive, for when Chrome sync space runs out.",
          ),
        )
        .toBeVisible();
      const rows = [...sync.element().querySelectorAll(".row")].map(
        (row) => row.textContent ?? "",
      );
      expect(rows.at(-2)).toMatch(/^Backup file/);
      expect(rows.at(-1)).toMatch(/^Your own cloud storage/);
      expect(sync.getByText("Coming later").query()).toBeNull();

      await sync.getByRole("button", { name: "Connect Google Drive" }).click();
      await expect.element(sync.getByText(DESC)).toBeVisible();
      expect(f.sent).toContainEqual({
        type: "cloudConnect",
        provider: "googleDrive",
      });
    });

    it("shows where it stands while connected, without browser sync's switch and space", async () => {
      const f = await open({
        cloud: CONNECTED,
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      await expect.element(sync.getByText(LEAD)).toBeVisible();
      await expect
        .element(sync.getByText("Your own cloud storage"))
        .toBeVisible();
      await expect.element(sync.getByText(DESC)).toBeVisible();
      await expect
        .element(sync.getByText("Saved to Google Drive · 2 minutes ago"))
        .toBeVisible();
      await expect.element(sync.getByText("1.4 MB · 3 devices")).toBeVisible();
      await expect
        .element(sync.getByText("Last checked other devices: 1 minute ago"))
        .toBeVisible();
      expect(syncSwitch(sync).query()).toBeNull();
      expect(sync.getByText("Sync space").query()).toBeNull();
      expect(
        sync.getByRole("button", { name: "Reconnect" }).query(),
      ).toBeNull();
      await expect
        .element(sync.getByRole("button", { name: "Export" }))
        .toBeVisible();
      expect(f.screen.getByText(/Synced/).query()).toBeNull();
    });

    it("names the account this device is connected with", async () => {
      const f = await open({
        cloud: { ...CONNECTED, account: "alex.kim@gmail.com" },
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      await expect
        .element(
          sync.getByText(
            "Google Drive (alex.kim@gmail.com). Everything is saved there, in a folder only Langle can open.",
          ),
        )
        .toBeVisible();
    });

    it("disconnects, and browser sync's switch comes back", async () => {
      const f = await open({
        cloud: CONNECTED,
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      await sync.getByRole("button", { name: "Disconnect" }).click();
      await expect.element(syncSwitch(sync)).toBeVisible();
      await expect
        .element(sync.getByRole("button", { name: "Connect Google Drive" }))
        .toBeVisible();
      expect(f.sent).toContainEqual({ type: "cloudDisconnect" });
    });

    it("asks to reconnect, with Reconnect and Disconnect", async () => {
      const f = await open({
        cloud: {
          ...CONNECTED,
          error: "reconnect",
          lastSavedAt: NOW - 3 * HOUR,
        },
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      const line = sync.getByText("Reconnect needed");
      await expect.element(line).toBeVisible();
      expect(getComputedStyle(line.element()).color).toBe("rgb(180, 35, 24)");
      await expect.element(sync.getByText("1.4 MB · 3 devices")).toBeVisible();
      await expect
        .element(
          sync.getByText(
            "Last saved 3 hours ago. New changes wait on this device until you reconnect.",
          ),
        )
        .toBeVisible();
      expect(sync.getByText(/Last checked/).query()).toBeNull();
      await expect
        .element(sync.getByRole("button", { name: "Disconnect" }))
        .toBeVisible();
      await sync.getByRole("button", { name: "Reconnect" }).click();
      await expect
        .element(sync.getByText("Saved to Google Drive · 2 minutes ago"))
        .toBeVisible();
      expect(f.sent).toContainEqual({
        type: "cloudConnect",
        provider: "googleDrive",
      });
    });

    it("says the storage is full, with Disconnect only", async () => {
      const f = await open({
        cloud: { ...CONNECTED, error: "full", lastSavedAt: NOW - 2 * DAY },
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      await expect
        .element(sync.getByText("Google Drive storage is full"))
        .toBeVisible();
      await expect
        .element(
          sync.getByText(
            "Last saved 2 days ago. Langle saves again when there is space; nothing is lost on this device.",
          ),
        )
        .toBeVisible();
      expect(
        sync.getByRole("button", { name: "Reconnect" }).query(),
      ).toBeNull();
      await expect
        .element(sync.getByRole("button", { name: "Disconnect" }))
        .toBeVisible();
    });

    it("asks for an update when another device saved with a newer Langle", async () => {
      const f = await open({
        cloud: { ...CONNECTED, error: "update" },
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      await expect
        .element(sync.getByText("Update Langle on this device"))
        .toBeVisible();
      await expect
        .element(
          sync.getByText(
            "Another device saved with a newer Langle, so its changes are not read here yet. Last saved 2 minutes ago.",
          ),
        )
        .toBeVisible();
      expect(
        sync.getByRole("button", { name: "Reconnect" }).query(),
      ).toBeNull();
    });

    it("shows a retry as saved: it goes on by itself", async () => {
      const f = await open({
        cloud: { ...CONNECTED, error: "retrying" },
        settings: { cloudProvider: "googleDrive" },
      });
      await expect
        .element(
          section(f.screen, "Sync and backup").getByText(
            "Saved to Google Drive · 2 minutes ago",
          ),
        )
        .toBeVisible();
    });

    it("asks to connect on this device too when another device chose Google Drive", async () => {
      const f = await open({
        cloud: CAN_CONNECT,
        settings: { cloudProvider: "googleDrive" },
      });
      const sync = section(f.screen, "Sync and backup");
      await expect.element(syncSwitch(sync)).toBeVisible();
      await expect
        .element(sync.getByText("Connect Google Drive on this device too"))
        .toBeVisible();
      await expect
        .element(
          sync.getByText(
            "Your other devices save to Google Drive. Each device signs in once.",
          ),
        )
        .toBeVisible();
      await sync.getByRole("button", { name: "Connect", exact: true }).click();
      await expect.element(sync.getByText(DESC)).toBeVisible();
      expect(f.sent).toContainEqual({
        type: "cloudConnect",
        provider: "googleDrive",
      });
    });

    it("offers Also save to Google Drive in Sentence history only while connected", async () => {
      const f = await open({ cloud: CAN_CONNECT });
      const history = section(f.screen, "Sentence history");
      await expect
        .element(
          history.getByText(
            "Never synced. Pages on your Never run on list are not kept.",
          ),
        )
        .toBeVisible();
      expect(history.getByText(/Also save to/).query()).toBeNull();

      await section(f.screen, "Sync and backup")
        .getByRole("button", { name: "Connect Google Drive" })
        .click();
      const also = history.getByRole("switch", {
        name: "Also save to Google Drive",
      });
      await expect.element(also).toBeChecked();
      await expect
        .element(
          history.getByText(
            "Your other devices can show these sentences too. Applies to all your devices.",
          ),
        )
        .toBeVisible();
      await expect
        .element(
          history.getByText("Pages on your Never run on list are not kept.", {
            exact: true,
          }),
        )
        .toBeVisible();
      await also.click();
      await expect.element(also).not.toBeChecked();
      expect(f.settings().cloudHistory).toBe(false);
      expect(setSettingsPatches(f.sent)).toEqual([{ cloudHistory: false }]);
    });
  });

  it("has no Articles section: Sync and backup comes right before About", async () => {
    const { screen } = await open();
    const links = screen
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("link")
      .elements()
      .map((a) => a.textContent);
    expect(links.slice(-2)).toEqual(["Sync and backup", "About"]);
    expect(links).not.toContain("Articles");
    expect(
      screen
        .getByRole("switch", { name: "Highlight only the article" })
        .elements(),
    ).toHaveLength(0);
  });

  it("shows the version, a one-line credit and the Licenses link", async () => {
    const f = await open();
    const about = section(f.screen, "About");
    await expect
      .element(
        about.getByText(
          "Langle 0.1.0 · Data: Wiktionary (CC BY-SA), EJDict-hand, wordnets, Universal Dependencies · Licenses",
        ),
      )
      .toBeVisible();
    const link = about.getByRole("link", { name: "Licenses" });
    await expect
      .element(link)
      .toHaveAttribute("href", "chrome-extension://langle/notices.html");
    await expect.element(link).toHaveAttribute("target", "_blank");
    // One line at the mock's width (it was five).
    await page.viewport(1440, 900);
    try {
      const text = link.element().parentElement!;
      const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
      expect(text.getBoundingClientRect().height).toBeLessThan(
        lineHeight * 1.5,
      );
    } finally {
      await page.viewport(1200, 800);
    }
  });

  describe("Support Langle", () => {
    const LINKS: SupportLinks = {
      coffee: "https://ko-fi.example/langle",
      review: "https://store.example/langle/reviews",
      feedback: "https://forms.example/langle",
      sponsor: "https://langle.example/sponsor",
    };

    it("sits under the section nav with Ko-fi, Rate, feedback and the sponsor page, each in a new tab", async () => {
      const { screen } = await open({ links: LINKS });
      const box = section(screen, "Support Langle");
      await expect
        .element(box)
        .toHaveTextContent(
          "Support LangleLangle is free. Your support keeps me going and lets Langle keep growing.Buy me a coffeeRate LangleSend feedbackBecome a sponsor",
        );
      const links = box.getByRole("link").elements();
      expect(links.map((a) => a.getAttribute("href"))).toEqual([
        LINKS.coffee,
        LINKS.review,
        LINKS.feedback,
        LINKS.sponsor,
      ]);
      for (const a of links) expect(a.getAttribute("target")).toBe("_blank");
      // The left column, right under the nav; no nav entry of its own.
      const nav = screen
        .getByRole("navigation", { name: "Settings sections" })
        .element();
      expect(nav.nextElementSibling).toBe(box.element());
      expect(nav.querySelector("a[href='#support']")).toBeNull();
      const [coffee, rate] = links.map((a) => getComputedStyle(a));
      expect(coffee!.backgroundColor).toBe("rgb(11, 127, 101)");
      expect(coffee!.height).toBe("40px");
      expect(rate!.borderColor).toBe("rgb(143, 211, 188)");
      expect(rate!.color).toBe("rgb(7, 92, 73)");
      expect(getComputedStyle(box.element()).backgroundColor).toBe(
        "rgb(230, 246, 240)",
      );
    });

    it("leaves out a link whose page does not exist yet, and the box without any", async () => {
      const { screen } = await open({ links: { feedback: LINKS.feedback } });
      const box = section(screen, "Support Langle");
      expect(
        box
          .getByRole("link")
          .elements()
          .map((a) => a.textContent),
      ).toEqual(["Send feedback"]);
      cleanup();

      const none = await open();
      expect(
        none.screen.getByRole("region", { name: "Support Langle" }).query(),
      ).toBeNull();
    });

    it("keeps the whole left column in reach in a short window", async () => {
      await page.viewport(1200, 500);
      try {
        const { screen } = await open({ links: LINKS });
        const sponsor = section(screen, "Support Langle").getByRole("link", {
          name: "Become a sponsor",
        });
        const column = sponsor.element().closest("section")!.parentElement!;
        expect(column.getBoundingClientRect().bottom).toBeLessThanOrEqual(
          innerHeight,
        );
        sponsor.element().scrollIntoView();
        const box = sponsor.element().getBoundingClientRect();
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(innerHeight);
      } finally {
        await page.viewport(1200, 800);
      }
    });
  });
});

describe("SettingsPage on a phone", () => {
  beforeEach(() => page.viewport(390, 844));
  afterEach(() => page.viewport(1200, 800));

  const LINKS: SupportLinks = {
    coffee: "https://ko-fi.example/langle",
    review: "https://store.example/langle/reviews",
    feedback: "https://forms.example/langle",
    sponsor: "https://langle.example/sponsor",
  };

  /** The phone app: touch, nothing synced, its `appHost`. */
  async function openPhone(options: FakeOptions = {}) {
    const f = fake({
      phone: true,
      app: true,
      place: { kind: "device" },
      links: LINKS,
      ...options,
    });
    const screen = await render(<SettingsPage deps={f.deps} />);
    await expect
      .element(screen.getByRole("heading", { name: "Settings", level: 1 }))
      .toBeVisible();
    return { ...f, screen };
  }

  const pushed = (screen: Awaited<ReturnType<typeof render>>, name: string) =>
    screen
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: new RegExp(`^${name}`) });

  it("puts Download beside the pair in Language data, and a download's share under it", async () => {
    vi.stubGlobal("appHost", {
      translator: { models: "system" },
      translatorStatus: async () => "download",
      prepareTranslator: async () => "download",
    });
    const top = (element: Element) => element.getBoundingClientRect().top;
    const ios = await openPhone();
    await pushed(ios.screen, "Languages").click();
    const pair = ios.screen.getByText("English → Japanese", { exact: true });
    const download = ios.screen.getByRole("button", { name: "Download" });
    await expect.element(download).toBeVisible();
    expect(download.element().getBoundingClientRect().height).toBe(44);
    expect(top(download.element())).toBeLessThan(
      pair.element().getBoundingClientRect().bottom,
    );
    cleanup();

    const loading = await openPhone({
      settings: { learningLang: "es", nativeLang: "en" },
      packStatus: () =>
        spanish(ready(3 * MB_), {
          state: "downloading",
          received: 1 * MB_,
          total: 3.4 * MB_,
        }),
    });
    await pushed(loading.screen, "Languages").click();
    const share = loading.screen.getByText("Downloading · 62%");
    await expect.element(share).toBeVisible();
    expect(top(share.element())).toBeGreaterThan(
      loading.screen
        .getByText("Spanish → English", { exact: true })
        .element()
        .getBoundingClientRect().bottom,
    );
  });

  it("lists the sections with their values, Backup for Sync, and Support with Rate and feedback only", async () => {
    const { screen } = await openPhone({
      settings: { theme: "dark", knownLevel: 4000 },
    });
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(
      nav
        .getByRole("button")
        .elements()
        .map((b) => b.textContent),
    ).toEqual([
      "LanguagesEnglish → Japanese",
      "AppearanceDark",
      "New-word level4,000",
      "Highlighting",
      "Dictionaries and AI",
      "Video subtitles",
      "Sites",
      "Sentence history",
      "Backup",
      "About",
    ]);
    const row = nav.getByRole("button").first().element();
    expect(row.getBoundingClientRect().height).toBe(52);
    expect(nav.element().getBoundingClientRect().width).toBe(350);
    const box = screen.getByRole("region", { name: "Support Langle" });
    expect(
      box
        .getByRole("link")
        .elements()
        .map((a) => [a.textContent, a.getAttribute("href")]),
    ).toEqual([
      ["Rate Langle", LINKS.review],
      ["Send feedback", LINKS.feedback],
    ]);
    const rate = box.getByRole("link").first().element();
    expect(rate.getBoundingClientRect().height).toBe(44);
    // No section is on the page until one is pushed.
    expect(
      screen.getByRole("region", { name: "Languages" }).query(),
    ).toBeNull();
  });

  it("pushes a section with ‹ Settings, its rows on a card in touch sizes", async () => {
    const { screen } = await openPhone();
    await pushed(screen, "Sites").click();
    await expect
      .element(screen.getByRole("heading", { name: "Sites", level: 1 }))
      .toBeVisible();
    const sites = screen.getByRole("region", { name: "Sites" });
    // The phone app plays no Netflix.
    expect(
      sites
        .getByRole("switch")
        .elements()
        .map((s) => s.getAttribute("aria-label")),
    ).not.toContain("Run Langle on Netflix");
    expect(sites.element().textContent).not.toContain("Netflix");
    const toggle = sites.getByRole("switch").first().element();
    const box = toggle.getBoundingClientRect();
    expect([box.width, box.height]).toEqual([52, 32]);
    const row = toggle.closest(".row")!;
    expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(64);
    expect(getComputedStyle(row).backgroundColor).toBe("rgb(255, 255, 255)");
    expect(
      screen.getByRole("navigation", { name: "Settings sections" }).query(),
    ).toBeNull();

    await screen.getByRole("button", { name: "Settings" }).click();
    await expect
      .element(screen.getByRole("navigation", { name: "Settings sections" }))
      .toBeVisible();
    expect(screen.getByRole("region", { name: "Sites" }).query()).toBeNull();
  });

  it("words Appearance, Dictionaries and Sites for the app, not the browser", async () => {
    const { screen } = await openPhone();
    const leads = {
      Appearance: "System follows your phone's light or dark mode.",
      "Dictionaries and AI":
        "Links shown in the dictionary window. Each one opens with the word filled in.",
      Sites:
        "Where Langle runs. You can also switch it off for one site in the Langle sheet.",
    };
    for (const [name, lead] of Object.entries(leads)) {
      await pushed(screen, name).click();
      const section = screen.getByRole("region", { name });
      await expect.element(section).toBeVisible();
      const text = section.element().textContent ?? "";
      expect(text).toContain(lead);
      expect(text).not.toMatch(/browser|new tab|toolbar popup/);
      await screen.getByRole("button", { name: "Settings" }).click();
    }
  });

  it("keeps the browser's wording in touch mode outside the app", async () => {
    const f = fake({ phone: true, links: LINKS });
    const screen = await render(<SettingsPage deps={f.deps} />);
    await pushed(screen, "Sites").click();
    const sites = screen.getByRole("region", { name: "Sites" });
    await expect.element(sites).toBeVisible();
    expect(sites.element().textContent).toContain("from the toolbar popup.");
  });

  it("sets the phone's own subtitle position and fullscreen transcript, with no keyboard shortcuts", async () => {
    const { screen, sent } = await openPhone();
    await pushed(screen, "Video subtitles").click();
    const video = screen.getByRole("region", { name: "Video subtitles" });
    await expect.element(video).toBeVisible();
    expect(video.element().textContent).toContain("in the Langle sheet");
    const positions = video
      .getByRole("group", { name: "Subtitle position" })
      .getByRole("button");
    expect(positions.elements().map((b) => b.textContent)).toEqual([
      "Below the video (default)Shown in a larger box under the player, so nothing covers the picture.",
      "In the videoShown over the bottom of the video, like normal subtitles.",
    ]);
    expect(positions.first().element().getAttribute("aria-pressed")).toBe(
      "true",
    );
    await positions.last().click();
    await screen
      .getByRole("radiogroup", { name: "Transcript in fullscreen" })
      .getByRole("radio", { name: "Left" })
      .click();
    await expect
      .poll(() => setSettingsPatches(sent))
      .toEqual([
        { phoneSubtitlePosition: "inVideo" },
        { phoneFullscreenTranscript: "left" },
      ]);
    await expect
      .element(screen.getByRole("radio", { name: "Left" }))
      .toHaveAttribute("aria-checked", "true");
    expect(video.element().textContent).not.toContain("Keyboard shortcuts");
  });

  it("puts a row's menu under its title, across the card", async () => {
    const { screen } = await openPhone();
    await pushed(screen, "Languages").click();
    const select = screen
      .getByRole("combobox", { name: /Learning language/ })
      .element();
    const row = select.closest(".row")!;
    const title = row.querySelector("span")!.getBoundingClientRect();
    const box = select.getBoundingClientRect();
    expect(box.top).toBeGreaterThan(title.bottom);
    // The card's width less its 16px sides and 1px borders.
    expect(box.width).toBe(350 - 2 - 32);
    expect(box.height).toBe(44);
  });

  it("calls Sync and backup just Backup in the app, with no sync rows", async () => {
    const { screen } = await openPhone();
    await pushed(screen, "Backup").click();
    const backup = screen.getByRole("region", { name: "Backup" });
    await expect.element(backup).toBeVisible();
    expect(backup.getByRole("switch").query()).toBeNull();
    expect(backup.element().textContent).not.toContain("space");
    await expect
      .element(backup.getByRole("button", { name: "Export" }))
      .toBeVisible();
  });

  it("keeps Ko-fi, the sponsor page and Netflix on a computer", async () => {
    await page.viewport(1200, 800);
    const f = fake({ links: LINKS });
    const screen = await render(<SettingsPage deps={f.deps} />);
    const box = screen.getByRole("region", { name: "Support Langle" });
    await expect.element(box).toBeVisible();
    expect(box.getByRole("link").elements()).toHaveLength(4);
    expect(
      screen.getByRole("region", { name: "Sites" }).element().textContent,
    ).toContain("Netflix");
    expect(
      screen.getByRole("link", { name: "Sync and backup" }).query(),
    ).not.toBeNull();
  });
});
