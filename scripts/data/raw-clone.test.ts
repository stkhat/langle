import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cloneRaw } from "./raw-clone.ts";

describe("cloneRaw", () => {
  let dir: string;
  let from: string;
  let to: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "raw-clone-"));
    from = join(dir, "main");
    to = join(dir, "worktree");
    mkdirSync(join(from, "omw", "deep"), { recursive: true });
    mkdirSync(join(from, "quality", "study"), { recursive: true });
    writeFileSync(join(from, "kaikki.jsonl"), "main");
    writeFileSync(join(from, "omw", "deep", "omw.xml"), "main");
    writeFileSync(join(from, "quality", "study", "units.jsonl"), "main");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("copies the raw files, but not the study data", () => {
    expect(cloneRaw(from, to)).toBe(2);
    expect(readdirSync(to).sort()).toEqual(["kaikki.jsonl", "omw"]);
    expect(readFileSync(join(to, "omw/deep/omw.xml"), "utf8")).toBe("main");
  });

  it("keeps a write to a copy out of the original", () => {
    cloneRaw(from, to);
    writeFileSync(join(to, "kaikki.jsonl"), "worktree");
    expect(readFileSync(join(from, "kaikki.jsonl"), "utf8")).toBe("main");
  });

  it("adds only what is missing, and overwrites nothing", () => {
    mkdirSync(join(to, "quality"), { recursive: true });
    writeFileSync(join(to, "kaikki.jsonl"), "worktree");
    expect(cloneRaw(from, to)).toBe(1);
    expect(readFileSync(join(to, "kaikki.jsonl"), "utf8")).toBe("worktree");
    expect(cloneRaw(from, to)).toBe(0);
  });

  it("refuses to write through a link", () => {
    symlinkSync(from, to);
    expect(() => cloneRaw(from, to)).toThrow("is a link");
  });
});
