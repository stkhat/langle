import { describe, expect, it } from "vitest";
import {
  ankiFile,
  csvCell,
  csvFile,
  exportFileName,
  sentenceHtml,
  type CsvLabels,
  type ExportWord,
} from "./word-export";

const day = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

const figureOut: ExportWord = {
  id: "en:figure out",
  head: "figure out",
  kind: "phrase",
  status: "learning",
  meaning: "（答え・方法を）見つけ出す、理解する",
  ipa: "/ˈfɪɡjər ˈaʊt/",
  sentence: "So today we're going to figure out how to make bread.",
  source: {
    title: "Baking bread from scratch",
    link: "https://www.youtube.com/watch?v=abc&t=56s",
  },
  seen: 3,
  lastSeen: day("2026-11-24"),
  createdAt: day("2026-11-02"),
};

const tedious: ExportWord = {
  id: "en:tedious",
  head: "tedious",
  kind: "word",
  status: "known",
  meaning: "退屈な、面倒な",
  seen: 0,
  lastSeen: day("2026-11-06"),
  createdAt: day("2026-11-06"),
  learnedAt: day("2026-11-12"),
};

const LABELS: CsvLabels = {
  columns: [
    "Word",
    "Kind",
    "Status",
    "Meaning",
    "IPA",
    "Sentence",
    "Source",
    "URL",
    "Seen",
    "Last seen",
    "Saved",
    "Learned",
  ],
  kind: { word: "Word", phrase: "Phrase" },
  status: { learning: "Learning", known: "Known" },
};

describe("exportFileName", () => {
  it("names the pair and the local date", () => {
    const date = new Date(2026, 10, 4);
    expect(exportFileName("anki", "en", "ja", date)).toBe(
      "langle-anki-en-ja-2026-11-04.txt",
    );
    expect(exportFileName("csv", "es", "en", date)).toBe(
      "langle-words-es-en-2026-11-04.csv",
    );
  });
});

describe("sentenceHtml", () => {
  it("bolds the term where it is written, any case", () => {
    expect(sentenceHtml("Honestly, I never thought so.", "honestly")).toBe(
      "<b>Honestly</b>, I never thought so.",
    );
  });

  it("bolds a phrase across any spaces", () => {
    expect(sentenceHtml("to figure  out how", "figure out")).toBe(
      "to <b>figure  out</b> how",
    );
  });

  it("does not bold inside another word, and escapes HTML", () => {
    expect(sentenceHtml("<cats> scatter", "cat")).toBe("&lt;cats&gt; scatter");
  });

  it("matches letters beyond ASCII as word characters", () => {
    expect(sentenceHtml("Él está aquí, no allá.", "está")).toBe(
      "Él <b>está</b> aquí, no allá.",
    );
    expect(sentenceHtml("hablaré", "habla")).toBe("hablaré");
  });
});

describe("ankiFile", () => {
  const text = ankiFile([figureOut, tedious], "Langle English");
  const lines = text.split("\n");

  it("starts with the headers Anki reads", () => {
    expect(lines.slice(0, 6)).toEqual([
      "#separator:tab",
      "#html:true",
      "#notetype:Basic",
      "#deck:Langle English",
      "#guid column:1",
      "#tags column:4",
    ]);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("writes one note per word: guid, front, back, tags", () => {
    expect(lines[6]!.split("\t")).toEqual([
      "en:figure out",
      "figure out",
      "（答え・方法を）見つけ出す、理解する<br>/ˈfɪɡjər ˈaʊt/<br>" +
        "<i>So today we're going to <b>figure out</b> how to make bread.</i>" +
        '<br><a href="https://www.youtube.com/watch?v=abc&amp;t=56s">Baking bread from scratch</a>',
      "langle learning phrase",
    ]);
    expect(lines[7]!.split("\t")).toEqual([
      "en:tedious",
      "tedious",
      "退屈な、面倒な",
      "langle known",
    ]);
  });

  it("keeps tabs and line breaks out of fields and quotes out of field starts", () => {
    const odd: ExportWord = {
      ...tedious,
      head: '"odd"',
      meaning: "a\tb\nc",
      sentence: "line one\nline two",
    };
    const note = ankiFile([odd], "D").split("\n")[6]!;
    const fields = note.split("\t");
    expect(fields).toHaveLength(4);
    expect(fields[1]).toBe("&quot;odd&quot;");
    expect(fields[2]).toBe("a b c<br><i>line one line two</i>");
  });

  it("links only http(s) sources", () => {
    const local: ExportWord = {
      ...tedious,
      source: { title: "A <page>", link: "javascript:alert(1)" },
    };
    expect(ankiFile([local], "D").split("\n")[6]!.split("\t")[2]).toBe(
      "退屈な、面倒な<br>A &lt;page&gt;",
    );
  });
});

describe("csvCell", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
  });

  it("keeps formulas from running, but not a leading hyphen", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+81")).toBe("'+81");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("-ish")).toBe("-ish");
  });
});

describe("csvFile", () => {
  const text = csvFile([figureOut, tedious], LABELS);

  it("has a byte order mark, CRLF line ends and the column names", () => {
    expect(
      text.startsWith(
        "﻿Word,Kind,Status,Meaning,IPA,Sentence,Source,URL,Seen,Last seen,Saved,Learned\r\n",
      ),
    ).toBe(true);
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.split("\r\n")).toHaveLength(4);
  });

  it("writes one row per word with local dates", () => {
    const rows = text.slice(1).split("\r\n");
    expect(rows[1]).toBe(
      "figure out,Phrase,Learning,（答え・方法を）見つけ出す、理解する,/ˈfɪɡjər ˈaʊt/," +
        "So today we're going to figure out how to make bread.,Baking bread from scratch," +
        "https://www.youtube.com/watch?v=abc&t=56s,3,2026-11-24,2026-11-02,",
    );
    expect(rows[2]).toBe(
      "tedious,Word,Known,退屈な、面倒な,,,,,0,2026-11-06,2026-11-06,2026-11-12",
    );
  });
});
