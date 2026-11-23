import { describe, expect, it } from "vitest";
import { builtInBackend } from "./backend";
import type { TranslatorGlobal } from "./translator";

/** A browser whose Translator API has the pair's model on the device. */
const withModel: TranslatorGlobal = {
  Translator: {
    availability: async () => "available",
    create: async () => ({ translate: async (text: string) => `ja(${text})` }),
  },
};

describe("builtInBackend", () => {
  it("translates with the browser's Translator API", async () => {
    const backend = builtInBackend(withModel);
    expect(await backend.available("en", "ja")).toBe(true);
    expect(await backend.create("en", "ja").translate("A cat.")).toBe(
      "ja(A cat.)",
    );
  });

  it("has no translator where the browser has no Translator API", async () => {
    const backend = builtInBackend({});
    expect(await backend.available("en", "ja")).toBe(false);
    expect(
      await backend.create("en", "ja").translate("A cat."),
    ).toBeUndefined();
  });
});
