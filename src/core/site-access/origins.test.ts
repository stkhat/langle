import { describe, expect, it } from "vitest";
import {
  articleMatches,
  hostOrigin,
  patternCovers,
  patternHost,
  patternsCoverHost,
} from "./origins";

describe("patternHost", () => {
  it("names a pattern's host, and whether its subdomains come too", () => {
    expect(patternHost("*://example.com/*")).toEqual({
      host: "example.com",
      subdomains: false,
    });
    expect(patternHost("https://*.example.com/*")).toEqual({
      host: "example.com",
      subdomains: true,
    });
  });

  it("names none for every host or a page that is not on the web", () => {
    for (const pattern of [
      "*://*/*",
      "<all_urls>",
      "file:///*",
      "chrome://x/*",
    ])
      expect(patternHost(pattern), pattern).toBeUndefined();
  });
});

describe("hostOrigin", () => {
  it("is the host's pattern for any scheme and path, without the port", () => {
    expect(hostOrigin("example.com")).toBe("*://example.com/*");
  });
});

describe("patternCovers", () => {
  const url = (href: string) => new URL(href);

  it("covers a page on the pattern's host, over http and https, on any port", () => {
    for (const href of [
      "https://example.com/a",
      "http://example.com/",
      "http://example.com:8080/b?c",
    ])
      expect(patternCovers("*://example.com/*", url(href)), href).toBe(true);
  });

  it("does not cover another host, a subdomain or a host the pattern's host ends", () => {
    for (const href of [
      "https://www.example.com/",
      "https://notexample.com/",
      "https://example.org/",
    ])
      expect(patternCovers("*://example.com/*", url(href)), href).toBe(false);
  });

  it("covers subdomains and the domain itself for a *. host", () => {
    expect(
      patternCovers("*://*.example.com/*", url("https://example.com/")),
    ).toBe(true);
    expect(
      patternCovers("*://*.example.com/*", url("https://a.b.example.com/")),
    ).toBe(true);
    expect(
      patternCovers("*://*.example.com/*", url("https://badexample.com/")),
    ).toBe(false);
  });

  it("follows the pattern's scheme", () => {
    expect(
      patternCovers("https://example.com/*", url("https://example.com/")),
    ).toBe(true);
    expect(
      patternCovers("https://example.com/*", url("http://example.com/")),
    ).toBe(false);
  });

  it("counts every host for *://*/* and <all_urls>, web pages only for *://", () => {
    for (const pattern of ["*://*/*", "<all_urls>"])
      expect(patternCovers(pattern, url("https://any.example/")), pattern).toBe(
        true,
      );
    expect(patternCovers("*://*/*", url("file:///tmp/a.html"))).toBe(false);
  });

  it("covers nothing for what is not a match pattern", () => {
    for (const pattern of ["", "example.com", "*://example.com", "ftp//x/*"])
      expect(patternCovers(pattern, url("https://example.com/")), pattern).toBe(
        false,
      );
  });
});

describe("patternsCoverHost", () => {
  it("is whether any pattern covers the host's pages", () => {
    expect(patternsCoverHost(["*://a.com/*", "*://b.com/*"], "b.com")).toBe(
      true,
    );
    expect(patternsCoverHost(["*://a.com/*"], "b.com")).toBe(false);
    expect(patternsCoverHost(["*://*/*"], "b.com")).toBe(true);
    expect(patternsCoverHost([], "b.com")).toBe(false);
  });
});

describe("articleMatches", () => {
  const VIDEO = ["*://www.youtube.com/*", "*://www.netflix.com/*"];

  it("is the granted origins without the video sites' static matches, sorted", () => {
    expect(
      articleMatches(
        [
          "*://www.youtube.com/*",
          "*://b.example/*",
          "*://www.netflix.com/*",
          "*://a.example/*",
        ],
        VIDEO,
      ),
    ).toEqual(["*://a.example/*", "*://b.example/*"]);
  });

  it("is none without article grants", () => {
    expect(articleMatches(VIDEO, VIDEO)).toEqual([]);
    expect(articleMatches([], VIDEO)).toEqual([]);
  });

  it("is every web page alone when every host is granted, as *://*/* or <all_urls>", () => {
    for (const all of ["*://*/*", "<all_urls>"])
      expect(articleMatches(["*://a.example/*", all], VIDEO), all).toEqual([
        "*://*/*",
      ]);
  });

  it("keeps other web patterns as Chrome gives them, once each", () => {
    expect(
      articleMatches(
        ["https://a.example/*", "*://*.b.example/*", "https://a.example/*"],
        VIDEO,
      ),
    ).toEqual(["*://*.b.example/*", "https://a.example/*"]);
  });

  it("leaves out patterns that are not for web pages", () => {
    expect(
      articleMatches(
        ["file:///*", "chrome://favicon/*", "*://a.example/*"],
        [],
      ),
    ).toEqual(["*://a.example/*"]);
  });
});
