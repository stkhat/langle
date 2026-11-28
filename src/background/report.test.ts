import { afterEach, describe, expect, it, vi } from "vitest";
import { isWorkerStopping, reportError } from "./report";

afterEach(() => vi.restoreAllMocks());

describe("isWorkerStopping", () => {
  it("knows Chrome's rejection of an API call while the worker stops", () => {
    expect(isWorkerStopping(new Error("No SW"))).toBe(true);
    // As errorText gives it.
    expect(isWorkerStopping("No SW")).toBe(true);
  });

  it("leaves every other failure alone", () => {
    for (const error of [
      new Error("QUOTA_BYTES quota exceeded"),
      new Error("No SW here"),
      "Failed to fetch",
      undefined,
      { message: "No SW" },
    ])
      expect(isWorkerStopping(error)).toBe(false);
  });
});

describe("reportError", () => {
  it("logs a failure, and nothing when it only says the worker is stopping", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("Database has been closed");
    reportError("Langle: could not write the pack state", failure);
    reportError("Langle: could not write the pack state", new Error("No SW"));
    reportError("No SW");
    expect(log.mock.calls).toEqual([
      ["Langle: could not write the pack state", failure],
    ]);
  });
});
