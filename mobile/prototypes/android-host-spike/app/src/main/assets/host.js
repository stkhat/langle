// Extension-host stand-in on the app origin (WebViewAssetLoader). `?op=` picks the measurement;
// results go to native through the `langleBridge` listener (page world: the app owns this page).
const params = new URLSearchParams(location.search);
const op = params.get("op") ?? "ping";
const label = params.get("label") ?? op;
const send = (kind, data) =>
  window.langleBridge.postMessage(JSON.stringify({ kind, label, ...data }));

const ROWS = 1000;
const BLOB_BYTES = 20 * 1024 * 1024;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("langle-spike", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("rows", { keyPath: "id" });
      req.result.createObjectStore("blobs");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

const result = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

// Deterministic 20 MB buffer (xorshift32) and a checksum over its 32-bit words.
function makeBlob() {
  const words = new Uint32Array(BLOB_BYTES / 4);
  let x = 2463534242;
  for (let i = 0; i < words.length; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    words[i] = x;
  }
  return words.buffer;
}

function checksum(buffer) {
  const words = new Uint32Array(buffer);
  let h = 2166136261;
  for (let i = 0; i < words.length; i++)
    h = Math.imul(h ^ words[i], 16777619) >>> 0;
  return h.toString(16);
}

async function write() {
  const t0 = performance.now();
  const db = await openDb();
  const tx = db.transaction(["rows", "blobs"], "readwrite");
  tx.objectStore("rows").clear();
  for (let i = 0; i < ROWS; i++) {
    tx.objectStore("rows").put({ id: i, term: `term-${i}`, n: i * 7 });
  }
  const blob = makeBlob();
  tx.objectStore("blobs").put(blob, "big");
  await done(tx);
  document.cookie = `langle=${label}; max-age=86400; secure`;
  localStorage.setItem("langle", label);
  send("write", {
    ms: Math.round(performance.now() - t0),
    rows: ROWS,
    bytes: blob.byteLength,
    sum: checksum(blob),
  });
}

async function read() {
  const t0 = performance.now();
  const names = (await indexedDB.databases?.())?.map((d) => d.name) ?? [];
  if (!names.includes("langle-spike")) {
    send("read", {
      db: false,
      names,
      cookie: document.cookie,
      local: localStorage.getItem("langle"),
    });
    return;
  }
  const db = await openDb();
  const tx = db.transaction(["rows", "blobs"], "readonly");
  const rows = await result(tx.objectStore("rows").getAll());
  const blob = await result(tx.objectStore("blobs").get("big"));
  const rowsOk =
    rows.length === ROWS &&
    rows.every((r, i) => r.id === i && r.term === `term-${i}` && r.n === i * 7);
  const estimate = await navigator.storage?.estimate?.();
  send("read", {
    db: true,
    rows: rows.length,
    rowsOk,
    bytes: blob?.byteLength ?? 0,
    sum: blob ? checksum(blob) : null,
    ms: Math.round(performance.now() - t0),
    usageMB: estimate ? Math.round(estimate.usage / 1e5) / 10 : null,
    persisted: await navigator.storage?.persisted?.(),
    cookie: document.cookie,
    local: localStorage.getItem("langle"),
  });
}

// 1 s interval; native asks for the report after the run (a throttled timer may never get there).
function timer() {
  const start = performance.now();
  const gaps = [];
  let last = start;
  const vis0 = document.visibilityState;
  setInterval(() => {
    const now = performance.now();
    gaps.push(now - last);
    last = now;
  }, 1000);
  window.__report = () => {
    const mean = gaps.length
      ? gaps.reduce((a, b) => a + b, 0) / gaps.length
      : 0;
    send("timer", {
      elapsedS: Math.round((performance.now() - start) / 100) / 10,
      ticks: gaps.length,
      meanMs: Math.round(mean),
      maxMs: Math.round(Math.max(0, ...gaps)),
      over1500: gaps.filter((g) => g > 1500).length,
      vis0,
      vis1: document.visibilityState,
    });
  };
  send("timer-start", { vis0 });
}

const ops = {
  write,
  read,
  timer,
  ping: () => send("ready", { origin: location.origin }),
};
Promise.resolve()
  .then(() => ops[op]())
  .catch((e) => send("error", { op, message: String(e) }));
