// The scriptlets that guard properties, each in a window of its own.
import { describe, expect, it } from "vitest";
import { freshWindow, runScript } from "../../../testing/scriptlets";
import abortCurrentScript from "./abort-current-script";
import abortOnPropertyRead from "./abort-on-property-read";
import abortOnPropertyWrite from "./abort-on-property-write";
import jsonPrune from "./json-prune";
import setConstant from "./set-constant";

type Bag = Record<string, unknown>;
const bag = (win: Window) => win as unknown as Bag;

describe("json-prune", () => {
  it("prunes what JSON.parse gives, once the needles are there", () => {
    const win = freshWindow();
    jsonPrune(win, "ads a.b", "flag");
    expect(win.JSON.parse('{"ads":1,"a":{"b":1,"c":2},"flag":1}')).toEqual({
      a: { c: 2 },
      flag: 1,
    });
    expect(win.JSON.parse('{"ads":1}')).toEqual({ ads: 1 });
    expect(win.JSON.parse("[1,2]")).toEqual([1, 2]);
  });

  it("prunes what Response.json gives", async () => {
    const win = freshWindow();
    jsonPrune(win, "ads");
    const response = new win.Response('{"ads":1,"keep":2}');
    expect(await response.json()).toEqual({ keep: 2 });
  });

  it("prunes only calls whose stack trace matches", () => {
    const win = freshWindow();
    jsonPrune(win, "ads", "", "fromTheAdScript");
    runScript(
      win,
      "function fromTheAdScript() { window.ad = JSON.parse('{\"ads\":1}'); } fromTheAdScript(); window.other = JSON.parse('{\"ads\":1}');",
    );
    expect(bag(win).ad).toEqual({});
    expect(bag(win).other).toEqual({ ads: 1 });
  });

  it("does nothing without paths", () => {
    const win = freshWindow();
    const parse = win.JSON.parse;
    jsonPrune(win);
    expect(win.JSON.parse).toBe(parse);
  });
});

describe("set-constant", () => {
  it("sets a property chain the page has not made yet and keeps it", () => {
    const win = freshWindow();
    setConstant(win, "ytInitialPlayerResponse.adPlacements", "undefined");
    setConstant(win, "ytInitialPlayerResponse.playerAds", "undefined");
    runScript(
      win,
      'var ytInitialPlayerResponse = {"adPlacements":[1],"playerAds":[2],"captions":{}};',
    );
    const response = bag(win).ytInitialPlayerResponse as Bag;
    expect(JSON.stringify(response)).toBe('{"captions":{}}');
    response.adPlacements = [3];
    expect(response.adPlacements).toBeUndefined();
  });

  it("knows uBO's values", () => {
    const win = freshWindow();
    const values: Record<string, (value: unknown) => void> = {
      true: (v) => expect(v).toBe(true),
      null: (v) => expect(v).toBeNull(),
      "''": (v) => expect(v).toBe(""),
      "[]": (v) => expect(v).toEqual([]),
      "{}": (v) => expect(v).toEqual({}),
      "42": (v) => expect(v).toBe(42),
      noopFunc: (v) => expect((v as () => unknown)()).toBeUndefined(),
      trueFunc: (v) => expect((v as () => unknown)()).toBe(true),
      falseFunc: (v) => expect((v as () => unknown)()).toBe(false),
      throwFunc: (v) => expect(v).toThrow(),
    };
    for (const [raw, check] of Object.entries(values)) {
      const name = `c${Object.keys(values).indexOf(raw)}`;
      setConstant(win, name, raw);
      check(bag(win)[name]);
    }
    setConstant(win, "unknown", "somethingElse");
    expect(bag(win)).not.toHaveProperty("unknown");
  });

  it("wraps the value as the as argument says", async () => {
    const win = freshWindow();
    setConstant(win, "f", "true", "as", "function");
    setConstant(win, "p", "42", "as", "resolved");
    expect((bag(win).f as () => unknown)()).toBe(true);
    expect(await (bag(win).p as Promise<unknown>)).toBe(42);
  });

  it("leaves a property of another type alone, and lets the page write another type", () => {
    const win = freshWindow();
    bag(win).flag = "on";
    setConstant(win, "flag", "false");
    expect(bag(win).flag).toBe("on");
    setConstant(win, "count", "0");
    bag(win).count = 5;
    expect(bag(win).count).toBe(0);
    bag(win).count = "five";
    expect(bag(win).count).toBe("five");
  });
});

describe("abort-on-property-read", () => {
  it("throws in the script that reads the chain, quietly", () => {
    const win = freshWindow();
    const errors: ErrorEvent[] = [];
    win.addEventListener("error", (event) => errors.push(event));
    abortOnPropertyRead(win, "adConfig.slots");
    runScript(
      win,
      "window.before = 1; adConfig = { slots: 1 }; window.reached = adConfig.slots;",
    );
    expect(bag(win).before).toBe(1);
    expect(bag(win)).not.toHaveProperty("reached");
    // Reported, and kept out of the console.
    expect(errors.map((event) => event.defaultPrevented)).toEqual([true]);
  });
});

describe("abort-on-property-write", () => {
  it("throws in the script that writes the property; reads go on", () => {
    const win = freshWindow();
    bag(win).adBlockDetected = false;
    abortOnPropertyWrite(win, "adBlockDetected");
    runScript(
      win,
      "window.read = adBlockDetected; adBlockDetected = true; window.reached = true;",
    );
    expect(bag(win).read).toBe(false);
    expect(bag(win)).not.toHaveProperty("reached");
    expect(bag(win).adBlockDetected).toBe(false);
  });
});

describe("abort-current-script", () => {
  it("throws only in inline scripts whose text matches", () => {
    const win = freshWindow();
    bag(win).track = () => 1;
    abortCurrentScript(win, "track", "adblock");
    runScript(win, "/* adblock check */ window.a = track();");
    runScript(win, "window.b = track();");
    expect(bag(win)).not.toHaveProperty("a");
    expect(bag(win).b).toBe(1);
  });

  it("throws in a data: script whose decoded text matches srcNeedle", async () => {
    const win = freshWindow();
    bag(win).track = () => 1;
    abortCurrentScript(win, "track", "/^$/", "adblock");
    const load = (code: string) =>
      new Promise<void>((resolve) => {
        const script = win.document.createElement("script");
        script.src = `data:text/javascript;base64,${btoa(code)}`;
        script.onload = script.onerror = () => resolve();
        win.document.body.append(script);
      });
    await load("/* adblock */ window.a = track();");
    await load("window.b = track();");
    expect(bag(win)).not.toHaveProperty("a");
    expect(bag(win).b).toBe(1);
  });
});
