import { describe, expect, it } from "vitest";
import { arrowStep, langAttrs, pointingStyle } from "./text-direction";

describe("pointingStyle", () => {
  it("mirrors an arrow in an Arabic interface only", () => {
    expect(pointingStyle("ar")).toEqual({ transform: "scaleX(-1)" });
    expect(pointingStyle("en")).toBeUndefined();
  });
});

describe("arrowStep", () => {
  it("goes on with the arrow that points along the line", () => {
    expect(arrowStep("ArrowRight", "en")).toBe(1);
    expect(arrowStep("ArrowLeft", "en")).toBe(-1);
    expect(arrowStep("ArrowRight", "ar")).toBe(-1);
    expect(arrowStep("ArrowLeft", "ar")).toBe(1);
    expect(arrowStep("Enter", "ar")).toBe(0);
  });
});

describe("langAttrs", () => {
  it("gives Arabic its direction in a left-to-right interface", () => {
    expect(langAttrs("ar", "en")).toEqual({ lang: "ar", dir: "rtl" });
    expect(langAttrs("ja", "en")).toEqual({ lang: "ja" });
  });

  it("gives other languages theirs in an Arabic interface", () => {
    expect(langAttrs("en", "ar")).toEqual({ lang: "en", dir: "ltr" });
    expect(langAttrs("ar", "ar")).toEqual({ lang: "ar" });
  });

  it("gives no language nothing", () => {
    expect(langAttrs(undefined, "ar")).toEqual({ lang: undefined });
  });

  it("reads the interface language", () => {
    expect(langAttrs("ar")).toEqual({ lang: "ar", dir: "rtl" });
  });
});
