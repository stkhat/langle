import { describe, expect, it } from "vitest";
import { editJson, parseJsonPath } from "./json-path";

const store = () => ({
  store: {
    book: [
      { author: "Nigel Rees", price: 8.95 },
      { author: "Evelyn Waugh", price: 12.99 },
      { author: "Herman Melville", price: 8.99, isbn: "0-553-21311-3" },
      { author: "J. R. R. Tolkien", price: 22.99, isbn: "0-395-19395-8" },
    ],
    bicycle: { color: "red", price: 399 },
  },
});

function edited<T>(query: string, value: T, trusted = false) {
  const changed = editJson(parseJsonPath(query), value, trusted);
  return { changed, value };
}

describe("RFC 9535 queries (v2)", () => {
  it("removes what a filter selects among an array's items", () => {
    const { changed, value } = edited("$..book[?@.price>10]", store());
    expect(changed).toBe(2);
    expect(value.store.book.map((b) => b.author)).toEqual([
      "Nigel Rees",
      "Herman Melville",
    ]);
  });

  it("removes a property by dot and bracket names, and by index", () => {
    expect(
      edited("$.store.bicycle.color", store()).value.store.bicycle,
    ).toEqual({
      price: 399,
    });
    expect(
      edited("$['store']['bicycle']", store()).value.store,
    ).not.toHaveProperty("bicycle");
    const { value } = edited("$..book[-1]", store());
    expect(value.store.book.at(-1)?.author).toBe("Herman Melville");
  });

  it("selects with wildcards and descendants", () => {
    const { changed, value } = edited("$..isbn", store());
    expect(changed).toBe(2);
    expect(value.store.book.some((b) => "isbn" in b)).toBe(false);
    expect(edited("$.store.*", store()).value.store).toEqual({});
  });

  it("knows uBO's string operators and regexes", () => {
    const authors = (query: string) =>
      edited(query, store()).value.store.book.map((b) => b.author);
    expect(authors('v2:$..book[?@.author^="E"]')).not.toContain("Evelyn Waugh");
    expect(authors('v2:$..book[?@.author$="s"]')).not.toContain("Nigel Rees");
    expect(authors('v2:$..book[?@.author*="Mel"]')).not.toContain(
      "Herman Melville",
    );
    expect(authors("v2:$..book[?@.author=/Tolk/]")).not.toContain(
      "J. R. R. Tolkien",
    );
    expect(edited("v2:$../^bic/", store()).value.store).not.toHaveProperty(
      "bicycle",
    );
  });

  it("goes on only when a chained sub-query's quantifier holds", () => {
    expect(edited("v2:$.store.bicycle;$..isbn", store()).changed).toBe(2);
    expect(edited("v2:$.store.bicycle{0};$..isbn", store()).changed).toBe(0);
    expect(edited("v2:$.store.car{0};$..isbn", store()).changed).toBe(2);
    expect(edited("v2:$..book[*]{1,3};$..isbn", store()).changed).toBe(0);
    expect(edited("v2:$..book[*]{4};$..isbn", store()).changed).toBe(2);
  });

  it("assigns only when trusted", () => {
    const query = "v2:$..book[?@.price>20].price=0";
    expect(edited(query, store()).changed).toBe(0);
    const { value } = edited(query, store(), true);
    expect(value.store.book[3]?.price).toBe(0);
    expect(value.store.book).toHaveLength(4);
  });

  it("merges into objects and replaces in strings", () => {
    const merged = edited('$.store.bicycle+={"gears":3}', store(), true).value;
    expect(merged.store.bicycle).toEqual({
      color: "red",
      price: 399,
      gears: 3,
    });
    const replaced = edited(
      '$.store.bicycle.color=repl({"pattern":"r","replacement":"b"})',
      store(),
      true,
    ).value;
    expect(replaced.store.bicycle.color).toBe("bed");
    const regex = edited(
      '$..author=repl({"regex":"(\\\\w+)$","replacement":"[$1]"})',
      store(),
      true,
    ).value;
    expect(regex.store.book[0]?.author).toBe("Nigel [Rees]");
  });

  it("refuses what it cannot read", () => {
    expect(() => parseJsonPath("$.a[")).toThrow(SyntaxError);
    expect(() => parseJsonPath('$.a=call(["${obj}","x"])')).toThrow(
      SyntaxError,
    );
  });
});

describe("the older syntax the lists still use", () => {
  it("removes the items of a descendant's array that a filter keeps (m.youtube.com's rule)", () => {
    const response = {
      contents: {
        sectionListRenderer: {
          contents: [
            {
              itemSectionRenderer: {
                contents: [
                  { videoRenderer: { videoId: "a" } },
                  { adSlotRenderer: { ad: true } },
                  { videoRenderer: { videoId: "b" } },
                  { adSlotRenderer: { ad: true } },
                ],
              },
            },
          ],
        },
      },
    };
    const { changed } = edited(
      "..itemSectionRenderer.contents.*[?.adSlotRenderer]",
      response,
    );
    expect(changed).toBe(2);
    expect(
      response.contents.sectionListRenderer.contents[0]?.itemSectionRenderer
        .contents,
    ).toEqual([
      { videoRenderer: { videoId: "a" } },
      { videoRenderer: { videoId: "b" } },
    ]);
  });

  it("tests the root with filters before going down (youtube.com's request rules)", () => {
    const request = (userAgent: string) => ({
      attestationRequest: {},
      context: { client: { clientName: "WEB", userAgent } },
    });
    const query =
      '[?.attestationRequest][?.context.client.userAgent*="channel"].context.client[?.clientName=="WEB"]+={"clientScreen":"CHANNEL"}';
    const matching = edited(query, request("Mozilla; channel"), true).value;
    expect(matching.context.client).toEqual({
      clientName: "WEB",
      userAgent: "Mozilla; channel",
      clientScreen: "CHANNEL",
    });
    const other = edited(query, request("Mozilla"), true).value;
    expect(other.context.client).not.toHaveProperty("clientScreen");
  });

  it("matches a regex filter and replaces with repl", () => {
    const value = {
      attestationRequest: {},
      context: { client: { userAgent: "x inline" } },
      playbackContext: { contentPlaybackContext: { referer: "https://r/" } },
    };
    const query =
      '[?.attestationRequest][?.context.client.userAgent=/adunit|inline/].playbackContext.contentPlaybackContext.referer=repl({"regex":"(?:#reloadxhr)?$","replacement":"#reloadxhr"})';
    edited(query, value, true);
    expect(value.playbackContext.contentPlaybackContext.referer).toBe(
      "https://r/#reloadxhr",
    );
    edited(query, value, true);
    expect(value.playbackContext.contentPlaybackContext.referer).toBe(
      "https://r/#reloadxhr",
    );
  });
});
