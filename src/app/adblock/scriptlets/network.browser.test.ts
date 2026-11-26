// The scriptlets that change what fetch and XMLHttpRequest answer, each in a window of
// its own; the responses are data: URLs, so nothing goes to the network.
import { describe, expect, it } from "vitest";
import { freshWindow } from "../../../testing/scriptlets";
import type { Win } from "./lib/shared";
import jsonEditFetchResponse from "./json-edit-fetch-response";
import jsonPruneFetchResponse from "./json-prune-fetch-response";
import jsonPruneXhrResponse from "./json-prune-xhr-response";
import trustedReplaceFetchResponse from "./trusted-replace-fetch-response";
import trustedReplaceXhrResponse from "./trusted-replace-xhr-response";

const jsonUrl = (value: unknown, tag = "") =>
  `data:application/json;tag=${tag},${encodeURIComponent(JSON.stringify(value))}`;
const textUrl = (text: string, tag = "") =>
  `data:text/plain;tag=${tag},${encodeURIComponent(text)}`;

function xhr(
  win: Win,
  url: string,
  responseType: XMLHttpRequestResponseType = "",
) {
  return new Promise<XMLHttpRequest>((resolve, reject) => {
    const request = new win.XMLHttpRequest();
    request.open("GET", url);
    request.responseType = responseType;
    request.onload = () => resolve(request);
    request.onerror = reject;
    request.send();
  });
}

const PLAYER = { adPlacements: [1], playerAds: [2], captions: { tracks: 1 } };

describe("json-prune-fetch-response", () => {
  it("prunes the JSON of the fetch calls propsToMatch matches", async () => {
    const win = freshWindow();
    jsonPruneFetchResponse(
      win,
      "adPlacements playerAds",
      "",
      "propsToMatch",
      "tag=player",
    );
    const pruned = await (await win.fetch(jsonUrl(PLAYER, "player"))).json();
    expect(pruned).toEqual({ captions: { tracks: 1 } });
    const other = await (await win.fetch(jsonUrl(PLAYER, "other"))).json();
    expect(other).toEqual(PLAYER);
  });

  it("matches the URL by regex and by url:, a Request too, and keeps status and URL", async () => {
    const win = freshWindow();
    jsonPruneFetchResponse(
      win,
      "adPlacements",
      "",
      "propsToMatch",
      "url:/tag=pl.yer/",
    );
    const url = jsonUrl(PLAYER, "player");
    const response = await win.fetch(new win.Request(url));
    expect(response.status).toBe(200);
    expect(response.url).toBe(url);
    expect(await response.json()).not.toHaveProperty("adPlacements");
  });

  it("leaves text that is not JSON as it came", async () => {
    const win = freshWindow();
    jsonPruneFetchResponse(win, "adPlacements");
    expect(await (await win.fetch(textUrl("not json"))).text()).toBe(
      "not json",
    );
  });
});

describe("json-prune-xhr-response", () => {
  it("prunes response and responseText of the requests that match", async () => {
    const win = freshWindow();
    jsonPruneXhrResponse(
      win,
      "adPlacements playerAds",
      "",
      "propsToMatch",
      "tag=player",
    );
    const text = await xhr(win, jsonUrl(PLAYER, "player"));
    expect(JSON.parse(text.responseText)).toEqual({ captions: { tracks: 1 } });
    expect(JSON.parse(text.response as string)).toEqual({
      captions: { tracks: 1 },
    });
    const json = await xhr(win, jsonUrl(PLAYER, "player"), "json");
    expect(json.response).toEqual({ captions: { tracks: 1 } });
    const other = await xhr(win, jsonUrl(PLAYER, "other"));
    expect(JSON.parse(other.responseText)).toEqual(PLAYER);
  });

  it("matches the method", async () => {
    const win = freshWindow();
    jsonPruneXhrResponse(
      win,
      "adPlacements",
      "",
      "propsToMatch",
      "method:POST",
    );
    const request = await xhr(win, jsonUrl(PLAYER));
    expect(JSON.parse(request.responseText)).toHaveProperty("adPlacements");
  });
});

describe("json-edit-fetch-response", () => {
  const page = {
    contents: [
      {
        itemSectionRenderer: {
          contents: [{ video: 1 }, { adSlotRenderer: {} }],
        },
      },
    ],
  };

  it("removes what the query finds in the responses that match", async () => {
    const win = freshWindow();
    jsonEditFetchResponse(
      win,
      "..itemSectionRenderer.contents.*[?.adSlotRenderer]",
      "propsToMatch",
      "tag=get_watch",
    );
    const edited = await (await win.fetch(jsonUrl(page, "get_watch"))).json();
    expect(edited).toEqual({
      contents: [{ itemSectionRenderer: { contents: [{ video: 1 }] } }],
    });
    expect(await (await win.fetch(jsonUrl(page, "next"))).json()).toEqual(page);
  });

  it("ignores a query that assigns", async () => {
    const win = freshWindow();
    jsonEditFetchResponse(win, "$.contents=0");
    expect(await (await win.fetch(jsonUrl(page))).json()).toEqual(page);
  });
});

describe("trusted-replace-fetch-response", () => {
  it("replaces text everywhere, by regex, or all of it", async () => {
    const body = '{"adPlacements":[1],"x":{"adPlacements":[2]}}';
    const replaced = async (...args: string[]) => {
      const win = freshWindow();
      trustedReplaceFetchResponse(win, ...args);
      return (await win.fetch(textUrl(body, "player"))).text();
    };
    expect(await replaced('"adPlacements"', '"no_ads"', "player")).toBe(
      '{"no_ads":[1],"x":{"no_ads":[2]}}',
    );
    expect(await replaced("/\\[(\\d)\\]/", "[$1$1]", "player")).toBe(
      '{"adPlacements":[11],"x":{"adPlacements":[2]}}',
    );
    expect(await replaced("*", "{}", "")).toBe("{}");
    expect(await replaced('"adPlacements"', '"no_ads"', "other")).toBe(body);
  });

  it("replaces only where includes is found", async () => {
    const win = freshWindow();
    trustedReplaceFetchResponse(win, "a", "b", "", "includes", "needle");
    expect(await (await win.fetch(textUrl("aaa"))).text()).toBe("aaa");
    expect(await (await win.fetch(textUrl("aa needle"))).text()).toBe(
      "bb needle",
    );
  });
});

describe("trusted-replace-xhr-response", () => {
  it("replaces in the text of the requests that match", async () => {
    const win = freshWindow();
    trustedReplaceXhrResponse(win, '"adSlots"', '"no_ads"', "/tag=pl/");
    const request = await xhr(win, textUrl('{"adSlots":1}', "player"));
    expect(request.responseText).toBe('{"no_ads":1}');
    const other = await xhr(win, textUrl('{"adSlots":1}', "next"));
    expect(other.responseText).toBe('{"adSlots":1}');
  });
});
