import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { isParseError, parseEnvelope } from "./protocol";

const GOLDEN = join(import.meta.dirname, "../../../mobile/protocol");
/**
 * Shared files that are not envelopes: the ad-blocking lists both shells fetch, and the cases
 * of the shells' `SharedLink.resolve`.
 */
const NOT_ENVELOPES = new Set(["filter-lists.json", "shared-links.json"]);
const golden = readdirSync(GOLDEN)
  .filter((file) => file.endsWith(".json") && !NOT_ENVELOPES.has(file))
  .map((file) => ({
    file,
    value: JSON.parse(readFileSync(join(GOLDEN, file), "utf8")) as unknown,
  }));

describe("parseEnvelope", () => {
  test.each(golden.filter(({ file }) => file !== "bad-version.json"))(
    "reads $file as it is",
    ({ value }) => {
      expect(parseEnvelope(JSON.stringify(value))).toEqual(value);
    },
  );

  test("has every kind of envelope among the golden files", () => {
    expect(golden.map(({ file }) => file).sort()).toEqual([
      "app-hidden.json",
      "app-visible.json",
      "bad-version.json",
      "call.json",
      "content-height.json",
      "event-reply.json",
      "event.json",
      "get-current.json",
      "google-auth-cancelled.json",
      "google-auth-forget.json",
      "google-auth-token-reply.json",
      "google-auth-token.json",
      "hello.json",
      "models-ensure.json",
      "models-progress.json",
      "models-remove.json",
      "native-strings.json",
      "open-page.json",
      "page-sheet.json",
      "prepare-translator.json",
      "reply-error.json",
      "reply-ok.json",
      "share-file.json",
      "translate.json",
      "translator-status.json",
    ]);
  });

  test("rejects another protocol version", () => {
    const bad = golden.find(({ file }) => file === "bad-version.json");
    expect(parseEnvelope(JSON.stringify(bad?.value))).toEqual({
      error: "unsupported version 2",
    });
  });

  const call = { v: 1, kind: "call", id: "c1", api: "tabs.query", args: [{}] };
  test.each([
    ["an unknown kind", { ...call, kind: "ping" }],
    ["a call without an id", { ...call, id: undefined }],
    ["args that are not an array", { ...call, args: {} }],
    ["an unknown call api", { ...call, api: "identity.getAuthToken" }],
    [
      "an unknown event api",
      { v: 1, kind: "event", api: "tabs.onUpdated", args: [] },
    ],
    ["a reply without ok", { v: 1, kind: "reply", id: "c1" }],
    [
      "an error reply without a message",
      { v: 1, kind: "reply", id: "c1", ok: false, error: {} },
    ],
    [
      "an event with a replyId that is not a string",
      { ...eventOf(), replyId: 7 },
    ],
    ["something other than an object", [1, 2]],
  ])("rejects %s", (_, value) => {
    expect(isParseError(parseEnvelope(JSON.stringify(value)))).toBe(true);
  });

  test("rejects text that is not JSON", () => {
    expect(isParseError(parseEnvelope("{"))).toBe(true);
  });
});

function eventOf() {
  return { v: 1, kind: "event", api: "alarms.onAlarm", args: [{ name: "a" }] };
}
