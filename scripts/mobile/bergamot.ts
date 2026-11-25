// The Bergamot translator's engine for the Android app's on-device translator
// (docs/notes/mobile.md "Android on-device translators"): Firefox's WebAssembly build of
// bergamot-translator v0.6.0 and the JS glue Firefox loads it with, both MPL 2.0. They are
// code, so they are pinned here by URL, size and SHA-256 and never committed: this script
// fetches them into mobile/android/app/engine/bergamot/ (git-ignored), which the Android
// build copies into its assets as bergamot/ and refuses to build without
// (mobile/android/app/build.gradle.kts). Files already there with the pinned SHA-256 are
// kept, so the script is quick to run again.
// Usage: npm run mobile:bergamot
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface EngineFile {
  /** The file's name in the engine folder (and under bergamot/ in the app's assets). */
  readonly name: string;
  readonly url: string;
  readonly size: number;
  readonly sha256: string;
}

/** The engine folder the Android build reads (its assets' bergamot/). */
export const ENGINE_DIR = resolve(
  import.meta.dirname,
  "../../mobile/android/app/engine/bergamot",
);

// Firefox 145's glue (tag FIREFOX_145_0_RELEASE), BERGAMOT_VERSION_FULL "v0.6.0+4a6a44c0".
const FIREFOX_145 =
  "https://raw.githubusercontent.com/mozilla-firefox/firefox/030a5e55591d07fddb4434a73842dcc76cde2533/toolkit/components/translations/bergamot-translator";

export const ENGINE_FILES: readonly EngineFile[] = [
  {
    // Remote Settings, collection translations-wasm, record
    // 4fd32605-9889-4dd9-9fc7-577ad1136746: bergamot-translator v0.6.0, MPL-2.0, built
    // from mozilla/translations at 1de4a085d3a7afb625c51a60aabb5ad298e4059f.
    name: "bergamot-translator.wasm",
    url: "https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-wasm/05082c31-aee8-4249-9e01-c1865afd7520.wasm",
    size: 4_960_506,
    sha256: "a3a89d9ad0a4ed8f27bf3e403701b23f5709816f6376438503f2fa5b0182c2dc",
  },
  {
    name: "bergamot-translator.js",
    url: `${FIREFOX_145}/bergamot-translator.js`,
    size: 100_020,
    sha256: "fb2dfc1d7a416aa8850af223f3e494b4a90efa16e121941dd75671294f87871f",
  },
  {
    // The MPL 2.0 text that sits next to them in Firefox, carried with them in the APK.
    name: "LICENSE",
    url: `${FIREFOX_145}/LICENSE`,
    size: 16_725,
    sha256: "1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5",
  },
];

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** Why `bytes` are not the pinned file; undefined when they are. */
export function problemOf(file: EngineFile, bytes: Uint8Array) {
  if (bytes.length !== file.size)
    return `${file.name}: ${bytes.length} bytes, pinned ${file.size}`;
  const hash = sha256(bytes);
  if (hash !== file.sha256)
    return `${file.name}: SHA-256 ${hash}, pinned ${file.sha256}`;
  return undefined;
}

/** The pinned files that `dir` lacks or holds with other bytes. */
export function missingFiles(dir: string, files = ENGINE_FILES) {
  return files.filter((file) => {
    const path = join(dir, file.name);
    return (
      !existsSync(path) || problemOf(file, readFileSync(path)) !== undefined
    );
  });
}

/**
 * Writes each pinned file that `dir` lacks, fetched with `fetchBytes` and checked
 * before it is written (through a temporary name, so a failed run leaves no file
 * half-written). Returns the names written.
 */
export async function ensureEngine(
  dir: string,
  fetchBytes: (file: EngineFile) => Promise<Uint8Array>,
  files = ENGINE_FILES,
) {
  const written: string[] = [];
  for (const file of missingFiles(dir, files)) {
    const bytes = await fetchBytes(file);
    const problem = problemOf(file, bytes);
    if (problem) throw new Error(`${problem} (from ${file.url})`);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, file.name);
    writeFileSync(`${path}.part`, bytes);
    renameSync(`${path}.part`, path);
    written.push(file.name);
  }
  return written;
}

/** Downloads a file into a new empty folder of its own, and reads it back. */
async function download(file: EngineFile) {
  const response = await fetch(file.url);
  if (!response.ok)
    throw new Error(`${file.url}: ${response.status} ${response.statusText}`);
  const dir = mkdtempSync(join(tmpdir(), "langle-bergamot-"));
  try {
    const path = join(dir, file.name);
    writeFileSync(path, new Uint8Array(await response.arrayBuffer()));
    return readFileSync(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const written = await ensureEngine(ENGINE_DIR, (file) => {
    console.log(`Fetching ${file.name} (${file.size} bytes)`);
    return download(file);
  });
  console.log(
    written.length > 0
      ? `Wrote ${written.join(", ")} to ${ENGINE_DIR}`
      : `The engine files in ${ENGINE_DIR} are the pinned ones`,
  );
}

if (import.meta.main) await main();
