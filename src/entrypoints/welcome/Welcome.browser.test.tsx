import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-preact";
import { mergeSettings, type Settings } from "../../core/settings";
import type {
  CloudStatus,
  LanguagePair,
  Request,
  SetupStatus,
} from "../../messaging/protocol";
import { settingsListeners } from "../../testing/stubs";
import { fixedTouchMode } from "../../testing/touch";
import { Welcome, type WelcomeDeps } from "./Welcome";

afterEach(cleanup);

function fake(
  status: SetupStatus = { stage: "consent", pair: null },
  options: Partial<WelcomeDeps> & {
    refuse?: boolean;
    /** What `cloudStatus` answers (none offered by default). */
    cloud?: CloudStatus;
    /** What connecting does: the pair the other devices use; `cancel`: the sheet was closed. */
    connect?: LanguagePair | "cancel" | (() => Promise<never>);
  } = {},
) {
  const { refuse, connect, cloud: offered, ...over } = options;
  let current = status;
  let cloud: CloudStatus = offered ?? {
    available: [],
    bytes: 0,
    devices: 0,
  };
  const requests: Request[] = [];
  const order: string[] = [];
  const settings = settingsListeners(mergeSettings(undefined));
  const watchSettings = vi.fn(settings.watch);
  const deps: WelcomeDeps = {
    send: (async (request: Request) => {
      requests.push(request);
      order.push(request.type);
      if (refuse && request.type !== "setupStatus") throw new Error("refused");
      if (request.type === "agreeSetup")
        current = {
          ...current,
          stage: current.stage === "consent" ? "languages" : current.stage,
        };
      if (request.type === "cloudStatus") return cloud;
      if (request.type === "cloudConnect") {
        if (typeof connect === "function") return connect();
        if (connect !== "cancel") {
          cloud = { ...cloud, provider: request.provider, devices: 2 };
          if (connect) current = { ...current, pair: connect };
        }
        return null;
      }
      return request.type === "startLangle" ? null : current;
    }) as WelcomeDeps["send"],
    watchSettings,
    uiLanguage: "ja",
    sync: { kind: "browser", browser: "Chrome" },
    drive: true,
    privacyPolicy: "https://example.com/privacy",
    startModels: vi.fn(async () => {
      order.push("startModels");
    }),
    showLanguage: vi.fn(),
    close: vi.fn(),
    alreadySetUp: vi.fn(),
    ...over,
  };
  return {
    deps,
    requests,
    order,
    watchSettings,
    /** Browser sync brings these settings. */
    synced(patch: Partial<Settings>) {
      const next = mergeSettings(patch);
      current = {
        ...current,
        pair: { learningLang: next.learningLang, nativeLang: next.nativeLang },
      };
      settings.emit(next);
    },
  };
}

const show = (deps: WelcomeDeps) => render(<Welcome deps={deps} />);
const LANGUAGES: SetupStatus = { stage: "languages", pair: null };

describe("How Langle uses your data", () => {
  it("shows what the consent is about", async () => {
    const screen = await show(fake().deps);
    await expect
      .element(screen.getByRole("heading"))
      .toHaveTextContent("How Langle uses your data");
    const card = screen.getByRole("region");
    for (const text of [
      "Langle has no servers. It saves your data only on your device and in your own cloud services, nowhere else. The developer receives none of it.",
      "Pages you visit and subtitles, to explain and translate words.",
      "Your words and a history of sentences, web addresses and titles on this device, to show where you met a word.",
      "Words and settings, including site choices, to Chrome sync. A word you look up or play may go to the service that gives its meaning or sound.",
      "If you connect Google Drive, those and your history go there. Your Google email is kept to stay connected.",
    ])
      await expect.element(card).toMatchTextContent(text);
    await expect
      .element(screen.getByRole("link", { name: "Privacy policy" }))
      .toHaveAttribute("href", "https://example.com/privacy");
  });

  it("says the words and settings stay on a device that syncs nothing", async () => {
    const screen = await show(
      fake(undefined, { sync: { kind: "device" }, drive: false }).deps,
    );
    const region = screen.getByRole("region");
    for (const text of [
      "Langle has no servers. It saves your data only on this phone, nowhere else. The developer receives none of it.",
      "Your words, settings and a history of sentences, web addresses and titles on this phone, to show where you met a word.",
      "Only a word you look up or play, to the service that gives its meaning or sound. Your words and settings stay on this phone.",
    ])
      await expect.element(region).toMatchTextContent(text);
    expect(screen.container.textContent).not.toContain("Chrome sync");
    expect(screen.container.textContent).not.toContain("Google");
    expect(screen.container.textContent).not.toContain("cloud");
  });

  it("names Google Drive on a phone that can sign in to Google", async () => {
    const screen = await show(
      fake(undefined, { sync: { kind: "device" }, drive: true }).deps,
    );
    const region = screen.getByRole("region");
    for (const text of [
      "Langle has no servers. It saves your data only on this phone and, if you connect it, your own Google Drive, nowhere else. The developer receives none of it.",
      "Your words, settings and a history of sentences, web addresses and titles on this phone, to show where you met a word.",
      "A word you look up or play may go to the service that gives its meaning or sound.",
      "If you connect Google Drive, your words, settings and history go there. Your Google email is kept to stay connected.",
    ])
      await expect.element(region).toMatchTextContent(text);
    expect(screen.container.textContent).not.toContain("stay on this phone");
    expect(screen.container.textContent).not.toContain("Chrome sync");
  });

  it("leaves out Drive in a build without it, and a policy without an address", async () => {
    const screen = await show(
      fake(undefined, { drive: false, privacyPolicy: "" }).deps,
    );
    await expect.element(screen.getByRole("heading")).toBeVisible();
    expect(screen.container.textContent).not.toContain("Google");
    expect(screen.container.querySelector("a")).toBeNull();
  });

  it("takes nothing as consent but the button, and reads no settings before", async () => {
    const f = fake();
    const screen = await show(f.deps);
    await screen.getByRole("button", { name: "Not now" }).click();
    expect(f.deps.close).toHaveBeenCalledOnce();
    expect(f.requests).toEqual([{ type: "setupStatus" }]);
    expect(f.watchSettings).not.toHaveBeenCalled();
  });

  it("goes on to the languages in the same tab", async () => {
    const f = fake();
    const screen = await show(f.deps);
    await screen.getByRole("button", { name: "Agree and continue" }).click();
    await expect
      .element(screen.getByRole("heading"))
      .toHaveTextContent("Your languages");
    expect(f.requests.map((r) => r.type)).toEqual([
      "setupStatus",
      "agreeSetup",
    ]);
  });

  it("can be pressed again when agreeing failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const screen = await show(fake(undefined, { refuse: true }).deps);
    const agree = screen.getByRole("button", { name: "Agree and continue" });
    await agree.click();
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    await expect.element(agree).toBeEnabled();
    error.mockRestore();
  });

  it("is left for Settings when the device is set up already", async () => {
    const f = fake({ stage: "ready", pair: null });
    await show(f.deps);
    await vi.waitFor(() => expect(f.deps.alreadySetUp).toHaveBeenCalledOnce());
  });
});

describe("Your languages", () => {
  it("fills in the browser's language, and English to learn", async () => {
    const screen = await show(fake(LANGUAGES).deps);
    await expect.element(screen.getByLabelText("I speak")).toHaveValue("ja");
    await expect
      .element(screen.getByLabelText("I’m learning"))
      .toHaveValue("en");
    await expect
      .element(screen.getByRole("button", { name: "Start" }))
      .toBeEnabled();
  });

  it("lists every native language once, by English name", async () => {
    const screen = await show(fake(LANGUAGES).deps);
    const select = screen.getByLabelText("I speak");
    await expect.element(select).toBeVisible();
    const labels = [...(select.element() as HTMLSelectElement).options].map(
      (option) => option.text,
    );
    expect(labels[0]).toBe("Choose a language");
    const offered = labels.slice(1);
    expect(offered).toContain("Japanese (日本語)");
    expect(offered).toEqual([...new Set(offered)].sort());
  });

  it("shows itself in the language for I speak as it is chosen", async () => {
    const { deps } = fake(LANGUAGES);
    const screen = await show(deps);
    await expect
      .poll(() => vi.mocked(deps.showLanguage).mock.calls.at(-1))
      .toEqual(["ja"]);
    await screen.getByLabelText("I speak").selectOptions("de");
    await expect
      .poll(() => vi.mocked(deps.showLanguage).mock.calls.at(-1))
      .toEqual(["de"]);
  });

  it("guesses nothing to learn for an English browser", async () => {
    const screen = await show(fake(LANGUAGES, { uiLanguage: "en-US" }).deps);
    await expect.element(screen.getByLabelText("I speak")).toHaveValue("en");
    const learning = screen.getByLabelText("I’m learning");
    await expect.element(learning).toHaveValue("");
    const start = screen.getByRole("button", { name: "Start" });
    await expect.element(start).toBeDisabled();
    await learning.selectOptions("fr");
    await expect.element(start).toBeEnabled();
  });

  it("has both chosen for an unsupported language", async () => {
    const screen = await show(fake(LANGUAGES, { uiLanguage: "sv" }).deps);
    await expect.element(screen.getByLabelText("I speak")).toHaveValue("");
    const learning = screen.getByLabelText("I’m learning");
    await expect.element(learning).toBeDisabled();
    await screen.getByLabelText("I speak").selectOptions("es");
    await expect.element(learning).toHaveValue("en");
  });

  it("keeps what is learned where it is offered with the new language", async () => {
    const screen = await show(
      fake({
        stage: "languages",
        pair: { learningLang: "de", nativeLang: "en" },
      }).deps,
    );
    const learning = screen.getByLabelText("I’m learning");
    await expect.element(learning).toHaveValue("de");
    await screen.getByLabelText("I speak").selectOptions("fr");
    await expect.element(learning).toHaveValue("de");
    await screen.getByLabelText("I speak").selectOptions("ja");
    await expect.element(learning).toHaveValue("en");
  });

  it("takes a synced pair that arrives late, until the user chooses", async () => {
    const f = fake(LANGUAGES);
    const screen = await show(f.deps);
    const native = screen.getByLabelText("I speak");
    await expect.element(native).toHaveValue("ja");
    await vi.waitFor(() => expect(f.watchSettings).toHaveBeenCalled());
    f.synced({ nativeLang: "pt" });
    await expect.element(native).toHaveValue("pt");
    await native.selectOptions("ko");
    f.synced({ nativeLang: "es" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect.element(native).toHaveValue("ko");
  });

  it("asks for the translator's model in the click, before it starts", async () => {
    const f = fake(LANGUAGES);
    const screen = await show(f.deps);
    await screen.getByRole("button", { name: "Start" }).click();
    await vi.waitFor(() =>
      expect(f.order).toEqual(["setupStatus", "startModels", "startLangle"]),
    );
    expect(f.deps.startModels).toHaveBeenCalledWith("en", "ja");
    expect(f.requests.at(-1)).toEqual({
      type: "startLangle",
      learningLang: "en",
      nativeLang: "ja",
    });
    await expect
      .element(screen.getByRole("button", { name: "Start" }))
      .toBeDisabled();
  });

  it("can be started again when starting failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const screen = await show(fake(LANGUAGES, { refuse: true }).deps);
    const start = screen.getByRole("button", { name: "Start" });
    await start.click();
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    await expect.element(start).toBeEnabled();
    error.mockRestore();
  });
});

describe("on a phone", () => {
  const phone = (status?: SetupStatus) =>
    fake(status, {
      sync: { kind: "device" },
      drive: false,
      touch: fixedTouchMode(true),
    });
  const box = (element: Element) => element.getBoundingClientRect();

  beforeEach(() => page.viewport(390, 844));

  it("fills the screen, with Agree above Not now in a bar at the bottom", async () => {
    const f = phone();
    const screen = await show(f.deps);
    const heading = screen.getByRole("heading");
    await expect
      .element(heading)
      .toHaveTextContent("How Langle uses your data");
    expect(getComputedStyle(heading.element()).fontSize).toBe("26px");
    expect(screen.container.querySelector(".card")).toBeNull();
    const agree = box(
      screen.getByRole("button", { name: "Agree and continue" }).element(),
    );
    const notNow = box(
      screen.getByRole("button", { name: "Not now" }).element(),
    );
    expect(agree.bottom).toBeLessThanOrEqual(notNow.top);
    for (const button of [agree, notNow]) {
      expect(button.height).toBe(50);
      expect(button.width).toBe(390 - 48);
    }
    expect(box(screen.container.querySelector(".bar")!).bottom).toBe(844);
    await screen.getByRole("button", { name: "Not now" }).click();
    expect(f.deps.close).toHaveBeenCalledOnce();
  });

  it("puts Start in the bar under the languages", async () => {
    const screen = await show(phone(LANGUAGES).deps);
    await expect
      .element(screen.getByRole("heading"))
      .toHaveTextContent("Your languages");
    const start = screen.getByRole("button", { name: "Start" }).element();
    expect(start.closest(".bar")).not.toBeNull();
    expect(box(start).height).toBe(50);
    expect(box(screen.getByLabelText("I speak").element()).height).toBe(50);
  });
});

describe("Use Langle on a computer too? (phone app)", () => {
  const OFFERED: CloudStatus = {
    available: ["googleDrive"],
    bytes: 0,
    devices: 0,
  };
  const app = (
    options: Parameters<typeof fake>[1] = {},
    status: SetupStatus = LANGUAGES,
  ) =>
    fake(status, {
      sync: { kind: "device" },
      drive: true,
      cloud: OFFERED,
      touch: fixedTouchMode(true),
      ...options,
    });
  const heading = (screen: Awaited<ReturnType<typeof show>>) =>
    screen.getByRole("heading");

  beforeEach(() => page.viewport(390, 844));

  it("comes after the consent, before the languages", async () => {
    const f = app({}, { stage: "consent", pair: null });
    const screen = await show(f.deps);
    await screen.getByRole("button", { name: "Agree and continue" }).click();
    await expect
      .element(heading(screen))
      .toHaveTextContent("Use Langle on a computer too?");
    await expect
      .element(screen.getByRole("region"))
      .toMatchTextContent(
        "Connect your Google Drive to bring your words here and keep this phone and your computer the same.On the computer, connect Google Drive in Langle’s settings as well.",
      );
    const connect = screen.getByRole("button", {
      name: "Connect Google Drive",
    });
    const notNow = screen.getByRole("button", { name: "Not now" });
    expect(connect.element().closest(".bar")).not.toBeNull();
    expect(
      connect.element().getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(notNow.element().getBoundingClientRect().top);
    await notNow.click();
    await expect.element(heading(screen)).toHaveTextContent("Your languages");
    expect(f.requests.map((r) => r.type)).not.toContain("cloudConnect");
  });

  it("shows the pair the other devices use once connected", async () => {
    let finish = () => {};
    const f = app({
      connect: { learningLang: "en", nativeLang: "pt" },
    });
    const send = f.deps.send;
    f.deps.send = (async (request: Request) => {
      if (request.type === "cloudConnect")
        await new Promise<void>((resolve) => (finish = resolve));
      return send(request as never);
    }) as WelcomeDeps["send"];
    const screen = await show(f.deps);
    await screen.getByRole("button", { name: "Connect Google Drive" }).click();
    const connecting = screen.getByRole("button", { name: "Connecting…" });
    await expect.element(connecting).toBeDisabled();
    finish();
    await expect.element(heading(screen)).toHaveTextContent("Your languages");
    await expect.element(screen.getByLabelText("I speak")).toHaveValue("pt");
    await expect
      .element(screen.getByLabelText("I’m learning"))
      .toHaveValue("en");
    expect(f.requests).toContainEqual({
      type: "cloudConnect",
      provider: "googleDrive",
    });
  });

  it("stays as it was when the sheet was closed or connecting failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const connect of [
      "cancel" as const,
      () => Promise.reject(new Error("offline")),
    ]) {
      const screen = await show(app({ connect }).deps);
      const button = screen.getByRole("button", {
        name: "Connect Google Drive",
      });
      await button.click();
      await expect.element(button).toBeEnabled();
      await expect
        .element(heading(screen))
        .toHaveTextContent("Use Langle on a computer too?");
      cleanup();
    }
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it("is skipped where nothing is offered or it is connected already", async () => {
    for (const options of [
      { drive: false },
      { cloud: { ...OFFERED, available: [] } },
      { cloud: { ...OFFERED, provider: "googleDrive" as const } },
    ]) {
      const f = app(options);
      const screen = await show(f.deps);
      await expect.element(heading(screen)).toHaveTextContent("Your languages");
      cleanup();
    }
  });

  it("is not asked in a browser, where Settings offers Drive", async () => {
    const f = app({ sync: { kind: "browser", browser: "Chrome" } });
    const screen = await show(f.deps);
    await expect.element(heading(screen)).toHaveTextContent("Your languages");
    expect(f.requests.map((r) => r.type)).not.toContain("cloudStatus");
  });
});
