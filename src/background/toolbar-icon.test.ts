import { describe, expect, it, vi } from "vitest";
import { mergeSettings, type Settings } from "../core/settings";
import type { SetupStage } from "../core/setup";
import { settingsListeners } from "../testing/stubs";
import {
  followToolbarIcon,
  toolbarIconPaths,
  type ShownIcon,
} from "./toolbar-icon";

describe("toolbarIconPaths", () => {
  it("is the manifest's green icon while on and the gray one while off", () => {
    expect(toolbarIconPaths(true)).toEqual({
      16: "/icon/16.png",
      32: "/icon/32.png",
      48: "/icon/48.png",
      128: "/icon/128.png",
    });
    expect(toolbarIconPaths(false)).toEqual({
      16: "/icon-off/16.png",
      32: "/icon-off/32.png",
      48: "/icon-off/48.png",
      128: "/icon-off/128.png",
    });
  });
});

describe("followToolbarIcon", () => {
  function fake(
    stored: Partial<Settings>,
    stage: SetupStage = "ready",
    shownBefore?: ShownIcon,
  ) {
    let settings = mergeSettings(stored);
    // `storage.session`: cleared, with the global icon, when the browser restarts.
    let shown = shownBefore;
    const watchers = settingsListeners(settings);
    const startup: (() => void)[] = [];
    const setIcon = vi.fn<(path: Record<number, string>) => Promise<void>>(
      async () => {},
    );
    const setupWatchers: ((stage: SetupStage) => void)[] = [];
    const getSettings = vi.fn(async () => settings);
    const unwatch = followToolbarIcon({
      setIcon,
      getSettings,
      getSetupStage: async () => stage,
      watchSetupStage(listener) {
        setupWatchers.push(listener);
        return () => {};
      },
      watchSettings: watchers.watch,
      onStartup: { addListener: (listener) => startup.push(listener) },
      shown: {
        get: async () => shown,
        set: async (icon) => {
          shown = icon;
        },
      },
    });
    const dirs = () =>
      setIcon.mock.calls.map(([path]) => path[16]!.split("/")[1]);
    return {
      dirs,
      // The fakes answer at once, so their work is done by the next task.
      idle: () => new Promise((resolve) => setTimeout(resolve, 0)),
      unwatch,
      getSettings,
      setUp(next: SetupStage) {
        stage = next;
        setupWatchers.forEach((listener) => listener(next));
      },
      change(patch: Partial<Settings>) {
        settings = mergeSettings(patch, settings);
        watchers.emit(settings);
      },
      restartBrowser: () => {
        shown = undefined;
        startup.forEach((listener) => listener());
      },
    };
  }

  // Any global icon hides the mark until the browser restarts (site-mark.ts).
  it("sets no icon at start-up or install while Langle is on", async () => {
    const f = fake({});
    await f.idle();
    f.restartBrowser();
    await f.idle();
    expect(f.dirs()).toEqual([]);
  });

  it("sets the gray icon when the worker starts with Langle off", async () => {
    const f = fake({ enabled: false });
    await expect.poll(f.dirs).toEqual(["icon-off"]);
  });

  it("sets nothing again while the icon set this session is right", async () => {
    const f = fake({ enabled: false }, "ready", "off");
    await f.idle();
    expect(f.dirs()).toEqual([]);
  });

  it("puts the color back when a worker starts on after an off this session", async () => {
    const f = fake({}, "ready", "off");
    await expect.poll(f.dirs).toEqual(["icon"]);
  });

  it("follows the switch, and only the switch", async () => {
    const f = fake({});
    f.change({ enabled: false });
    await expect.poll(f.dirs).toEqual(["icon-off"]);
    f.change({ knownLevel: 5000 });
    f.change({ enabled: true });
    await expect.poll(f.dirs).toEqual(["icon-off", "icon"]);
  });

  it("sets the gray icon again when the browser starts with Langle off", async () => {
    const f = fake({ enabled: false });
    await expect.poll(f.dirs).toEqual(["icon-off"]);
    f.restartBrowser();
    await expect.poll(f.dirs).toEqual(["icon-off", "icon-off"]);
  });

  it("stays gray, without reading the settings, until Langle is set up", async () => {
    const f = fake({}, "consent");
    await expect.poll(f.dirs).toEqual(["icon-off"]);
    f.change({ enabled: false });
    f.setUp("languages");
    await expect.poll(() => f.dirs().at(-1)).toBe("icon-off");
    expect(f.dirs()).not.toContain("icon");
    expect(f.getSettings).not.toHaveBeenCalled();
  });

  it("gets its color when the setup ends", async () => {
    const f = fake({}, "languages");
    await expect.poll(f.dirs).toEqual(["icon-off"]);
    f.setUp("ready");
    await expect.poll(() => f.dirs().at(-1)).toBe("icon");
  });
});
