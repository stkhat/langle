import type {
  ModelPackRequest,
  NativeStringSet,
  PairCodes,
  TranslateRequest,
  TranslatorStatus,
} from "../../core/app-host";
import { NO_RECEIVER, type Transport } from "../bridge/bridge";
import {
  isParseError,
  parseEnvelope,
  PROTOCOL_VERSION,
  type Call,
  type CallApi,
  type EventApi,
} from "../bridge/protocol";

/**
 * The app's native side in TypeScript, for tests: the router, the key-value store, tab
 * bookkeeping and alarms of docs/specs/mobile-app.md. The Kotlin and Swift routers
 * (M1, M2) copy its behaviour:
 * - native code fills in the sender of every message; nothing in an envelope says who
 *   sent it;
 * - a storage write saves, posts `storage.onChanged` to every context, and only then
 *   replies to the writer; a write that changes nothing posts nothing;
 * - a message for the extension host waits (up to `hostWaitMs`) for the host's hello,
 *   then fails with "Receiving end does not exist", as does a message whose receiver
 *   goes away before it answers;
 * - after the host's first hello in a process it gets `runtime.onInstalled` (first run,
 *   or a new build) or `runtime.onStartup`.
 */
export type ContextSpec =
  | { kind: "host" }
  | { kind: "content"; tabId: number; frameId?: number }
  | { kind: "page"; url: string; tabId?: number };

export interface Connection {
  /** The script side's transport, for `createBridge`. */
  transport: Transport;
  /** The context is gone (its page closed, its renderer lost). */
  disconnect(): void;
}

export interface Tab {
  id: number;
  url: string;
  active: boolean;
  windowId: number;
  incognito: false;
}

type Area = "local" | "sync" | "session";
type Store = Record<string, unknown>;

export interface ReferenceNativeOptions {
  id?: string;
  origin?: string;
  /** The bundled build's version. */
  version?: string;
  /** The version that ran before (kept by the app); none on the first run. */
  installedVersion?: string;
  /** What `storage.local` and `storage.sync` held when the process started. */
  local?: Store;
  sync?: Store;
  hostWaitMs?: number;
  /**
   * The app's translation host (M5c, M5d build the real ones). Without it every
   * translation call fails with `notAvailable(api)`, as the native routers' do.
   */
  translator?: ReferenceTranslator;
  timers?: {
    now(): number;
    setTimeout(run: () => void, ms: number): unknown;
    clearTimeout(timer: unknown): void;
  };
}

interface Context {
  spec: ContextSpec;
  ready: boolean;
  connected: boolean;
  receive?: (json: string) => void;
}

interface Forward {
  target: Context;
  settle(
    reply: { ok: true; value: unknown } | { ok: false; error: Error },
  ): void;
}

interface Alarm {
  name: string;
  scheduledTime: number;
  periodInMinutes?: number;
}

/**
 * A stand-in for the app's translation host and model downloads (the boundary the bridge
 * provider and the pack store are tested against). The router answers a translation
 * for a page not on screen (its tab not active) with null at once, never asking it.
 */
export interface ReferenceTranslator {
  status(pair: PairCodes): TranslatorStatus | Promise<TranslatorStatus>;
  translate(request: TranslateRequest): string | null | Promise<string | null>;
  /** iOS's consent sheet: the status once it closes. */
  prepare?(pair: PairCodes): TranslatorStatus | Promise<TranslatorStatus>;
  /**
   * Brings a model pack's files to the phone; `progress` posts
   * `appHost.models.onProgress` to the extension host. Rejects as the download fails.
   */
  ensure?(
    request: ModelPackRequest,
    progress: (received: number) => void,
  ): void | Promise<void>;
  remove?(pack: string): void | Promise<void>;
}

/** The error of a call the app cannot answer yet, the same text in all three routers. */
const notAvailable = (api: string) => `${api} is not available here.`;

const HOST_WAIT_MS = 10_000;
const MINUTE = 60_000;

export function createReferenceNative(options: ReferenceNativeOptions = {}) {
  const id = options.id ?? "langle-app";
  const origin = options.origin ?? "https://app.langle.invalid";
  const version = options.version ?? "1.0.0";
  let installedVersion = options.installedVersion;
  const timers = options.timers ?? {
    now: () => Date.now(),
    setTimeout: (run: () => void, ms: number) => setTimeout(run, ms),
    clearTimeout: (timer: unknown) =>
      clearTimeout(timer as ReturnType<typeof setTimeout>),
  };
  const hostWaitMs = options.hostWaitMs ?? HOST_WAIT_MS;

  const areas: Record<Area, Store> = {
    local: structuredClone(options.local ?? {}),
    sync: structuredClone(options.sync ?? {}),
    session: {},
  };
  const contexts = new Set<Context>();
  const tabs = new Map<number, Tab>();
  const forwards = new Map<string, Forward>();
  const alarms = new Map<string, { alarm: Alarm; timer: unknown }>();
  const hostWaiters = new Set<() => void>();
  const log: string[] = [];
  let started = false;
  let nativeStrings: NativeStringSet | undefined;
  let nextTab = 1;
  let nextReply = 0;

  const deliver = (context: Context, envelope: object) => {
    const json = JSON.stringify({ v: PROTOCOL_VERSION, ...envelope });
    queueMicrotask(() => {
      if (context.connected) context.receive?.(json);
    });
  };
  const postEvent = (context: Context, api: EventApi, ...args: unknown[]) =>
    deliver(context, { kind: "event", api, args });

  const host = () =>
    [...contexts].find((c) => c.spec.kind === "host" && c.ready);

  const sender = (context: Context) => {
    const { spec } = context;
    if (spec.kind === "host") return { id, url: `${origin}/`, origin };
    const tab = spec.tabId === undefined ? undefined : tabs.get(spec.tabId);
    const url = spec.kind === "page" ? spec.url : (tab?.url ?? "");
    return {
      id,
      url,
      origin: url ? new URL(url).origin : undefined,
      ...(tab && { tab: { ...tab } }),
      ...(spec.kind === "content" && { frameId: spec.frameId ?? 0 }),
    };
  };

  /** Sends a message as `runtime.onMessage` and resolves with the receiver's answer. */
  const forward = (target: Context, message: unknown, from: Context) =>
    new Promise<unknown>((resolve, reject) => {
      const replyId = `n${++nextReply}`;
      forwards.set(replyId, {
        target,
        settle: (reply) => {
          forwards.delete(replyId);
          if (reply.ok) resolve(reply.value);
          else reject(reply.error);
        },
      });
      deliver(target, {
        kind: "event",
        api: "runtime.onMessage",
        args: [message, sender(from)],
        replyId,
      });
    });

  const whenHostReady = () =>
    new Promise<Context>((resolve, reject) => {
      const ready = host();
      if (ready) return resolve(ready);
      const timer = timers.setTimeout(() => {
        hostWaiters.delete(waiter);
        reject(new Error(NO_RECEIVER));
      }, hostWaitMs);
      const waiter = () => {
        timers.clearTimeout(timer);
        const now = host();
        if (now) resolve(now);
      };
      hostWaiters.add(waiter);
    });

  const startHost = (context: Context) => {
    context.ready = true;
    if (!started) {
      started = true;
      if (installedVersion === undefined)
        postEvent(context, "runtime.onInstalled", { reason: "install" });
      else if (installedVersion !== version)
        postEvent(context, "runtime.onInstalled", {
          reason: "update",
          previousVersion: installedVersion,
        });
      else postEvent(context, "runtime.onStartup");
      installedVersion = version;
    }
    for (const waiter of [...hostWaiters]) {
      hostWaiters.delete(waiter);
      waiter();
    }
  };

  const write = (area: Area, next: Store) => {
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> =
      {};
    const store = areas[area];
    for (const key of new Set([...Object.keys(store), ...Object.keys(next)])) {
      const before = store[key];
      const after = next[key];
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      changes[key] = {
        ...(before !== undefined && { oldValue: before }),
        ...(after !== undefined && { newValue: after }),
      };
    }
    areas[area] = next;
    if (Object.keys(changes).length === 0) return;
    for (const context of contexts)
      postEvent(context, "storage.onChanged", changes, area);
  };

  const storage = (area: Area, op: string, args: unknown[]) => {
    const store = areas[area];
    switch (op) {
      case "get": {
        const keys = args[0] as string[] | null;
        const picked =
          keys === null
            ? store
            : Object.fromEntries(
                keys.filter((k) => k in store).map((k) => [k, store[k]]),
              );
        return structuredClone(picked);
      }
      case "set":
        return write(area, {
          ...store,
          ...structuredClone(args[0] as Store),
        });
      case "remove": {
        const removed = new Set(args[0] as string[]);
        return write(
          area,
          Object.fromEntries(
            Object.entries(store).filter(([key]) => !removed.has(key)),
          ),
        );
      }
      case "clear":
        return write(area, {});
    }
  };

  const activate = (tabId: number) => {
    for (const tab of tabs.values()) tab.active = tab.id === tabId;
  };

  const openTab = (url: string, active = true): Tab => {
    const tab: Tab = {
      id: nextTab++,
      url,
      active: false,
      windowId: 1,
      incognito: false,
    };
    tabs.set(tab.id, tab);
    if (active) activate(tab.id);
    return tab;
  };

  const tabOf = (tabId: unknown) => {
    const tab = tabs.get(tabId as number);
    if (!tab) throw new Error(`No tab with id: ${String(tabId)}.`);
    return tab;
  };

  const fire = (name: string) => {
    const entry = alarms.get(name);
    if (!entry) return;
    const { alarm } = entry;
    if (alarm.periodInMinutes)
      arm({
        ...alarm,
        scheduledTime: alarm.scheduledTime + alarm.periodInMinutes * MINUTE,
      });
    else alarms.delete(name);
    void whenHostReady().then(
      (context) => postEvent(context, "alarms.onAlarm", alarm),
      () => undefined,
    );
  };

  const arm = (alarm: Alarm) => {
    const old = alarms.get(alarm.name);
    if (old) timers.clearTimeout(old.timer);
    const timer = timers.setTimeout(
      () => fire(alarm.name),
      Math.max(0, alarm.scheduledTime - timers.now()),
    );
    alarms.set(alarm.name, { alarm, timer });
  };

  /** A page whose tab is not the one on screen (the host serves that one only). */
  const offScreen = ({ spec }: Context) =>
    spec.kind !== "host" &&
    spec.tabId !== undefined &&
    tabs.get(spec.tabId)?.active === false;

  const translation = (context: Context, api: CallApi, request: unknown) => {
    const service = options.translator;
    if (api === "appHost.translate") {
      if (!service) throw new Error(notAvailable(api));
      return offScreen(context)
        ? null
        : service.translate(request as TranslateRequest);
    }
    if (api === "appHost.translatorStatus") {
      if (!service) throw new Error(notAvailable(api));
      return service.status(request as PairCodes);
    }
    if (api === "appHost.prepareTranslator") {
      if (!service?.prepare) throw new Error(notAvailable(api));
      return service.prepare(request as PairCodes);
    }
    if (api === "appHost.models.ensure") {
      if (!service?.ensure) throw new Error(notAvailable(api));
      const model = request as ModelPackRequest;
      const total = model.files.reduce((sum, file) => sum + file.size, 0);
      return Promise.resolve(
        service.ensure(model, (received) => {
          const target = host();
          if (target)
            postEvent(target, "appHost.models.onProgress", {
              pack: model.pack,
              received,
              total,
            });
        }),
      ).then(() => undefined);
    }
    if (!service?.remove) throw new Error(notAvailable(api));
    return Promise.resolve(
      service.remove((request as { pack: string }).pack),
    ).then(() => undefined);
  };

  const handle = (context: Context, call: Call): unknown => {
    const { api, args } = call;
    switch (api) {
      case "bridge.hello":
        if (context.spec.kind === "host") startHost(context);
        else context.ready = true;
        return undefined;
      case "runtime.sendMessage":
        if (context.spec.kind === "host") throw new Error(NO_RECEIVER);
        return whenHostReady().then((target) =>
          forward(target, args[0], context),
        );
      case "tabs.sendMessage": {
        const [tabId, message, sendOptions] = args as [
          number,
          unknown,
          { frameId?: number } | undefined,
        ];
        const frameId = sendOptions?.frameId ?? 0;
        const target = [...contexts].find(
          ({ spec, ready }) =>
            ready &&
            spec.kind !== "host" &&
            spec.tabId === tabId &&
            (spec.kind === "page" || (spec.frameId ?? 0) === frameId),
        );
        if (!target) throw new Error(NO_RECEIVER);
        return forward(target, message, context);
      }
      case "runtime.openOptionsPage":
        openTab(`${origin}/options.html`);
        return undefined;
      case "runtime.reload":
      case "action.openPopup":
        log.push(api);
        return undefined;
      case "tabs.query": {
        const query = (args[0] ?? {}) as { active?: boolean; url?: string };
        return [...tabs.values()]
          .filter(
            (tab) => query.active === undefined || tab.active === query.active,
          )
          .filter((tab) => query.url === undefined || tab.url === query.url)
          .map((tab) => ({ ...tab }));
      }
      case "tabs.get":
        return { ...tabOf(args[0]) };
      // As Chrome: an app page's own tab; nothing from the host, a content script or a
      // page without a tab (the popup in its sheet).
      case "tabs.getCurrent": {
        const { spec } = context;
        const tab =
          spec.kind === "page" && spec.tabId !== undefined
            ? tabs.get(spec.tabId)
            : undefined;
        return tab && { ...tab };
      }
      case "tabs.create": {
        const { url = `${origin}/`, active = true } = (args[0] ?? {}) as {
          url?: string;
          active?: boolean;
        };
        return { ...openTab(new URL(url, `${origin}/`).href, active) };
      }
      case "tabs.update": {
        const [tabId, props] = (
          typeof args[0] === "number" ? args : [undefined, args[0]]
        ) as [number | undefined, { url?: string; active?: boolean }];
        const tab =
          tabId === undefined
            ? [...tabs.values()].find((t) => t.active)
            : tabOf(tabId);
        if (!tab) throw new Error("No active tab.");
        if (props.url) tab.url = new URL(props.url, `${origin}/`).href;
        if (props.active) activate(tab.id);
        return { ...tab };
      }
      case "tabs.remove":
        for (const tabId of [args[0]].flat()) {
          tabOf(tabId);
          tabs.delete(tabId as number);
        }
        return undefined;
      case "tabs.reload":
        log.push(`tabs.reload ${String(args[0])}`);
        return undefined;
      // The shells open the page over Home; here it is a tab like any other.
      case "appHost.openPage":
        openTab(new URL(String(args[0])).href);
        log.push(`appHost.openPage ${String(args[0])}`);
        return undefined;
      // The shells write the file under its name and show the share sheet.
      case "appHost.shareFile": {
        const file = sharedFile(args[0]);
        log.push(`appHost.shareFile ${file.name} ${file.mime} ${file.text}`);
        return undefined;
      }
      // The shells keep the strings and draw their bars with them.
      case "appHost.nativeStrings":
        nativeStrings = nativeStringSet(args[0]);
        return undefined;
      case "appHost.translate":
      case "appHost.translatorStatus":
      case "appHost.prepareTranslator":
      case "appHost.models.ensure":
      case "appHost.models.remove":
        return translation(context, api, args[0]);
      // The shells fill the slot in M7d; until then, as here, it is not available.
      case "appHost.googleAuth.token":
      case "appHost.googleAuth.forget":
        throw new Error(notAvailable(api));
      case "alarms.create": {
        const [name, info] = (
          typeof args[0] === "string" ? args : ["", args[0]]
        ) as [
          string,
          { when?: number; delayInMinutes?: number; periodInMinutes?: number },
        ];
        const delay = info.delayInMinutes ?? info.periodInMinutes ?? 0;
        arm({
          name,
          scheduledTime: info.when ?? timers.now() + delay * MINUTE,
          ...(info.periodInMinutes && {
            periodInMinutes: info.periodInMinutes,
          }),
        });
        return undefined;
      }
      case "alarms.get":
        return alarms.get(args[0] as string)?.alarm;
      case "alarms.clear": {
        const entry = alarms.get(args[0] as string);
        if (!entry) return false;
        timers.clearTimeout(entry.timer);
        alarms.delete(args[0] as string);
        return true;
      }
      default: {
        // storage.<area>.<get | set | remove | clear>
        const [, area, op] = api.split(".") as [string, Area, string];
        return storage(area, op, args);
      }
    }
  };

  const receive = (context: Context, json: string) => {
    const envelope = parseEnvelope(json);
    if (isParseError(envelope)) {
      console.error(`Reference native: ${envelope.error}`, json);
      const id = callIdOf(json);
      if (id !== undefined)
        deliver(context, {
          kind: "reply",
          id,
          ok: false,
          error: { message: envelope.error },
        });
      return;
    }
    if (envelope.kind === "reply") {
      const pending = forwards.get(envelope.id);
      if (!pending || pending.target !== context) return;
      pending.settle(
        envelope.ok
          ? { ok: true, value: envelope.value }
          : { ok: false, error: new Error(envelope.error.message) },
      );
      return;
    }
    if (envelope.kind === "event") {
      console.error(`Reference native: an event from a script`, json);
      return;
    }
    new Promise((resolve) => resolve(handle(context, envelope))).then(
      (value) =>
        deliver(context, { kind: "reply", id: envelope.id, ok: true, value }),
      (error: unknown) =>
        deliver(context, {
          kind: "reply",
          id: envelope.id,
          ok: false,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        }),
    );
  };

  return {
    /** Connects a script context; its scripts say hello when they have run. */
    connect(spec: ContextSpec): Connection {
      const context: Context = { spec, ready: false, connected: true };
      contexts.add(context);
      return {
        transport: {
          post: (json) =>
            queueMicrotask(() => {
              if (context.connected) receive(context, json);
            }),
          listen: (receiveJson) => {
            context.receive = receiveJson;
          },
        },
        disconnect: () => {
          context.connected = false;
          context.ready = false;
          contexts.delete(context);
          for (const pending of forwards.values())
            if (pending.target === context)
              pending.settle({ ok: false, error: new Error(NO_RECEIVER) });
        },
      };
    },
    /** A page the user opened (a web page in the browsing engine). */
    openTab: (url: string, active = true) => openTab(url, active).id,
    tabs: () => [...tabs.values()].map((tab) => ({ ...tab })),
    /** What the stores hold now. */
    stored: (area: Area) => structuredClone(areas[area]),
    /** What a new process would start from (the session area is not kept). */
    persisted: () => ({
      installedVersion,
      local: structuredClone(areas.local),
      sync: structuredClone(areas.sync),
    }),
    /** Calls with nothing to answer: `runtime.reload`, `action.openPopup`, `tabs.reload`. */
    log,
    /** The last strings `appHost.nativeStrings` gave, which the shells draw. */
    nativeStrings: () => nativeStrings && structuredClone(nativeStrings),
  };
}

/** The id of a call that could not be read, so it can be answered with the error. */
/** The error a bad `appHost.shareFile` gets, the same text in all three routers. */
export const SHARE_FILE_ERROR =
  "appHost.shareFile needs a plain file name, a media type and text.";

/**
 * `appHost.shareFile`'s file, checked as the shells check it before writing it: a plain
 * name (1–255 characters, no folder, no control character, not hidden), a type with a
 * slash, and text.
 */
function sharedFile(value: unknown): {
  name: string;
  mime: string;
  text: string;
} {
  const file = (value ?? {}) as Record<string, unknown>;
  const { name, mime, text } = file;
  if (
    typeof name !== "string" ||
    !isPlainFileName(name) ||
    typeof mime !== "string" ||
    !mime.includes("/") ||
    typeof text !== "string"
  )
    throw new Error(SHARE_FILE_ERROR);
  return { name, mime, text };
}

/** The error a bad `appHost.nativeStrings` gets, the same text in all three routers. */
export const NATIVE_STRINGS_ERROR =
  "appHost.nativeStrings needs a locale, a direction and strings.";

/**
 * `appHost.nativeStrings`' set, checked as the shells check it before keeping it: a
 * locale that is not empty, `ltr` or `rtl`, and strings that are all text.
 */
function nativeStringSet(value: unknown): NativeStringSet {
  const { locale, dir, strings } = (value ?? {}) as Record<string, unknown>;
  if (
    typeof locale !== "string" ||
    locale === "" ||
    (dir !== "ltr" && dir !== "rtl") ||
    typeof strings !== "object" ||
    strings === null ||
    Array.isArray(strings) ||
    !Object.values(strings).every((text) => typeof text === "string")
  )
    throw new Error(NATIVE_STRINGS_ERROR);
  return { locale, dir, strings: { ...(strings as Record<string, string>) } };
}

/** 1–255 UTF-16 units, not starting with a dot, with no slash, backslash or control character. */
function isPlainFileName(name: string): boolean {
  if (name.length < 1 || name.length > 255 || name.startsWith("."))
    return false;
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code < 0x20 || name[i] === "/" || name[i] === "\\") return false;
  }
  return true;
}

function callIdOf(json: string): string | undefined {
  try {
    const value = JSON.parse(json) as { kind?: unknown; id?: unknown };
    return value.kind === "call" && typeof value.id === "string"
      ? value.id
      : undefined;
  } catch {
    return undefined;
  }
}
