// The extension-host page of spike S1: raw IndexedDB (no Dexie) and a 1 s timer.
const DB = "spike";
const SIZE = 20 * 1024 * 1024;

function open() {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("rows", { keyPath: "id" });
      r.result.createObjectStore("blobs");
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
    r.onblocked = () => no(new Error("blocked"));
  });
}
const done = (tx) =>
  new Promise((ok, no) => {
    tx.oncomplete = ok;
    tx.onerror = () => no(tx.error);
    tx.onabort = () => no(tx.error);
  });
const req = (r) =>
  new Promise((ok, no) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });

// 20 MB of xorshift bytes, so compression or deduplication cannot shrink it.
function pattern() {
  const b = new Uint8Array(SIZE);
  let x = 2463534242;
  for (let i = 0; i < SIZE; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    b[i] = x & 255;
  }
  return b.buffer;
}
function sum(buf) {
  const b = new Uint8Array(buf);
  let s = 0;
  for (let i = 0; i < b.length; i++) s = (s + b[i] * ((i % 251) + 1)) >>> 0;
  return s;
}

window.spike = {
  async env() {
    const st = navigator.storage;
    return {
      origin: location.origin,
      href: location.href,
      idb: typeof indexedDB,
      secure: isSecureContext,
      subtle: typeof crypto.subtle,
      estimate: st?.estimate ? await st.estimate().catch(String) : null,
      persisted: st?.persisted ? await st.persisted().catch(String) : null,
    };
  },
  async wipe() {
    await req(indexedDB.deleteDatabase(DB));
    return { wiped: DB };
  },
  async write() {
    const t0 = performance.now();
    const db = await open();
    const stamp = Date.now();
    let tx = db.transaction("rows", "readwrite");
    const rows = tx.objectStore("rows");
    for (let i = 0; i < 1000; i++)
      rows.put({ id: i, text: `row ${i} ${"x".repeat(100)}`, stamp });
    await done(tx);
    const t1 = performance.now();
    const buf = pattern();
    const check = sum(buf);
    const t2 = performance.now();
    tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").put({ buf, check, stamp }, "big");
    await done(tx);
    const t3 = performance.now();
    db.close();
    return {
      rowsMs: Math.round(t1 - t0),
      blobMs: Math.round(t3 - t2),
      bytes: buf.byteLength,
      check,
      stamp,
    };
  },
  async read() {
    const t0 = performance.now();
    const db = await open();
    const tx = db.transaction(["rows", "blobs"]);
    const count = await req(tx.objectStore("rows").count());
    const last = await req(tx.objectStore("rows").get(999));
    const big = await req(tx.objectStore("blobs").get("big"));
    const t1 = performance.now();
    db.close();
    return {
      count,
      lastOk: last?.text?.startsWith("row 999 ") ?? false,
      stamp: last?.stamp ?? null,
      bytes: big?.buf?.byteLength ?? 0,
      checkOk: big ? sum(big.buf) === big.check : null,
      blobStamp: big?.stamp ?? null,
      readMs: Math.round(t1 - t0),
    };
  },
  startTimer() {
    const t0 = performance.now();
    let n = 0;
    setInterval(() => {
      n++;
      window.webkit.messageHandlers.spike.postMessage({
        n,
        perf: performance.now() - t0,
      });
    }, 1000);
    return { started: true };
  },
};
