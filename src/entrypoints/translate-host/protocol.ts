// Messages between the Android app's native translation host and translate-host.html,
// JSON over the page's `langleBridge` (WebViewTranslationEngine.kt), which the
// page passes on to its Worker and back.

/** Native → page → Worker. */
export type EngineRequest =
  | {
      kind: "load";
      id: number;
      from: string;
      to: string;
      /** The model packs, in the order they translate (one, or two through English). */
      packs: string[];
    }
  | { kind: "translate"; id: number; from: string; to: string; text: string };

/** Worker → page → native. */
export type EngineAnswer =
  | { kind: "loaded"; id: number; ok: boolean; error?: string }
  | { kind: "translated"; id: number; text: string | null; error?: string };

/** Page → native, beside the answers. */
export type HostEvent =
  /** The page runs and its Worker started. */
  | { kind: "ready" }
  /** The Worker broke (an uncaught error, Bergamot aborted): the engine is gone. */
  | { kind: "failed"; error: string };

/** A request from native code, or undefined for anything else. */
export function parseRequest(text: string): EngineRequest | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const o = value as Record<string, unknown>;
  const strings = (...keys: string[]) =>
    keys.every((key) => typeof o[key] === "string");
  if (typeof o.id !== "number" || !strings("from", "to")) return undefined;
  if (
    o.kind === "load" &&
    Array.isArray(o.packs) &&
    o.packs.every((pack) => typeof pack === "string")
  )
    return value as EngineRequest;
  if (o.kind === "translate" && strings("text")) return value as EngineRequest;
  return undefined;
}
