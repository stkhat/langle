/**
 * The phone app's bridge protocol (docs/specs/mobile-app.md "Bridge protocol"): the
 * JSON envelopes between Langle's scripts and the app's native code. Kotlin and Swift
 * read and write the same envelopes; `mobile/protocol/` holds the golden files all
 * three sides are tested against.
 */
export const PROTOCOL_VERSION = 1;

/** What a script can ask native code to do. */
const CALL_APIS = [
  "bridge.hello",
  "runtime.sendMessage",
  "runtime.openOptionsPage",
  "runtime.reload",
  "storage.local.get",
  "storage.local.set",
  "storage.local.remove",
  "storage.local.clear",
  "storage.sync.get",
  "storage.sync.set",
  "storage.sync.remove",
  "storage.sync.clear",
  "storage.session.get",
  "storage.session.set",
  "storage.session.remove",
  "storage.session.clear",
  "tabs.query",
  "tabs.get",
  "tabs.getCurrent",
  "tabs.sendMessage",
  "tabs.create",
  "tabs.update",
  "tabs.remove",
  "tabs.reload",
  "action.openPopup",
  "alarms.create",
  "alarms.get",
  "alarms.clear",
  "appHost.openPage",
  "appHost.shareFile",
  "appHost.translate",
  "appHost.translatorStatus",
  "appHost.prepareTranslator",
  "appHost.models.ensure",
  "appHost.models.remove",
] as const;

/** What native code tells a script. */
const EVENT_APIS = [
  "runtime.onMessage",
  "runtime.onInstalled",
  "runtime.onStartup",
  "storage.onChanged",
  "alarms.onAlarm",
  "appHost.models.onProgress",
] as const;

export type CallApi = (typeof CALL_APIS)[number];
export type EventApi = (typeof EVENT_APIS)[number];

export interface Call {
  v: 1;
  kind: "call";
  id: string;
  api: CallApi;
  args: unknown[];
}

type Reply =
  | { v: 1; kind: "reply"; id: string; ok: true; value?: unknown }
  | { v: 1; kind: "reply"; id: string; ok: false; error: { message: string } };

/** `replyId`: the event expects an answer, sent as a reply with that id. */
interface Event {
  v: 1;
  kind: "event";
  api: EventApi;
  args: unknown[];
  replyId?: string;
}

export type Envelope = Call | Reply | Event;

const callApis: ReadonlySet<string> = new Set(CALL_APIS);
const eventApis: ReadonlySet<string> = new Set(EVENT_APIS);

/** Why a text is not an envelope. */
export interface ParseError {
  error: string;
}

/** Tells a parse error from an envelope (an error reply has an `error` too). */
export const isParseError = (
  result: Envelope | ParseError,
): result is ParseError => !("kind" in result);

/** Reads an envelope, or says why it is not one. */
export function parseEnvelope(json: string): Envelope | ParseError {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { error: "not JSON" };
  }
  if (!isRecord(value)) return { error: "not an object" };
  if (value.v !== PROTOCOL_VERSION)
    return { error: `unsupported version ${String(value.v)}` };
  switch (value.kind) {
    case "call":
      if (typeof value.id !== "string") return { error: "call without an id" };
      if (typeof value.api !== "string" || !callApis.has(value.api))
        return { error: `unknown call api ${String(value.api)}` };
      if (!Array.isArray(value.args)) return { error: "args is not an array" };
      return value as unknown as Call;
    case "reply":
      if (typeof value.id !== "string") return { error: "reply without an id" };
      if (value.ok === true) return value as unknown as Reply;
      if (
        value.ok === false &&
        isRecord(value.error) &&
        typeof value.error.message === "string"
      )
        return value as unknown as Reply;
      return { error: "reply without ok or an error message" };
    case "event":
      if (typeof value.api !== "string" || !eventApis.has(value.api))
        return { error: `unknown event api ${String(value.api)}` };
      if (!Array.isArray(value.args)) return { error: "args is not an array" };
      if (value.replyId !== undefined && typeof value.replyId !== "string")
        return { error: "replyId is not a string" };
      return value as unknown as Event;
    default:
      return { error: `unknown kind ${String(value.kind)}` };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
