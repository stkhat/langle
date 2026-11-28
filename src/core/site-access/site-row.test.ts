import { describe, expect, it } from "vitest";
import { langIs, siteRow, type SiteFacts } from "./site-row";

/** A first opening on an English article host without a grant, probed. */
const FIRST: SiteFacts = {
  host: "theweekendtable.example",
  answered: false,
  listOnly: false,
  granted: false,
  offListed: false,
  seenBefore: false,
  probe: { lang: "en" },
  learningLang: "en",
};

const row = (facts: Partial<SiteFacts>) => siteRow({ ...FIRST, ...facts });

describe("langIs", () => {
  it("reads the primary subtag as the mark's html[lang|=] does", () => {
    expect(langIs("en", "en")).toBe(true);
    expect(langIs("en-GB", "en")).toBe(true);
    expect(langIs("EN", "en")).toBe(true);
    expect(langIs(" en-us ", "en")).toBe(true);
    expect(langIs("eng", "en")).toBe(false);
    expect(langIs("fr", "en")).toBe(false);
    expect(langIs("", "en")).toBe(false);
    expect(langIs("en_US", "en")).toBe(false);
  });
});

describe("siteRow", () => {
  it("asks on the first opening on a page in the learning language", () => {
    expect(row({})).toBe("ask");
    expect(row({ probe: { lang: "en-GB" } })).toBe("ask");
    expect(row({ probe: { lang: "de-AT" }, learningLang: "de" })).toBe("ask");
  });

  it("shows the row plain on the first opening on a page in another language or none", () => {
    expect(row({ probe: { lang: "ja" } })).toBe("first");
    expect(row({ probe: { lang: "" } })).toBe("first");
    expect(row({ probe: { lang: "en" }, learningLang: "fr" })).toBe("first");
  });

  it("shows the switch off, plain, once the host was seen", () => {
    expect(row({ seenBefore: true })).toBe("later");
    expect(row({ seenBefore: true, offListed: true })).toBe("later");
  });

  it("is on where the host has a grant, and off where the off list covers it", () => {
    expect(row({ granted: true })).toBe("on");
    expect(row({ granted: true, seenBefore: true })).toBe("on");
    expect(row({ granted: true, offListed: true })).toBe("off");
    expect(row({ granted: true, answered: true, probe: undefined })).toBe("on");
  });

  it("trusts an answering script while the grant is still being asked", () => {
    expect(row({ answered: true, granted: undefined, probe: undefined })).toBe(
      "on",
    );
    expect(
      row({
        answered: true,
        granted: undefined,
        offListed: true,
        probe: undefined,
      }),
    ).toBe("off");
  });

  it("is hidden without a web page, on a failed probe, and while finding out", () => {
    expect(row({ host: undefined })).toBe("hidden");
    expect(row({ probe: "failed" })).toBe("hidden");
    expect(row({ probe: undefined })).toBe("hidden");
    expect(row({ granted: undefined })).toBe("hidden");
    expect(row({ seenBefore: undefined })).toBe("hidden");
  });

  it("keeps today's off-list switch on the video sites and without per-site access", () => {
    const listOnly = { listOnly: true, granted: undefined, probe: undefined };
    expect(row({ ...listOnly, answered: true })).toBe("on");
    expect(row({ ...listOnly, answered: true, offListed: true })).toBe("off");
    expect(row({ ...listOnly, answered: false })).toBe("hidden");
    expect(
      row({ ...listOnly, answered: true, seenBefore: false, granted: false }),
    ).toBe("on");
  });
});
