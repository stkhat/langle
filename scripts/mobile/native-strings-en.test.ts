import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { appStrings } from "./native-strings-en.ts";

describe("appStrings", () => {
  test("is en.json's app. keys that are strings, and nothing else", () => {
    const en = JSON.parse(
      readFileSync(
        join(import.meta.dirname, "../../src/i18n/locales/en.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const strings = appStrings(en);
    expect(strings["app.home"]).toBe("Home");
    expect(Object.keys(strings).length).toBeGreaterThan(10);
    expect(Object.keys(strings).every((key) => key.startsWith("app."))).toBe(
      true,
    );
    expect(
      appStrings({ "app.a": "A", "app.b": { other: "B" }, "nav.c": "C" }),
    ).toEqual({ "app.a": "A" });
  });
});
