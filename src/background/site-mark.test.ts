import { describe, expect, it, vi } from "vitest";
import { mergeSettings, type Settings } from "../core/settings";
import type { SetupStage } from "../core/setup";
import { settingsListeners } from "../testing/stubs";
import {
  declarativeMarkRules,
  followSiteMark,
  markRule,
  MARK_RULE_ID,
  type MarkInputs,
  type MarkRule,
} from "./site-mark";

const VIDEO_SITES = ["*://www.youtube.com/*", "*://www.netflix.com/*"];

function inputs(patch: Partial<MarkInputs> = {}): MarkInputs {
  return {
    stage: "ready",
    settings: mergeSettings({}),
    granted: [],
    seen: [],
    staticMatches: VIDEO_SITES,
    ...patch,
  };
}

/** Whether the rule would mark a page at `url` whose `<html lang>` is `lang`. */
function marks(rule: MarkRule | undefined, url: string, lang = "en") {
  return (rule?.conditions ?? []).some(
    ({ urlMatches, css }) =>
      new RegExp(urlMatches).test(url) &&
      css.some(
        (selector) => selector === `html[lang|="${lang.split("-")[0]}"]`,
      ),
  );
}

describe("markRule", () => {
  it("marks pages in the learning language on an undecided host", () => {
    const rule = markRule(inputs());
    expect(rule?.conditions[0]?.css).toEqual(['html[lang|="en"]']);
    expect(marks(rule, "https://blog.example/post")).toBe(true);
    expect(marks(rule, "https://blog.example/post", "fr")).toBe(false);
  });

  it("follows the learning language", () => {
    const rule = markRule(
      inputs({ settings: mergeSettings({ learningLang: "fr" }) }),
    );
    expect(rule?.conditions[0]?.css).toEqual(['html[lang|="fr"]']);
  });

  it("leaves out granted, seen, video, Never run on and switched-off hosts", () => {
    const rule = markRule(
      inputs({
        granted: ["*://granted.example/*", "https://*.wide.example/*"],
        seen: ["seen.example"],
        settings: mergeSettings({
          neverRunOn: ["never.example"],
          disabledSites: ["off.example"],
        }),
      }),
    );
    for (const host of [
      "granted.example",
      "a.wide.example",
      "wide.example",
      "seen.example",
      "www.youtube.com",
      "www.netflix.com",
      "never.example",
      "sub.never.example",
      "off.example",
      "www.off.example",
    ])
      expect(marks(rule, `https://${host}/`), host).toBe(false);
    for (const host of [
      "www.granted.example",
      "www.seen.example",
      "other.example",
    ])
      expect(marks(rule, `https://${host}/`), host).toBe(true);
  });

  it("is none before the setup ends, while off, without articles, or with every host granted", () => {
    expect(markRule(inputs({ stage: "languages" }))).toBeUndefined();
    expect(
      markRule(inputs({ settings: mergeSettings({ enabled: false }) })),
    ).toBeUndefined();
    expect(
      markRule(
        inputs({
          settings: mergeSettings({
            sites: { ...mergeSettings({}).sites, articles: false },
          }),
        }),
      ),
    ).toBeUndefined();
    expect(markRule(inputs({ granted: ["*://*/*"] }))).toBeUndefined();
    expect(markRule(inputs({ granted: ["<all_urls>"] }))).toBeUndefined();
  });

  it("tags the rule by what it was built from", () => {
    const a = markRule(inputs())!.tag;
    expect(markRule(inputs())!.tag).toBe(a);
    expect(markRule(inputs({ seen: ["x.example"] }))!.tag).not.toBe(a);
  });
});

describe("followSiteMark", () => {
  function fake(stored: Partial<Settings> = {}, stage: SetupStage = "ready") {
    let settings = mergeSettings(stored);
    let seen: string[] = [];
    let origins: string[] = [];
    const watchers = settingsListeners(settings);
    const listeners = {
      installed: [] as (() => void)[],
      startup: [] as (() => void)[],
      added: [] as ((p: unknown) => void)[],
      removed: [] as ((p: unknown) => void)[],
      stage: [] as ((s: SetupStage) => void)[],
      seen: [] as ((h: string[]) => void)[],
    };
    let installed: MarkRule | undefined;
    const replace = vi.fn(async (rule: MarkRule | undefined) => {
      installed = rule;
    });
    const getSettings = vi.fn(async () => settings);
    const mark = followSiteMark({
      staticMatches: VIDEO_SITES,
      rules: { installedTag: async () => installed?.tag, replace },
      getSettings,
      watchSettings: watchers.watch,
      getSetupStage: async () => stage,
      watchSetupStage: (listener) => {
        listeners.stage.push(listener);
        return () => {};
      },
      getSiteSeen: async () => seen,
      watchSiteSeen: (listener) => {
        listeners.seen.push(listener);
        return () => {};
      },
      permissions: {
        getAll: async () => ({ origins }),
        onAdded: { addListener: (l) => listeners.added.push(l) },
        onRemoved: { addListener: (l) => listeners.removed.push(l) },
      },
      onInstalled: { addListener: (l) => listeners.installed.push(l) },
      onStartup: { addListener: (l) => listeners.startup.push(l) },
    });
    return {
      replace,
      getSettings,
      idle: () => mark.idle,
      installed: () => installed,
      setInstalled(rule: MarkRule | undefined) {
        installed = rule;
      },
      change(patch: Partial<Settings>) {
        settings = mergeSettings(patch, settings);
        watchers.emit(settings);
      },
      setUp(next: SetupStage) {
        stage = next;
        listeners.stage.forEach((l) => l(next));
      },
      see(host: string) {
        seen = [...seen, host];
        listeners.seen.forEach((l) => l(seen));
      },
      grant(origin: string) {
        origins = [...origins, origin];
        listeners.added.forEach((l) => l({ origins: [origin] }));
      },
      revoke(origin: string) {
        origins = origins.filter((o) => o !== origin);
        listeners.removed.forEach((l) => l({ origins: [origin] }));
      },
      install: () => listeners.installed.forEach((l) => l()),
      startBrowser: () => listeners.startup.forEach((l) => l()),
    };
  }

  const url = (host: string) => `https://${host}/`;

  it("installs the rule when the worker starts", async () => {
    const f = fake();
    await f.idle();
    expect(f.replace).toHaveBeenCalledOnce();
    expect(marks(f.installed(), url("a.example"))).toBe(true);
  });

  it("leaves a matching installed rule as it is when a worker starts", async () => {
    const f = fake();
    await f.idle();
    const again = fake();
    again.setInstalled(f.installed());
    await again.idle();
    expect(again.replace).not.toHaveBeenCalled();
  });

  it("makes the rule again at install, update and browser start", async () => {
    const f = fake();
    await f.idle();
    f.install();
    await f.idle();
    f.startBrowser();
    await f.idle();
    expect(f.replace).toHaveBeenCalledTimes(3);
  });

  it("follows seen hosts, grants, Never run on and the switch", async () => {
    const f = fake();
    await f.idle();
    f.see("a.example");
    await f.idle();
    expect(marks(f.installed(), url("a.example"))).toBe(false);
    f.grant("*://b.example/*");
    await f.idle();
    expect(marks(f.installed(), url("b.example"))).toBe(false);
    f.revoke("*://b.example/*");
    await f.idle();
    expect(marks(f.installed(), url("b.example"))).toBe(true);
    f.change({ neverRunOn: ["c.example"] });
    await f.idle();
    expect(marks(f.installed(), url("www.c.example"))).toBe(false);
    f.change({ enabled: false });
    await f.idle();
    expect(f.installed()).toBeUndefined();
    f.change({ enabled: true });
    await f.idle();
    expect(marks(f.installed(), url("d.example"))).toBe(true);
  });

  it("builds nothing new for a setting it does not read", async () => {
    const f = fake();
    await f.idle();
    f.change({ knownLevel: 5000 });
    await f.idle();
    expect(f.replace).toHaveBeenCalledOnce();
  });

  it("has no rule, and reads no settings, until the setup ends", async () => {
    const f = fake({}, "consent");
    await f.idle();
    expect(f.installed()).toBeUndefined();
    expect(f.getSettings).not.toHaveBeenCalled();
    f.setUp("ready");
    await f.idle();
    expect(marks(f.installed(), url("a.example"))).toBe(true);
  });

  it("builds once for changes that come during a build, reading them all", async () => {
    const f = fake();
    f.see("a.example");
    f.see("b.example");
    f.grant("*://c.example/*");
    await f.idle();
    expect(f.replace.mock.calls.length).toBeLessThanOrEqual(2);
    for (const host of ["a.example", "b.example", "c.example"])
      expect(marks(f.installed(), url(host)), host).toBe(false);
  });
});

describe("declarativeMarkRules", () => {
  function api() {
    const calls: string[] = [];
    let rules: { id?: string; tags?: string[] }[] = [];
    let error: { message: string } | undefined;
    class PageStateMatcher {
      readonly options: object;
      constructor(options: object) {
        this.options = options;
      }
    }
    class SetIcon {
      readonly options: object;
      constructor(options: object) {
        this.options = options;
      }
    }
    const onPageChanged = {
      getRules: (done: (r: typeof rules) => void) => done(rules),
      removeRules: (_ids: string[] | undefined, done: () => void) => {
        calls.push("remove");
        rules = [];
        done();
      },
      addRules: (added: typeof rules, done: () => void) => {
        calls.push("add");
        if (!error) rules = added;
        done();
      },
    };
    return {
      calls,
      rules: () => rules,
      fail(message: string) {
        error = { message };
      },
      lastError: () => error,
      api: { PageStateMatcher, SetIcon, onPageChanged },
    };
  }

  const rule: MarkRule = {
    conditions: [{ urlMatches: "^https?://", css: ['html[lang|="en"]'] }],
    tag: "t1",
  };
  const image = {} as ImageData;

  it("removes every rule, then adds the mark with the decoded icon", async () => {
    const fake = api();
    const icon = vi.fn(async () => ({ 16: image }));
    const rules = declarativeMarkRules(fake.api, icon, fake.lastError);
    await rules.replace(rule);
    await rules.replace(rule);
    expect(fake.calls).toEqual(["remove", "add", "remove", "add"]);
    expect(icon).toHaveBeenCalledOnce();
    const [added] = fake.rules() as unknown as {
      id: string;
      conditions: { options: object }[];
      actions: { options: object }[];
    }[];
    expect(added?.id).toBe(MARK_RULE_ID);
    expect(added?.conditions[0]?.options).toEqual({
      pageUrl: { urlMatches: "^https?://" },
      css: ['html[lang|="en"]'],
    });
    expect(added?.actions[0]?.options).toEqual({ imageData: { 16: image } });
    expect(await rules.installedTag()).toBe("t1");
  });

  it("only removes when there is no rule", async () => {
    const fake = api();
    const rules = declarativeMarkRules(
      fake.api,
      async () => ({}),
      fake.lastError,
    );
    await rules.replace(undefined);
    expect(fake.calls).toEqual(["remove"]);
    expect(await rules.installedTag()).toBeUndefined();
  });

  it("rejects with the browser's error", async () => {
    const fake = api();
    const rules = declarativeMarkRules(
      fake.api,
      async () => ({}),
      fake.lastError,
    );
    fake.fail("missing )");
    await expect(rules.replace(rule)).rejects.toThrow("missing )");
  });
});
