import { describe, expect, it } from "vitest";
import {
  agreed,
  chosen,
  CONSENT_VERSION,
  setupStage,
  type Setup,
} from "./setup";

describe("setupStage", () => {
  it("asks for consent while nothing is stored, or what is stored is damaged", () => {
    for (const raw of [
      undefined,
      null,
      true,
      "ready",
      [],
      {},
      { consent: "1" },
    ])
      expect(setupStage(raw), JSON.stringify(raw)).toBe("consent");
  });

  it("asks for the languages after consent", () => {
    expect(setupStage(agreed(undefined))).toBe("languages");
  });

  it("is ready once the languages are chosen after consent", () => {
    expect(setupStage(chosen(agreed(undefined)))).toBe("ready");
  });

  it("never takes chosen languages for consent", () => {
    expect(setupStage({ languages: true })).toBe("consent");
    expect(setupStage(chosen(undefined))).toBe("consent");
  });

  it("asks again when the disclosure changed, then skips the languages", () => {
    const old: Setup = { consent: CONSENT_VERSION - 1, languages: true };
    expect(setupStage(old)).toBe("consent");
    expect(setupStage(agreed(old))).toBe("ready");
  });

  it("does not take consent to another disclosure, newer ones included", () => {
    expect(setupStage({ consent: CONSENT_VERSION + 1, languages: true })).toBe(
      "consent",
    );
  });
});
