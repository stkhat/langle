import { describe, expect, it } from "vitest";
import {
  adBlockingOf,
  DEFAULT_AD_BLOCKING,
  listsUpdatedAt,
} from "./ad-blocking";

describe("adBlockingOf", () => {
  it("is on everywhere while nothing is stored", () => {
    expect(adBlockingOf(undefined)).toEqual({ on: true, offSites: [] });
    expect(adBlockingOf(null)).toEqual(DEFAULT_AD_BLOCKING);
    expect(adBlockingOf("off")).toEqual(DEFAULT_AD_BLOCKING);
  });

  it("keeps the stored switch and sites, each site once", () => {
    expect(
      adBlockingOf({ on: false, offSites: ["youtube.com", "a.com", "a.com"] }),
    ).toEqual({ on: false, offSites: ["youtube.com", "a.com"] });
  });

  it("reads a field of the wrong kind as its default", () => {
    expect(adBlockingOf({ on: 0, offSites: "a.com" })).toEqual({
      on: true,
      offSites: [],
    });
    expect(adBlockingOf({ offSites: ["", 1, "b.org"] })).toEqual({
      on: true,
      offSites: ["b.org"],
    });
  });
});

describe("listsUpdatedAt", () => {
  it("is the stored time, or none while the lists were never fetched", () => {
    expect(listsUpdatedAt({ updatedAt: 1_795_680_000_000 })).toBe(
      1_795_680_000_000,
    );
    for (const value of [
      undefined,
      {},
      { updatedAt: "2026-11-26" },
      { updatedAt: 0 },
      { updatedAt: Number.NaN },
    ])
      expect(listsUpdatedAt(value)).toBeUndefined();
  });
});
