// The scriptlets on events, windows, nodes and methods, each in a window of its own.
import { describe, expect, it } from "vitest";
import { freshWindow, runScript } from "../../../testing/scriptlets";
import addEventListenerDefuser from "./addEventListener-defuser";
import preventWindowOpen from "./prevent-window-open";
import removeNodeText from "./remove-node-text";
import trustedEditInboundObject from "./trusted-edit-inbound-object";
import trustedPreventDomBypass from "./trusted-prevent-dom-bypass";
import trustedReplaceNodeText from "./trusted-replace-node-text";

type Bag = Record<string, unknown>;
const bag = (win: Window) => win as unknown as Bag;

describe("addEventListener-defuser", () => {
  it("drops listeners by event name and listener source", () => {
    const win = freshWindow();
    addEventListenerDefuser(win, "click", "popunder");
    const heard: string[] = [];
    const target = win.document.body;
    target.addEventListener("click", () => heard.push("popunder"));
    target.addEventListener("click", () => heard.push("menu"));
    target.addEventListener("dblclick", () => heard.push("popunder dbl"));
    target.dispatchEvent(new win.MouseEvent("click"));
    target.dispatchEvent(new win.MouseEvent("dblclick"));
    expect(heard).toEqual(["menu", "popunder dbl"]);
  });

  it("matches event names by regex and only on the elements named", () => {
    const win = freshWindow();
    addEventListenerDefuser(win, "/^mouse/", "", "elements", "a.ad, window");
    const ad = Object.assign(win.document.createElement("a"), {
      className: "ad",
    });
    const link = win.document.createElement("a");
    win.document.body.append(ad, link);
    const heard: string[] = [];
    for (const [name, target] of [
      ["ad", ad],
      ["link", link],
      ["window", win],
    ] as const)
      target.addEventListener("mousedown", () => heard.push(name));
    for (const target of [ad, link, win])
      target.dispatchEvent(new win.MouseEvent("mousedown"));
    expect(heard).toEqual(["link"]);
  });

  it("listens as before without arguments", () => {
    const win = freshWindow();
    const add = win.EventTarget.prototype.addEventListener;
    addEventListenerDefuser(win);
    expect(win.EventTarget.prototype.addEventListener).toBe(add);
  });
});

describe("prevent-window-open", () => {
  it("answers null to the calls that match, and opens the others", () => {
    const win = freshWindow();
    const opened: unknown[][] = [];
    win.open = ((...args: unknown[]) => {
      opened.push(args);
      return null;
    }) as Window["open"];
    preventWindowOpen(win, "ads.example");
    expect(win.open("https://ads.example/pop")).toBeNull();
    win.open("https://news.example/");
    expect(opened).toEqual([["https://news.example/"]]);
  });

  it("turns the test around with !, and stops every call without a needle", () => {
    const win = freshWindow();
    const opened: unknown[] = [];
    win.open = ((url: unknown) => {
      opened.push(url);
      return null;
    }) as Window["open"];
    preventWindowOpen(win, "!news.example");
    win.open("https://ads.example/");
    win.open("https://news.example/");
    expect(opened).toEqual(["https://news.example/"]);
    const all = freshWindow();
    all.open = (() => {
      throw new Error("opened");
    }) as Window["open"];
    preventWindowOpen(all);
    expect(all.open("https://news.example/")).toBeNull();
  });

  it("gives a decoy's window for the seconds asked, then removes it", async () => {
    const win = freshWindow();
    preventWindowOpen(win, "", "1", "blank");
    const popup = win.open("https://ads.example/");
    const decoy = win.document.querySelector("iframe");
    expect(decoy?.getAttribute("src")).toBe("about:blank");
    expect(popup).toBe(decoy?.contentWindow);
    await expect
      .poll(() => win.document.querySelector("iframe"), { timeout: 2000 })
      .toBeNull();
  });
});

describe("remove-node-text and trusted-replace-node-text", () => {
  // The parser's scripts reach the observer before they run; a script another script
  // inserts runs at once, so these are data blocks.
  it("empties the scripts whose text matches", async () => {
    const win = freshWindow();
    removeNodeText(win, "script", "adblockDetector", "stay", "1");
    const script = (text: string) =>
      Object.assign(win.document.createElement("script"), {
        type: "text/plain",
        text,
      });
    const detector = script("window.detector = 'adblockDetector';");
    const other = script("window.other = true;");
    win.document.body.append(detector, other);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(detector.text).toBe("");
    expect(other.text).toBe("window.other = true;");
  });

  it("empties text nodes with includes and excludes", async () => {
    const win = freshWindow();
    removeNodeText(
      win,
      "#text",
      "/^Advertisement/",
      "excludes",
      "keep",
      "stay",
      "1",
    );
    const box = win.document.createElement("p");
    win.document.body.append(box);
    box.append("Advertisement here", "Advertisement keep", "News");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...box.childNodes].map((node) => node.textContent)).toEqual([
      "",
      "Advertisement keep",
      "News",
    ]);
  });

  it("replaces in the text, and stops after sedCount", async () => {
    const win = freshWindow();
    trustedReplaceNodeText(
      win,
      "#text",
      "ad",
      "news",
      "sedCount",
      "1",
      "stay",
      "1",
    );
    const box = win.document.createElement("p");
    win.document.body.append(box);
    box.append("an ad, an ad");
    await new Promise((resolve) => setTimeout(resolve, 0));
    box.append("an ad");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...box.childNodes].map((node) => node.textContent)).toEqual([
      "an news, an news",
      "an ad",
    ]);
  });

  it("works on nodes already there and quits at DOMContentLoaded", async () => {
    const win = freshWindow();
    win.document.body.append("an ad");
    removeNodeText(win, "#text", "ad");
    expect(win.document.body.textContent).toBe("");
    win.document.body.append("an ad");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(win.document.body.textContent).toBe("an ad");
  });
});

describe("trusted-prevent-dom-bypass", () => {
  it("gives a new blank iframe this window's function", () => {
    const win = freshWindow();
    trustedPreventDomBypass(win, "Node.prototype.appendChild", "fetch");
    const frame = win.document.createElement("iframe");
    win.document.body.appendChild(frame);
    expect(frame.contentWindow?.fetch).toBe(win.fetch);
  });

  it("gives this window as the iframe's own without targetProp", () => {
    const win = freshWindow();
    trustedPreventDomBypass(win, "Element.prototype.append");
    const other = win.document.createElement("iframe");
    win.document.body.appendChild(other);
    expect(other.contentWindow).not.toBe(win);
    const box = win.document.createElement("div");
    box.appendChild(win.document.createElement("iframe"));
    win.document.body.append(box);
    expect(box.querySelector("iframe")?.contentWindow).toBe(win);
  });
});

describe("trusted-edit-inbound-object", () => {
  it("edits a copy of the argument the method gets", () => {
    const win = freshWindow();
    trustedEditInboundObject(
      win,
      "JSON.stringify",
      "0",
      '[?.attestationRequest][?.context.client.userAgent*="yahi"]+={"params":"YAHI"}',
    );
    const request = {
      attestationRequest: {},
      context: { client: { userAgent: "a yahi" } },
    };
    expect(JSON.parse(win.JSON.stringify(request))).toEqual({
      ...request,
      params: "YAHI",
    });
    expect(request).not.toHaveProperty("params");
    expect(win.JSON.stringify({ other: 1 })).toBe('{"other":1}');
  });

  it("counts a negative position from the end", () => {
    const win = freshWindow();
    const seen: unknown[] = [];
    bag(win).api = { send: (...args: unknown[]) => seen.push(...args) };
    trustedEditInboundObject(win, "api.send", "-1", "$.ads");
    runScript(win, "api.send('first', { ads: 1, keep: 2 });");
    expect(seen).toEqual(["first", { keep: 2 }]);
  });
});
