// packs.lock.json is written by `npm run data:publish`. Every pack is downloaded from
// the lock's mirrors; none is bundled. Test builds can replace the mirrors with the
// WXT_PACK_MIRRORS variable (`import.meta.env`, from the environment or .env.<mode>),
// never in production mode:
//   WXT_PACK_MIRRORS=http://localhost:4719/mirror/{package}@{version}/{file},…
import { appHostOf } from "../app-host";
import { own } from "../util";
import lockFile from "./packs.lock.json";
import type { PackName } from "./load";
import { packsFor, type ModelPackName } from "./pairs";

/** One file of a pack version: its path in the pack (and in the npm package), size and SHA-256 (hex). */
export interface PackLockFile {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface PackLockEntry {
  /** The npm package the files are published in. */
  readonly package: string;
  readonly version: string;
  /** The data format of the files; a stored version in another format is not used. */
  readonly format: number;
  readonly files: readonly PackLockFile[];
  /**
   * `model`: a translation model pack of the phone app (Android, `mt-<from>-<to>`),
   * which native code downloads (`appHost.models`); never fetched by the extension.
   */
  readonly kind?: "model";
}

export interface PackLock {
  readonly v: 1;
  /** URL templates with {package}, {version} and {file}, tried in order. */
  readonly mirrors: readonly string[];
  /** By name; model packs (`kind: "model"`, `ModelPackName`) are read with `own`. */
  readonly packs: Readonly<Record<PackName, PackLockEntry>>;
  /**
   * The language pairs offered (those passing the quality gate): learning language →
   * native languages, the default first.
   */
  readonly pairs: Readonly<Record<string, readonly string[]>>;
}

/**
 * The lock's model packs where the app downloads them (`appHost.translator.models`
 * is `packs`, Android); undefined elsewhere (the extension, iOS), which needs none.
 */
export function modelPacksOf(
  lock: PackLock,
  g: object = globalThis,
): ((pack: ModelPackName) => boolean) | undefined {
  if (appHostOf(g)?.translator?.models !== "packs") return undefined;
  return (pack) => own<PackLockEntry>(lock.packs, pack)?.kind === "model";
}

/** The packs the background brings for a pair: `packsFor` with the lock's model packs here. */
export const pairPacks = (
  learning: string,
  native: string,
  lock: PackLock = readLock(),
  g: object = globalThis,
) => packsFor(learning, native, modelPacksOf(lock, g));

/** Bytes of a pack version's files. */
export const packBytes = (entry: Pick<PackLockEntry, "files">) =>
  entry.files.reduce((sum, file) => sum + file.size, 0);

/** The environment variable that overrides the lock in builds other than production. */
export interface LockEnv {
  readonly WXT_PACK_MIRRORS?: string;
}

/**
 * The lock with the environment's override applied, in any mode but "production":
 * WXT_PACK_MIRRORS (comma-separated) replaces the mirrors.
 */
export function applyOverrides(
  lock: PackLock,
  env: LockEnv,
  mode: string,
): PackLock {
  if (mode === "production") return lock;
  const mirrors = (env.WXT_PACK_MIRRORS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return mirrors.length > 0 ? { ...lock, mirrors } : lock;
}

declare global {
  interface ImportMetaEnv {
    readonly WXT_PACK_MIRRORS?: string;
  }
}

let current: PackLock | undefined;

/** The lock this build uses (with the override of a test build). */
export function readLock(): PackLock {
  current ??= applyOverrides(
    lockFile as PackLock,
    { WXT_PACK_MIRRORS: import.meta.env.WXT_PACK_MIRRORS },
    import.meta.env.MODE,
  );
  return current;
}
