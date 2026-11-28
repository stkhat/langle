import { describe, expect, it } from "vitest";
import { meaningKey } from "../meanings";
import { DEFAULT_SETTINGS } from "../settings";
import { gzip } from "../sync/codec";
import {
  assertCloudRow,
  checkFiles,
  CLOUD_VERSION,
  decodeFile,
  skippedText,
  encodeFile,
  filePath,
  monthOf,
  parseFilePath,
  type HistoryFile,
  type MainFile,
  type OccurrencesFile,
} from "./format";

const header = {
  format: "langle-cloud",
  v: CLOUD_VERSION,
  deviceId: "dev-1",
  writtenAt: Date.UTC(2026, 10, 21),
} as const;

const NOV = Date.UTC(2026, 10, 3);

async function main(): Promise<MainFile> {
  return {
    ...header,
    kind: "main",
    terms: [
      {
        id: "en:bank",
        lang: "en",
        key: "bank",
        display: "Bank",
        kind: "word",
        status: "known",
        learnedAt: 5,
        createdAt: 1,
        updatedAt: 5,
        clearedAt: 3,
      },
      {
        id: "en:look up",
        lang: "en",
        key: "look up",
        display: "look up",
        kind: "phrase",
        status: "removed",
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    sources: [
      {
        id: "s1",
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=x",
        title: "Talk",
        lang: "en",
        firstSeen: 1,
        lastSeen: 4,
      },
    ],
    meanings: [
      {
        key: await meaningKey("en:bank", "ai", "土手"),
        termId: "en:bank",
        from: "ai",
        text: "土手",
        createdAt: 4,
      },
    ],
    meaningChoices: [
      {
        termId: "en:bank",
        sourceId: "s1",
        sentence: "By the bank.",
        meaningKey: await meaningKey("en:bank", "ai", "土手"),
        at: 4,
        deviceId: "dev-1",
      },
      {
        termId: "en:bank",
        sourceId: "s1",
        sentence: "At the bank.",
        meaningKey: null,
        at: 5,
        deviceId: "dev-1",
      },
    ],
    settings: { values: DEFAULT_SETTINGS, times: { knownLevel: 3 } },
    historyClearedAt: 0,
    historyForgotten: { "example.com": 2 },
  };
}

const source = {
  id: "s1",
  platform: "youtube",
  url: "https://www.youtube.com/watch?v=x",
  title: "Talk",
  lang: "en",
  firstSeen: 1,
  lastSeen: NOV,
} as const;

const occurrences: OccurrencesFile = {
  ...header,
  kind: "occurrences",
  month: "2026-11",
  sources: [source],
  occurrences: [
    {
      termId: "en:bank",
      sourceId: "s1",
      sentence: "By the bank.",
      translation: "土手のそばで。",
      pos: { timeMs: 1200 },
      seenAt: NOV,
      origin: "saved",
      deviceId: "dev-1",
      addedAt: NOV,
    },
  ],
};

const history: HistoryFile = {
  ...header,
  kind: "history",
  month: "2026-11",
  pages: [
    {
      id: "p1",
      platform: "web",
      url: "https://example.com/a",
      host: "example.com",
      title: "A",
      lang: "en",
      firstSeen: NOV,
      lastSeen: NOV,
    },
  ],
  sentences: [
    {
      pageId: "p1",
      text: "A sentence.",
      pos: { textQuote: "A sentence." },
      keys: ["en:sentence"],
      seenAt: NOV,
      deviceId: "dev-1",
      addedAt: NOV,
    },
  ],
};

const bytesOf = (data: unknown) => gzip(JSON.stringify(data));

/** The file decoded, expected readable: the file and the lists and indexes left out. */
async function readable(data: unknown) {
  const decoded = await decodeFile(await bytesOf(data));
  if (decoded.status !== "ok")
    throw new Error(`Not readable: ${JSON.stringify(decoded)}`);
  return {
    file: decoded.file,
    skipped: decoded.skipped.map((s) => `${s.list}[${s.index}]`),
  };
}

describe("encodeFile and decodeFile", () => {
  it("round-trip each kind of file", async () => {
    for (const file of [await main(), occurrences, history])
      expect(await decodeFile(await encodeFile(file))).toEqual({
        status: "ok",
        file,
        skipped: [],
      });
  });

  it("write gzipped JSON with the format, version, kind and device", async () => {
    const bytes = await encodeFile(occurrences);
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
    const text = await new Response(
      new Blob([new Uint8Array(bytes)])
        .stream()
        .pipeThrough(new DecompressionStream("gzip")),
    ).text();
    expect(JSON.parse(text)).toMatchObject({
      format: "langle-cloud",
      v: 1,
      kind: "occurrences",
      deviceId: "dev-1",
      month: "2026-11",
    });
  });

  it("tell a newer version apart, whatever its content", async () => {
    expect(
      await decodeFile(
        await bytesOf({ format: "langle-cloud", v: 2, kind: "main", x: 1 }),
      ),
    ).toEqual({ status: "newer", v: 2 });
  });

  it("call a file of another format other", async () => {
    expect(
      await decodeFile(await bytesOf({ format: "langle-export" })),
    ).toEqual({ status: "other" });
    expect(await decodeFile(await bytesOf([1, 2]))).toEqual({
      status: "other",
    });
  });

  it("call bytes that are not gzipped JSON broken", async () => {
    for (const bytes of [new Uint8Array([1, 2, 3]), await gzip("{not json")])
      expect(await decodeFile(bytes)).toEqual({
        status: "broken",
        reason: "not gzipped JSON",
      });
  });

  it("call a file of this version with a damaged header broken, naming the field", async () => {
    const file = await main();
    const cases: [unknown, string][] = [
      [{ ...file, v: 0 }, "v 0"],
      [{ ...file, v: 1.5 }, "v 1.5"],
      [{ ...file, kind: "notes" }, "kind"],
      [{ ...file, deviceId: "a/b" }, "deviceId"],
      [{ ...file, writtenAt: -1 }, "writtenAt"],
      [{ ...file, terms: "en:bank" }, "a list of main"],
      [
        { ...file, settings: { values: {}, times: { knownLevel: "x" } } },
        "settings",
      ],
      [{ ...file, settings: { times: {} } }, "settings"],
      [{ ...file, historyClearedAt: -1 }, "historyClearedAt"],
      [{ ...file, historyForgotten: { "a.com": "x" } }, "historyForgotten"],
      [{ ...occurrences, month: "2026-13" }, "month"],
      [{ ...occurrences, occurrences: {} }, "a list of occurrences"],
      [{ ...history, pages: null }, "a list of history"],
    ];
    for (const [data, reason] of cases)
      expect(
        await decodeFile(await bytesOf(data)),
        JSON.stringify(data).slice(0, 80),
      ).toEqual({ status: "broken", reason });
  });

  it("leave out a damaged row of main and take the rest", async () => {
    const file = await main();
    const [bank, lookUp] = file.terms;
    const cases: [MainFile, string[]][] = [
      [
        { ...file, terms: [{ ...bank!, id: "en:other" }, lookUp!] },
        ["terms[0]"],
      ],
      [
        {
          ...file,
          terms: [bank!, { ...lookUp!, status: "deleted" as "known" }],
        },
        ["terms[1]"],
      ],
      [
        { ...file, sources: [{ ...source, platform: "article" as "web" }] },
        ["sources[0]"],
      ],
      [
        {
          ...file,
          meaningChoices: [
            file.meaningChoices[0]!,
            { ...file.meaningChoices[1]!, at: -1 },
          ],
        },
        ["meaningChoices[1]"],
      ],
    ];
    for (const [data, skipped] of cases) {
      const read = await readable(data);
      expect(read.skipped, JSON.stringify(skipped)).toEqual(skipped);
      const gone = new Set(skipped);
      const kept = (list: keyof MainFile) =>
        (file[list] as unknown[]).filter((_, i) => !gone.has(`${list}[${i}]`));
      expect(read.file).toEqual({
        ...file,
        terms: kept("terms"),
        sources: kept("sources"),
        meaningChoices: kept("meaningChoices"),
      });
    }
  });

  it("leave out a meaning whose key does not match, and the choices that name it", async () => {
    const file = await main();
    const read = await readable({
      ...file,
      meanings: [{ ...file.meanings[0], text: "something else" }],
    });
    expect(read.skipped).toEqual(["meanings[0]", "meaningChoices[0]"]);
    // The undo (`meaningKey` null) names no meaning: it stays.
    expect(read.file).toEqual({
      ...file,
      meanings: [],
      meaningChoices: [file.meaningChoices[1]],
    });
  });

  it("leave out a damaged row of a month file, and the rows that refer to a header left out", async () => {
    const row = occurrences.occurrences[0]!;
    const other = { ...row, sentence: "Other." };
    const sentence = history.sentences[0]!;
    const cases: [unknown, string[], unknown[]][] = [
      [
        { ...occurrences, occurrences: [{ ...row, pos: { line: 3 } }, other] },
        ["occurrences[0]"],
        [other],
      ],
      [
        {
          ...occurrences,
          sources: [{ ...source, platform: "article" }],
          occurrences: [row],
        },
        ["sources[0]", "occurrences[0]"],
        [],
      ],
      [
        { ...history, sentences: [{ ...sentence, keys: [1] }] },
        ["sentences[0]"],
        [],
      ],
      [
        { ...history, pages: [{ ...history.pages[0], host: "Example.com" }] },
        ["pages[0]", "sentences[0]"],
        [],
      ],
    ];
    for (const [data, skipped, rows] of cases) {
      const read = await readable(data);
      expect(read.skipped).toEqual(skipped);
      const file = read.file as OccurrencesFile | HistoryFile;
      expect(
        file.kind === "occurrences" ? file.occurrences : file.sentences,
      ).toEqual(rows);
    }
  });

  it("leave out a month file's rows of another device or another month", async () => {
    const row = occurrences.occurrences[0]!;
    const read = await readable({
      ...occurrences,
      occurrences: [
        { ...row, deviceId: "dev-2" },
        { ...row, addedAt: Date.UTC(2026, 9, 31) },
        row,
      ],
    });
    expect(read.skipped).toEqual(["occurrences[0]", "occurrences[1]"]);
    expect(read.file).toEqual(occurrences);
  });

  it("drop fields this version does not know", async () => {
    const decoded = await decodeFile(
      await bytesOf({
        ...occurrences,
        extra: true,
        occurrences: [{ ...occurrences.occurrences[0], id: 7, mood: "x" }],
      }),
    );
    expect(decoded).toEqual({ status: "ok", file: occurrences, skipped: [] });
  });
});

describe("checkFiles", () => {
  it("keep files every row of which passes as they are", async () => {
    const files = [await main(), occurrences, history];
    const checked = await checkFiles(files);
    checked.forEach(({ file, skipped }, i) => {
      expect(file).toBe(files[i]);
      expect(skipped).toEqual([]);
    });
  });

  it("leave out the rows a reader would leave out, keeping the others as they are", async () => {
    const file = await main();
    const good = file.sources[0]!;
    const bad = { ...good, id: "s2", platform: "article" as "web" };
    const [checked] = await checkFiles([{ ...file, sources: [bad, good] }]);
    expect(checked!.file).toEqual(file);
    expect(checked!.file.kind === "main" && checked!.file.sources[0]).toBe(
      good,
    );
    expect(checked!.skipped.map((s) => s.list)).toEqual(["sources"]);
  });

  it("leave out a month's rows of a term the main left out", async () => {
    const file = await main();
    const [bank] = file.terms;
    const [checkedMain, checkedMonth] = await checkFiles([
      { ...file, terms: [{ ...bank!, kind: "sentence" as "word" }] },
      occurrences,
    ]);
    expect(checkedMain!.skipped.map((s) => s.list)).toEqual(["terms"]);
    expect(checkedMonth!.file).toEqual({ ...occurrences, occurrences: [] });
    expect(checkedMonth!.skipped.map((s) => `${s.list}[${s.index}]`)).toEqual([
      "occurrences[0]",
    ]);
  });

  it("refuse a file with a damaged header", async () => {
    await expect(
      checkFiles([{ ...occurrences, writtenAt: Number.NaN }]),
    ).rejects.toThrow(/writtenAt/);
  });
});

describe("assertCloudRow", () => {
  it("pass a row a cloud file holds and refuse one a reader would leave out", () => {
    expect(() => assertCloudRow("source", source)).not.toThrow();
    expect(() =>
      assertCloudRow("source", { ...source, platform: "article" }),
    ).toThrow(/Not a valid source/);
    expect(() =>
      assertCloudRow("occurrence", { ...occurrences.occurrences[0], pos: {} }),
    ).toThrow(TypeError);
  });
});

describe("skippedText", () => {
  it("count the rows and show the first three", () => {
    const rows = [0, 1, 2, 3].map((index) => ({
      list: "terms",
      index,
      row: `{"i":${index}}`,
    }));
    expect(skippedText(rows.slice(0, 1))).toBe(
      'one row that fails its check left out: terms[0] {"i":0}',
    );
    expect(skippedText(rows)).toBe(
      '4 rows that fail their check left out: terms[0] {"i":0}; terms[1] {"i":1}; terms[2] {"i":2}; and 1 more',
    );
  });
});

describe("monthOf", () => {
  it("is the UTC month of a time", () => {
    expect(monthOf(Date.UTC(2026, 0, 31, 23, 59, 59, 999))).toBe("2026-01");
    expect(monthOf(Date.UTC(2026, 1, 1))).toBe("2026-02");
    expect(monthOf(Date.UTC(2026, 11, 31, 12))).toBe("2026-12");
  });
});

describe("filePath and parseFilePath", () => {
  it("put each device's files in its own folder", () => {
    expect(filePath("dev-1", "main")).toBe("devices/dev-1/main.json.gz");
    expect(filePath("dev-1", "occurrences", "2026-11")).toBe(
      "devices/dev-1/occurrences-2026-11.json.gz",
    );
    expect(filePath("dev-1", "history", "2026-02")).toBe(
      "devices/dev-1/history-2026-02.json.gz",
    );
  });

  it("read back what filePath makes, and nothing else", () => {
    expect(parseFilePath("devices/dev-1/main.json.gz")).toEqual({
      deviceId: "dev-1",
      kind: "main",
    });
    expect(parseFilePath("devices/dev-1/history-2026-02.json.gz")).toEqual({
      deviceId: "dev-1",
      kind: "history",
      month: "2026-02",
    });
    for (const path of [
      "devices/dev-1/notes.json.gz",
      "devices/dev-1/history-2026-13.json.gz",
      "devices/dev-1/main.json",
      "other/dev-1/main.json.gz",
    ])
      expect(parseFilePath(path)).toBeUndefined();
  });

  it("refuse a month file without a month, or a device id that is not a folder name", () => {
    expect(() => filePath("dev-1", "occurrences")).toThrow(RangeError);
    expect(() => filePath("../x", "main")).toThrow(RangeError);
  });
});
