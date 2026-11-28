import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFile, filePath, parseFilePath } from "../../core/cloud/format";
import {
  mergeTimedSettings,
  stampSettings,
  type TimedSettings,
} from "../../core/cloud/settings";
import { gzip, decode } from "../../core/sync/codec";
import { metaKey, chunkKey, type SyncMeta } from "../../core/sync/layout";
import { snapshot } from "../../testing/cloud-devices";
import {
  createFakeCloud,
  type FakeAccount,
  type FakeCloud,
} from "../../testing/cloud-provider";
import { freshDb } from "../../testing/db";
import { ARTICLE } from "../../testing/sources";
import { createFakeSyncArea, type FakeSyncArea } from "../../testing/sync-area";
import { manualTimers } from "../../testing/timers";
import { mergeSettings, type SettingsPatch } from "../../core/settings";
import type { TermStatus } from "../../core/classify";
import type { LangleDb } from "../db";
import type { DeviceId } from "../device-id";
import { createHistoryStore, type HistoryStore } from "../history-store";
import { createTermStore, type TermStore } from "../term-store";
import {
  createBrowserSyncBackend,
  type BrowserSyncBackend,
} from "./browser-sync-backend";
import { readCopy } from "./cloud-copy";
import {
  CLOUD_CHECK_ALARM,
  CLOUD_SYNC_KEY,
  cloudAccount,
  cloudConnected,
  createCloudSyncBackend,
  WRITE_DELAY_MS,
  type CloudSettings,
  type CloudSyncBackend,
  type CloudSyncBackendOptions,
  type CloudSyncState,
} from "./cloud-sync-backend";

let time: number;
let running: { stop(): void }[];

beforeEach(() => {
  time = Date.UTC(2026, 10, 21, 9);
  running = [];
});

afterEach(() => {
  for (const r of running) r.stop();
});

/** Settings kept in memory with their field times, as `settings-store.ts` keeps them. */
function memorySettings() {
  let timed: TimedSettings = { values: mergeSettings({}), times: {} };
  const watchers = new Set<() => void>();
  const settings: CloudSettings & {
    change(patch: SettingsPatch): void;
    values(): TimedSettings["values"];
  } = {
    get: async () => structuredClone(timed),
    take: async (incoming) => {
      timed = mergeTimedSettings(timed, incoming);
    },
    choose: async (provider) => settings.change({ cloudProvider: provider }),
    watch(listener) {
      watchers.add(listener);
      return () => watchers.delete(listener);
    },
    change(patch) {
      timed = stampSettings(mergeSettings(patch, timed.values), time, timed);
      for (const listener of watchers) listener();
    },
    values: () => timed.values,
  };
  return settings;
}

function fakeAlarms() {
  const listeners = new Set<(alarm: { name: string }) => void>();
  const set = new Set<string>();
  return {
    set,
    async create(name: string) {
      set.add(name);
    },
    async clear(name: string) {
      return set.delete(name);
    },
    onAlarm: {
      addListener: (l: (alarm: { name: string }) => void) => listeners.add(l),
      removeListener: (l: (alarm: { name: string }) => void) =>
        listeners.delete(l),
    },
    fire(name: string) {
      for (const l of listeners) l({ name });
    },
  };
}

/** The phone app's `appHost.onHidden` / `onVisible`, fired by the test as the shells do. */
function fakeLifecycle() {
  const hidden = new Set<() => Promise<void>>();
  const visible = new Set<() => void>();
  return {
    onHidden(listener: () => Promise<void>) {
      hidden.add(listener);
      return () => void hidden.delete(listener);
    },
    onVisible(listener: () => void) {
      visible.add(listener);
      return () => void visible.delete(listener);
    },
    /** `app.hidden`: resolves once every listener is done, as the shim answers it. */
    async hide() {
      await Promise.all([...hidden].map((listener) => listener()));
    },
    show() {
      for (const listener of visible) listener();
    },
  };
}

function fakeDeviceId(initial: string): DeviceId {
  let id = initial;
  let renewals = 0;
  const get = async () => id;
  get.renew = async () => (id = `${initial}-${++renewals}`);
  return get;
}

interface Device {
  db: LangleDb;
  store: TermStore;
  history: HistoryStore;
  settings: ReturnType<typeof memorySettings>;
  ids: DeviceId;
  local: FakeSyncArea;
  alarms: ReturnType<typeof fakeAlarms>;
  timers: ReturnType<typeof manualTimers>;
  /** The app's lifecycle events (every device has them; only the app's shells send them). */
  lifecycle: ReturnType<typeof fakeLifecycle>;
  account: FakeAccount;
  browserSync: BrowserSyncBackend;
  backend: CloudSyncBackend;
  /** Lets listeners run, advances this device's timers by `ms`, then waits for its work. */
  after(ms?: number): Promise<void>;
  /** The data as plain values, for comparing devices. */
  data(): Promise<ReturnType<typeof snapshot>>;
  state(): Promise<CloudSyncState | undefined>;
}

/** Lets promise chains and storage writes started by listeners run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

interface DeviceOptions {
  id: string;
  cloud: FakeCloud;
  /** Browser sync's `storage.sync`, shared by devices on the same browser account. */
  area?: FakeSyncArea;
  /** Another device's `storage.local` and database, as a copied browser profile has. */
  copyOf?: Device;
}

function device({
  id,
  cloud,
  area = createFakeSyncArea(),
  copyOf,
}: DeviceOptions): Device {
  const db = freshDb();
  const ids = fakeDeviceId(id);
  const now = () => time;
  const store = createTermStore(db, { now, deviceId: ids });
  const history = createHistoryStore(db, { now, deviceId: ids });
  const settings = memorySettings();
  const local = createFakeSyncArea({
    quotaBytes: 1e9,
    quotaBytesPerItem: 1e9,
  });
  if (copyOf)
    for (const [k, v] of copyOf.local.data)
      local.data.set(k, structuredClone(v));
  const alarms = fakeAlarms();
  const timers = manualTimers();
  const lifecycle = fakeLifecycle();
  const account = cloud.account();
  const browserSync = createBrowserSyncBackend({
    store,
    area,
    onChanged: area.onChanged,
    now,
    timers,
    termsInCloud: () => cloudConnected(local),
  });
  const backend = createCloudSyncBackend({
    db,
    store,
    history,
    settings,
    deviceId: ids,
    providers: { googleDrive: cloud.provider(account) },
    browserSync,
    local,
    alarms,
    lifecycle,
    now,
    timers,
  });
  running.push(backend, browserSync);
  const self: Device = {
    db,
    store,
    history,
    settings,
    ids,
    local,
    alarms,
    timers,
    lifecycle,
    account,
    browserSync,
    backend,
    async after(ms = 0) {
      for (let round = 0; round < 3; round++) {
        await settle();
        timers.advance(round === 0 ? ms : 0);
        await backend.whenIdle();
        await browserSync.whenIdle();
      }
    },
    async data() {
      const { state } = await db.transaction(
        "r",
        [
          db.terms,
          db.sources,
          db.occurrences,
          db.meanings,
          db.meaningChoices,
          db.historyPages,
          db.historySentences,
          db.historyForgotten,
          db.meta,
        ],
        () => readCopy(db),
      );
      state.settings = await settings.get();
      return snapshot(state);
    },
    async state() {
      return (await local.get(CLOUD_SYNC_KEY))[CLOUD_SYNC_KEY] as
        CloudSyncState | undefined;
    },
  };
  return self;
}

/** The worker again over `d`'s storage and database, with `providers` only. */
function restart(d: Device, providers: CloudSyncBackendOptions["providers"]) {
  const backend = createCloudSyncBackend({
    db: d.db,
    store: d.store,
    history: d.history,
    settings: d.settings,
    deviceId: d.ids,
    providers,
    browserSync: d.browserSync,
    local: d.local,
    alarms: d.alarms,
    lifecycle: d.lifecycle,
    now: () => time,
    timers: d.timers,
  });
  running.push(backend);
  return backend;
}

async function startAll(...devices: Device[]) {
  for (const d of devices) await d.backend.start();
}

const save = (
  d: Device,
  key: string,
  status: TermStatus = "learning",
  sentence = `About ${key}.`,
) =>
  d.store.saveTerm({
    lang: "en",
    key,
    display: key,
    kind: key.includes(" ") ? "phrase" : "word",
    status,
    source: ARTICLE,
    sentence,
    pos: { textQuote: sentence },
  });

const keysOf = async (d: Device) =>
  (await d.store.listTerms("en")).map((t) => `${t.key}:${t.status}`);

/** The data without settings: devices on separate fakes merge settings the same way. */
async function sameData(a: Device, b: Device) {
  const [x, y] = await Promise.all([a.data(), b.data()]);
  expect({ ...x, settings: undefined }).toEqual({ ...y, settings: undefined });
}

const writesOf = (cloud: FakeCloud, folder: string) =>
  cloud.log.filter(
    (e) => e.op === "write" && parseFilePath(e.path!)?.deviceId === folder,
  ).length;

describe("CloudSyncBackend: two devices", () => {
  it("merges terms, occurrences and settings across devices", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await save(a, "loaf");
    a.settings.change({ knownLevel: 5000 });
    await a.backend.connect("googleDrive");
    await save(b, "knead", "known");
    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["knead:known", "loaf:learning"]);
    expect(b.settings.values().knownLevel).toBe(5000);
    expect(b.settings.values().cloudProvider).toBe("googleDrive");

    a.backend.requestCheck();
    await a.after();
    expect(await keysOf(a)).toEqual(["knead:known", "loaf:learning"]);
    await sameData(a, b);
    expect(cloud.paths()).toEqual([
      "devices/dev-a/main.json.gz",
      "devices/dev-a/occurrences-2026-11.json.gz",
      "devices/dev-b/main.json.gz",
      "devices/dev-b/occurrences-2026-11.json.gz",
    ]);
    expect(await a.backend.status()).toMatchObject({
      provider: "googleDrive",
      devices: 2,
      lastSavedAt: time,
      lastCheckedAt: time,
    });
    expect((await a.backend.status()).bytes).toBeGreaterThan(0);
  });

  it("writes 30 s after the last local change, main only after a local one", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await a.backend.connect("googleDrive");
    await b.backend.connect("googleDrive");
    const before = writesOf(cloud, "dev-a");

    await save(a, "loaf");
    await a.after(WRITE_DELAY_MS - 1000);
    await save(a, "rise");
    await a.after(WRITE_DELAY_MS - 1000);
    expect(writesOf(cloud, "dev-a")).toBe(before);
    await a.after(1000);
    // The month file, then main.
    expect(writesOf(cloud, "dev-a")).toBe(before + 2);

    // Taking in another device's change writes nothing.
    const bWrites = writesOf(cloud, "dev-b");
    b.alarms.fire(CLOUD_CHECK_ALARM);
    await b.after(WRITE_DELAY_MS);
    expect(await keysOf(b)).toEqual(["loaf:learning", "rise:learning"]);
    expect(writesOf(cloud, "dev-b")).toBe(bWrites);
  });

  it("lists first and downloads only the files whose modified time changed", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await save(a, "loaf");
    await a.backend.connect("googleDrive");
    await b.backend.connect("googleDrive");
    const reads = () => cloud.log.filter((e) => e.op === "read").length;
    const before = reads();
    b.backend.requestCheck();
    await b.after();
    expect(reads()).toBe(before);

    await a.store.setStatus("en:loaf", "known");
    await a.after(WRITE_DELAY_MS);
    b.backend.requestCheck();
    await b.after();
    // Only a's main changed (no new row).
    expect(reads()).toBe(before + 1);
    expect(await keysOf(b)).toEqual(["loaf:known"]);
  });

  it("does the writes left from before at the next start", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await a.backend.connect("googleDrive");
    await save(a, "loaf");
    await a.after();
    expect((await a.state())?.mainPending).toBe(true);
    a.backend.stop();

    // The worker starts again over the same storage and database.
    const again = createCloudSyncBackend({
      db: a.db,
      store: a.store,
      history: a.history,
      settings: a.settings,
      deviceId: a.ids,
      providers: { googleDrive: cloud.provider(a.account) },
      browserSync: a.browserSync,
      local: a.local,
      alarms: a.alarms,
      now: () => time,
      timers: a.timers,
    });
    running.push(again);
    await again.start();
    expect((await a.state())?.mainPending).toBe(false);
    const b = device({ id: "dev-b", cloud });
    await startAll(b);
    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["loaf:learning"]);
  });

  it("the phone app: going to the background writes at once, coming back reads", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await a.backend.connect("googleDrive");
    await b.backend.connect("googleDrive");
    const before = writesOf(cloud, "dev-a");

    await save(a, "loaf");
    await a.after(1000);
    expect(writesOf(cloud, "dev-a")).toBe(before);
    // Resolves only once the writes are done: the shell lets the app sleep then.
    await a.lifecycle.hide();
    expect(writesOf(cloud, "dev-a")).toBe(before + 2);
    expect((await a.state())?.mainPending).toBe(false);
    // Nothing is left for the 30 s timer.
    await a.after(WRITE_DELAY_MS);
    expect(writesOf(cloud, "dev-a")).toBe(before + 2);
    // Nothing pending: nothing written.
    await a.lifecycle.hide();
    expect(writesOf(cloud, "dev-a")).toBe(before + 2);

    const lists = () => cloud.log.filter((e) => e.op === "list").length;
    const listed = lists();
    b.lifecycle.show();
    await b.after();
    expect(lists()).toBe(listed + 1);
    expect(await keysOf(b)).toEqual(["loaf:learning"]);

    // Stopped: the events are not heard.
    b.backend.stop();
    b.lifecycle.show();
    await b.after();
    expect(lists()).toBe(listed + 1);
  });

  it("a write whose local read fails is tried again later", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await a.backend.connect("googleDrive");
    const before = writesOf(cloud, "dev-a");
    await save(a, "loaf");
    await a.after(1000);
    // As WebKit does on iOS when it suspends the app's processes: the read is broken off.
    const get = a.settings.get;
    a.settings.get = async () => {
      a.settings.get = get;
      throw new Error(
        "Attempt to get records from database without an in-progress transaction",
      );
    };
    // Counted as a passing failure, as an error that is not the cloud's is: no error log.
    await a.lifecycle.hide();
    expect(writesOf(cloud, "dev-a")).toBe(before);
    expect((await a.state())?.mainPending).toBe(true);
    // Not shown (a retry goes on by itself), and done at the retry.
    expect((await a.state())?.error).toBe("retrying");
    await a.after(15_000);
    expect(writesOf(cloud, "dev-a")).toBe(before + 2);
    expect((await a.state())?.mainPending).toBe(false);
    expect((await a.state())?.error).toBeUndefined();
  });

  it("reads a month file before its main, and takes its rows once the main comes", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await a.backend.connect("googleDrive");
    await b.backend.connect("googleDrive");
    await save(a, "loaf");
    await a.after(WRITE_DELAY_MS);

    // b lists while a's new main is not there yet: only the month file.
    const main = filePath("dev-a", "main");
    const newMain = cloud.stored.get(main)!;
    cloud.stored.delete(main);
    b.backend.requestCheck();
    await b.after();
    expect(await keysOf(b)).toEqual([]);
    expect((await b.state())?.reread).toEqual([
      "devices/dev-a/occurrences-2026-11.json.gz",
    ]);

    cloud.stored.set(main, newMain);
    b.backend.requestCheck();
    await b.after();
    expect(await keysOf(b)).toEqual(["loaf:learning"]);
    expect(
      (await b.store.occurrencesOf("en:loaf")).map((o) => o.sentence),
    ).toEqual(["About loaf."]);
    expect((await b.state())?.reread).toEqual([]);
  });

  it("starts a new folder when its main was written by a copied profile", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await save(a, "loaf");
    await a.backend.connect("googleDrive");

    // A copy of a's browser profile: the same storage.local (device id, connection).
    const copy = device({ id: "dev-a", cloud, copyOf: a });
    // The copied profile is signed in as well.
    await copy.account.token({ interactive: true });
    await startAll(copy);
    time += 60_000;
    await save(copy, "rise");
    await copy.after(WRITE_DELAY_MS);

    a.backend.requestCheck();
    await a.after();
    expect(await a.ids()).not.toBe("dev-a");
    await a.after(WRITE_DELAY_MS);
    expect(
      new Set(cloud.paths().map((p) => parseFilePath(p)!.deviceId)),
    ).toEqual(new Set(["dev-a", await a.ids()]));
    expect(await keysOf(a)).toEqual(["loaf:learning", "rise:learning"]);

    copy.backend.requestCheck();
    await copy.after();
    expect(await copy.ids()).toBe("dev-a");
    expect(await keysOf(copy)).toEqual(["loaf:learning", "rise:learning"]);
  });
});

describe("CloudSyncBackend: browser sync", () => {
  async function syncedKeys(area: FakeSyncArea) {
    const meta = area.data.get(metaKey("en")) as SyncMeta | undefined;
    if (!meta) return [];
    const chunks = Array.from(
      { length: meta.chunks },
      (_, i) => area.data.get(chunkKey("en", i)) as string,
    );
    return (await decode(chunks)).map((r) => r.key);
  }

  it("pulls browser sync's terms when connecting, stops while connected, and resumes after", async () => {
    const cloud = createFakeCloud();
    const area = createFakeSyncArea();
    const other = device({ id: "dev-other", cloud, area });
    const a = device({ id: "dev-a", cloud, area });
    await other.browserSync.start();
    await a.browserSync.start();
    await startAll(a);
    await save(other, "knead");
    await other.after(5_000);
    expect(await syncedKeys(area)).toEqual(["knead"]);

    await a.backend.connect("googleDrive");
    expect(await keysOf(a)).toEqual(["knead:learning"]);
    const b = device({ id: "dev-b", cloud });
    await startAll(b);
    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["knead:learning"]);

    // While connected, terms are not written to storage.sync.
    time += 60_000;
    await save(a, "loaf");
    await a.after(WRITE_DELAY_MS);
    expect(await syncedKeys(area)).toEqual(["knead"]);
    expect((await a.browserSync.status()).termsInCloud).toBe(true);

    await a.backend.disconnect();
    await a.after(5_000);
    expect(await syncedKeys(area)).toEqual(["knead", "loaf"]);
    expect(await a.state()).toBeUndefined();
    expect(await a.backend.status()).toEqual({
      available: ["googleDrive"],
      bytes: 0,
      devices: 0,
    });
    expect(a.settings.values().cloudProvider).toBe("none");
    expect(a.alarms.set.has(CLOUD_CHECK_ALARM)).toBe(false);
    expect((await a.browserSync.status()).termsInCloud).toBe(false);
  });
});

describe("CloudSyncBackend: errors", () => {
  it("renews a refused token without a window, and asks to reconnect when it cannot", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await a.backend.connect("googleDrive");

    a.account.expire();
    await save(a, "loaf");
    await a.after(WRITE_DELAY_MS);
    expect((await a.backend.status()).error).toBeUndefined();
    expect((await a.state())?.mainPending).toBe(false);

    a.account.expire();
    a.account.silent = false;
    await save(a, "rise");
    await a.after(WRITE_DELAY_MS);
    expect((await a.backend.status()).error).toBe("reconnect");
    // Changes keep collecting on the device.
    expect(await keysOf(a)).toEqual(["loaf:learning", "rise:learning"]);
    expect((await a.state())?.mainPending).toBe(true);

    a.account.silent = true;
    await a.backend.connect("googleDrive");
    expect((await a.backend.status()).error).toBeUndefined();
    const b = device({ id: "dev-b", cloud });
    await startAll(b);
    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["loaf:learning", "rise:learning"]);
  });

  it("retries a rate limit with backoff", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await a.backend.connect("googleDrive");
    cloud.failNext("retry", { ops: ["write"], retryAfterMs: 20_000 });
    await save(a, "loaf");
    await a.after(WRITE_DELAY_MS);
    expect((await a.backend.status()).error).toBe("retrying");
    expect(a.timers.next()).toBe(20_000);

    cloud.failNext("retry", { ops: ["list"] });
    await a.after(20_000);
    expect((await a.backend.status()).error).toBe("retrying");
    // Doubled, and never more than 10 minutes.
    expect(a.timers.next()).toBe(30_000);
    await a.after(30_000);
    expect((await a.backend.status()).error).toBeUndefined();
    expect((await a.state())?.mainPending).toBe(false);
  });

  it("stops writing while the storage is full, and loses nothing", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await a.backend.connect("googleDrive");
    cloud.failNext("full", { ops: ["write"] });
    await save(a, "loaf");
    await a.after(WRITE_DELAY_MS);
    expect((await a.backend.status()).error).toBe("full");
    expect(a.timers.next()).toBeUndefined();
    expect(await keysOf(a)).toEqual(["loaf:learning"]);

    // The next change tries again.
    await save(a, "rise");
    await a.after(WRITE_DELAY_MS);
    expect((await a.backend.status()).error).toBeUndefined();
  });

  it("skips another device's file of a newer version and asks for an update", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await save(a, "loaf");
    await a.backend.connect("googleDrive");
    const newer = await gzip(
      JSON.stringify({
        format: "langle-cloud",
        v: 2,
        kind: "main",
        deviceId: "dev-new",
        writtenAt: time,
      }),
    );
    cloud.stored.set(filePath("dev-new", "main"), {
      bytes: newer,
      modifiedTime: 1,
    });
    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["loaf:learning"]);
    expect(await b.backend.status()).toMatchObject({
      error: "update",
      devices: 3,
    });
    const reads = cloud.log.filter((e) => e.op === "read").length;
    b.backend.requestCheck();
    await b.after();
    expect(cloud.log.filter((e) => e.op === "read").length).toBe(reads);
  });
});

describe("CloudSyncBackend: damaged files", () => {
  afterEach(() => vi.restoreAllMocks());

  const reads = (cloud: FakeCloud, path: string) =>
    cloud.log.filter((e) => e.op === "read" && e.path === path).length;

  /** `path` in the cloud again with `change` made to its JSON, as a new version. */
  async function damage(
    cloud: FakeCloud,
    path: string,
    change: (data: Record<string, unknown[]>) => void,
  ) {
    const stored = cloud.stored.get(path)!;
    const decoded = await decodeFile(stored.bytes);
    if (decoded.status !== "ok") throw new Error(`${path}: ${decoded.status}`);
    const data = structuredClone(decoded.file) as unknown as Record<
      string,
      unknown[]
    >;
    change(data);
    cloud.stored.set(path, {
      bytes: await gzip(JSON.stringify(data)),
      modifiedTime: stored.modifiedTime + 1000,
    });
  }

  /** What went to the error log, sorted (files are read in the list's order). */
  const logged = (errors: { mock: { calls: unknown[][] } }) =>
    errors.mock.calls.map((call) => String(call[0])).sort();

  it("takes in another device's damaged file row by row, logs it once per version and shows nothing", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await save(a, "loaf");
    await save(a, "rise");
    await a.backend.connect("googleDrive");
    a.backend.stop();
    const main = filePath("dev-a", "main");
    const month = filePath("dev-a", "occurrences", "2026-11");
    const wrongTerm = (data: Record<string, unknown[]>) =>
      data.terms!.push({ ...(data.terms![0] as object), id: "en:wrong" });
    await damage(cloud, main, wrongTerm);
    await damage(cloud, month, (data) => {
      (data.occurrences![1] as { pos: unknown }).pos = { line: 3 };
    });
    const errors = vi.spyOn(console, "error");

    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["loaf:learning", "rise:learning"]);
    expect(await b.store.occurrencesOf("en:loaf")).toHaveLength(1);
    expect(await b.store.occurrencesOf("en:rise")).toHaveLength(0);
    expect((await b.backend.status()).error).toBeUndefined();
    expect(logged(errors)).toEqual([
      expect.stringMatching(
        /^Cloud sync: devices\/dev-a\/main\.json\.gz \(modified .+\): one row that fails its check left out: terms\[2\] /,
      ),
      expect.stringMatching(
        /^Cloud sync: devices\/dev-a\/occurrences-2026-11\.json\.gz \(modified .+\): one row that fails its check left out: occurrences\[1\] /,
      ),
    ]);

    // Not read again until it changes; then read and logged again.
    const before = reads(cloud, main);
    b.backend.requestCheck();
    await b.after();
    expect(reads(cloud, main)).toBe(before);
    expect(errors).toHaveBeenCalledTimes(2);
    await damage(cloud, main, wrongTerm);
    b.backend.requestCheck();
    await b.after();
    expect(reads(cloud, main)).toBe(before + 1);
    expect(errors).toHaveBeenCalledTimes(3);
    expect((await b.backend.status()).error).toBeUndefined();
  });

  it("skips a file it cannot read at all, logs it once and shows nothing; reads it again once modified", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await save(a, "loaf");
    await a.backend.connect("googleDrive");
    const gone = filePath("dev-gone", "main");
    cloud.stored.set(gone, {
      bytes: new Uint8Array([1, 2, 3]),
      modifiedTime: 1,
    });
    const errors = vi.spyOn(console, "error");

    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["loaf:learning"]);
    expect(await b.backend.status()).toMatchObject({ devices: 3 });
    expect((await b.backend.status()).error).toBeUndefined();
    expect(logged(errors)).toEqual([
      expect.stringMatching(
        /^Cloud sync: devices\/dev-gone\/main\.json\.gz \(modified .+\) cannot be read: not gzipped JSON$/,
      ),
    ]);
    expect((await b.state())!.broken).toEqual({ [gone]: 1 });

    b.backend.requestCheck();
    await b.after();
    expect(reads(cloud, gone)).toBe(1);
    expect(errors).toHaveBeenCalledTimes(1);

    // Written again (here: a readable main): read, and no longer broken.
    cloud.stored.set(gone, {
      bytes: cloud.stored.get(filePath("dev-a", "main"))!.bytes,
      modifiedTime: 2,
    });
    b.backend.requestCheck();
    await b.after();
    expect(reads(cloud, gone)).toBe(2);
    expect((await b.state())!.broken).toEqual({});
    expect((await b.state())!.seen[gone]).toBe(2);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("reads once more the unreadable files an older build kept, so a broken one stops asking for an update", async () => {
    const cloud = createFakeCloud();
    const b = device({ id: "dev-b", cloud });
    await startAll(b);
    await b.backend.connect("googleDrive");
    const gone = filePath("dev-gone", "main");
    const later = filePath("dev-new", "main");
    cloud.stored.set(gone, { bytes: new Uint8Array([1]), modifiedTime: 1 });
    cloud.stored.set(later, {
      bytes: await gzip(JSON.stringify({ format: "langle-cloud", v: 2 })),
      modifiedTime: 1,
    });
    b.backend.stop();
    // As a build from before `newer` and `broken` left it: both in `unreadable`.
    const old: Partial<CloudSyncState> = {
      ...(await b.state())!,
      unreadable: { [gone]: 1, [later]: 1 },
    };
    delete old.newer;
    delete old.broken;
    await b.local.set({ [CLOUD_SYNC_KEY]: old });
    vi.spyOn(console, "error");

    const again = restart(b, { googleDrive: cloud.provider(b.account) });
    await again.start();
    await b.after();
    expect([reads(cloud, gone), reads(cloud, later)]).toEqual([1, 1]);
    expect(await b.state()).toMatchObject({
      unreadable: {},
      broken: { [gone]: 1 },
      newer: { [later]: 1 },
    });
    // Only the newer file asks for an update.
    expect((await again.status()).error).toBe("update");
    cloud.stored.delete(later);
    again.requestCheck();
    await b.after();
    expect((await again.status()).error).toBeUndefined();
  });

  it("leaves out of its files a row other devices would refuse, and logs it once", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await save(a, "loaf");
    await a.backend.connect("googleDrive");
    // Stored before the stores checked what they keep: a platform that is none.
    await a.db.sources.put({
      id: "bad",
      platform: "article" as "web",
      url: "https://x.example/",
      title: "X",
      lang: "en",
      firstSeen: time,
      lastSeen: time,
    });
    await a.db.occurrences.add({
      termId: "en:loaf",
      sourceId: "bad",
      sentence: "Bad.",
      pos: { textQuote: "Bad." },
      seenAt: time,
      origin: "encountered",
      deviceId: "dev-a",
      addedAt: time,
    });
    const errors = vi.spyOn(console, "error");
    await save(a, "rise");
    await a.after(WRITE_DELAY_MS);
    await save(a, "knead");
    await a.after(WRITE_DELAY_MS);

    const month = await decodeFile(
      cloud.stored.get(filePath("dev-a", "occurrences", "2026-11"))!.bytes,
    );
    expect(month).toMatchObject({ status: "ok", skipped: [] });
    if (month.status !== "ok" || month.file.kind !== "occurrences")
      throw new Error("month");
    expect(month.file.sources.map((s) => s.id)).not.toContain("bad");
    expect(month.file.occurrences.map((o) => o.sentence)).not.toContain("Bad.");
    expect(logged(errors)).toEqual([
      expect.stringMatching(
        /^Cloud sync: devices\/dev-a\/main\.json\.gz as written: one row that fails its check left out: sources\[\d\] .*"article"/,
      ),
      expect.stringMatching(
        /^Cloud sync: devices\/dev-a\/occurrences-2026-11\.json\.gz as written: 2 rows that fail their check left out: sources\[\d\] .*; occurrences\[\d\] /,
      ),
    ]);

    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual([
      "knead:learning",
      "loaf:learning",
      "rise:learning",
    ]);
    expect(errors).toHaveBeenCalledTimes(2);
  });
});

describe("CloudSyncBackend: sentence history", () => {
  const record = (d: Device, text: string) =>
    d.history.record(ARTICLE, [
      { text, pos: { textQuote: text }, keys: ["en:loaf"] },
    ]);

  it("sends history while “Also save to” is on; off removes only its own history files", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    await record(a, "A loaf of bread.");
    await a.backend.connect("googleDrive");
    await record(b, "Bake a loaf.");
    await b.backend.connect("googleDrive");
    a.backend.requestCheck();
    await a.after();
    await sameData(a, b);
    expect(cloud.paths()).toContain("devices/dev-a/history-2026-11.json.gz");

    a.settings.change({ cloudHistory: false });
    await a.after(WRITE_DELAY_MS);
    expect(cloud.paths()).not.toContain(
      "devices/dev-a/history-2026-11.json.gz",
    );
    expect(cloud.paths()).toContain("devices/dev-b/history-2026-11.json.gz");

    // On again: the whole kept history is sent again.
    a.settings.change({ cloudHistory: true });
    await a.after(WRITE_DELAY_MS);
    expect(cloud.paths()).toContain("devices/dev-a/history-2026-11.json.gz");
  });
});

describe("CloudSyncBackend: connect", () => {
  it("leaves things as they were when the sign-in window is closed or declined", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    a.account.declines = true;
    await a.backend.connect("googleDrive");
    expect(await a.state()).toBeUndefined();
    expect((await a.backend.status()).provider).toBeUndefined();
    expect(cloud.log).toHaveLength(0);

    // Declining a reconnect keeps the connection and its "Reconnect needed".
    a.account.declines = false;
    await a.backend.connect("googleDrive");
    a.account.silent = false;
    a.account.expire();
    a.alarms.fire(CLOUD_CHECK_ALARM);
    await a.after();
    expect((await a.backend.status()).error).toBe("reconnect");
    a.account.declines = true;
    await a.backend.connect("googleDrive");
    expect((await a.backend.status()).error).toBe("reconnect");
  });
});

describe("CloudSyncBackend: a provider this build does not have", () => {
  it("uses no cloud, logs nothing and shows it as not connected; a build that has it carries on", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await a.backend.connect("googleDrive");
    a.backend.stop();
    const kept = await a.state();
    const calls = cloud.log.length;
    const errors = vi.spyOn(console, "error");

    // The phone lost Google Play services: the stored connection names googleDrive.
    const without = restart(a, {});
    await without.start();
    await save(a, "loaf");
    a.alarms.fire(CLOUD_CHECK_ALARM);
    without.requestCheck();
    a.lifecycle.show();
    await a.lifecycle.hide();
    await a.after(WRITE_DELAY_MS);
    a.lifecycle.show();
    await a.after(10 * 60_000);
    expect(cloud.log).toHaveLength(calls);
    expect(errors).not.toHaveBeenCalled();
    expect(a.timers.next()).toBeUndefined();
    expect(a.alarms.set.has(CLOUD_CHECK_ALARM)).toBe(false);
    expect(await without.status()).toEqual({
      available: [],
      bytes: 0,
      devices: 0,
    });
    // A page shown before the provider went: connecting changes nothing.
    await without.connect("googleDrive");
    expect(cloud.log).toHaveLength(calls);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    // The connection is kept, with the change still to write.
    expect(await a.state()).toEqual({
      ...kept,
      mainPending: true,
      monthsPending: true,
    });
    without.stop();

    // Play services came back: the change goes out, and another device gets it.
    const again = restart(a, { googleDrive: cloud.provider(a.account) });
    await again.start();
    expect((await again.status()).provider).toBe("googleDrive");
    expect(a.alarms.set.has(CLOUD_CHECK_ALARM)).toBe(true);
    expect((await a.state())?.mainPending).toBe(false);
    const b = device({ id: "dev-b", cloud });
    await startAll(b);
    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["loaf:learning"]);
  });
});

describe("CloudSyncBackend: account", () => {
  it("keeps the account's address on this device from connect until disconnect", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await a.backend.connect("googleDrive");
    expect((await a.backend.status()).account).toBe("alex.kim@gmail.com");
    expect((await a.state())?.account).toBe("alex.kim@gmail.com");
    expect(await cloudAccount(a.local)).toBe("alex.kim@gmail.com");
    expect(a.settings.values()).not.toHaveProperty("account");

    // Asked once: later checks keep it.
    a.alarms.fire(CLOUD_CHECK_ALARM);
    await a.after();
    expect(cloud.log.filter((e) => e.op === "account")).toHaveLength(1);

    await a.backend.disconnect();
    expect(await a.state()).toBeUndefined();
    expect((await a.backend.status()).account).toBeUndefined();
    expect(await cloudAccount(a.local)).toBeUndefined();
  });

  it("asks again when reconnecting, since the window may sign in with another account", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    await startAll(a);
    await a.backend.connect("googleDrive");
    a.account.address = "sam.lee@gmail.com";
    await a.backend.connect("googleDrive");
    expect((await a.backend.status()).account).toBe("sam.lee@gmail.com");
  });

  it("syncs when the lookup fails, and looks it up again at the next check", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    const b = device({ id: "dev-b", cloud });
    await startAll(a, b);
    cloud.failNext("unauthorized", { ops: ["account"] });
    await a.backend.connect("googleDrive");
    const status = await a.backend.status();
    expect(status.account).toBeUndefined();
    expect(status.error).toBeUndefined();
    expect(status.lastSavedAt).toBe(time);
    // No retry is scheduled for it.
    await a.after(WRITE_DELAY_MS);
    expect(a.timers.next()).toBeUndefined();

    cloud.failNext("retry", { ops: ["account"] });
    a.alarms.fire(CLOUD_CHECK_ALARM);
    await a.after();
    expect((await a.backend.status()).account).toBeUndefined();
    expect((await a.backend.status()).error).toBeUndefined();

    // A device connected before addresses were kept has none either: asked the same way.
    await save(a, "loaf");
    await a.after(WRITE_DELAY_MS);
    a.alarms.fire(CLOUD_CHECK_ALARM);
    await a.after();
    expect((await a.backend.status()).account).toBe("alex.kim@gmail.com");
    await b.backend.connect("googleDrive");
    expect(await keysOf(b)).toEqual(["loaf:learning"]);
  });

  it("stays unknown when the provider gives no address", async () => {
    const cloud = createFakeCloud();
    const a = device({ id: "dev-a", cloud });
    a.account.address = undefined;
    await startAll(a);
    await a.backend.connect("googleDrive");
    expect((await a.backend.status()).account).toBeUndefined();
    expect((await a.state())?.lastSavedAt).toBe(time);
  });
});

describe("cloudConnected", () => {
  it("is true only while a connection is kept", async () => {
    const local = createFakeSyncArea();
    expect(await cloudConnected(local)).toBe(false);
    await local.set({ [CLOUD_SYNC_KEY]: { provider: "googleDrive" } });
    expect(await cloudConnected(local)).toBe(true);
  });
});
