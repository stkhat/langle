import {
  ankiFile,
  csvFile,
  exportFileName,
  type ExportWord,
} from "../../core/export/word-export";
import { languageName } from "../../i18n/languages";
import { t } from "../../i18n/t";
import type { TermSummary } from "../../messaging/protocol";
import type { WordListDeps } from "./WordList";
import { rowMeaning } from "./Rows";
import type { useWordListData } from "./useWordListData";

export type WordFormat = "anki" | "csv";

const MEDIA_TYPE: Record<WordFormat, string> = {
  anki: "text/plain;charset=utf-8",
  csv: "text/csv;charset=utf-8",
};

/**
 * Downloads the rows shown as an Anki import file or a CSV (ui.md "Word list page" →
 * "Export"): their meanings as the Meaning column has them, those still in another
 * language translated first, with the pronunciation and the sentence each was saved
 * from. Resolves to how many words the file holds.
 */
export async function exportWords(o: {
  format: WordFormat;
  rows: readonly TermSummary[];
  langs: { learning: string; native: string };
  deps: WordListDeps;
  data: Pick<ReturnType<typeof useWordListData>, "meanings" | "findTerm">;
}): Promise<number> {
  const { format, langs, deps, data } = o;
  await data.meanings.translateAll(
    o.rows.map((term) => ({ key: term.id, head: term.display })),
  );
  const rows = o.rows.map((term) => data.findTerm(term.id) ?? term);
  const details = await deps.send({
    type: "exportDetails",
    lang: langs.learning,
    ids: rows.map((term) => term.id),
  });
  const words = rows.flatMap((term): ExportWord[] => {
    const more = details[term.id];
    if (!more) return [];
    const { occurrence } = more;
    return [
      {
        id: term.id,
        head: term.display,
        kind: term.kind,
        status: term.status,
        meaning: rowMeaning(term, langs.native).text,
        ...(more.ipa !== undefined && { ipa: more.ipa }),
        ...(occurrence && {
          sentence: occurrence.sentence,
          source: { title: occurrence.title, link: occurrence.link },
        }),
        seen: term.seen,
        lastSeen: term.lastSeen,
        createdAt: term.createdAt,
        ...(term.learnedAt !== undefined && { learnedAt: term.learnedAt }),
      },
    ];
  });
  const text =
    format === "anki"
      ? ankiFile(
          words,
          t("export.deck", { language: languageName(langs.learning) }),
        )
      : csvFile(words, {
          columns: [
            t("export.col.word"),
            t("export.col.kind"),
            t("export.col.status"),
            t("export.col.meaning"),
            t("export.col.ipa"),
            t("export.col.sentence"),
            t("export.col.source"),
            t("export.col.url"),
            t("export.col.seen"),
            t("export.col.lastSeen"),
            t("export.col.saved"),
            t("export.col.learned"),
          ],
          kind: { word: t("kind.word"), phrase: t("kind.phrase") },
          status: {
            learning: t("status.learning"),
            known: t("status.known"),
          },
        });
  await deps.saveFile(
    exportFileName(format, langs.learning, langs.native, new Date(deps.now())),
    text,
    MEDIA_TYPE[format],
  );
  return words.length;
}
