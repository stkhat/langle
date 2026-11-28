import { primary } from "../languages";
import { own } from "../util";

/**
 * Words a sentence seldom ends on, by language (LEARNING): the closed classes that need a
 * word after them — articles and other determiners that are only determiners, possessive
 * determiners, "to", coordinating and subordinating conjunctions, and prepositions that are
 * seldom adverbs or particles. A word of those classes that also stands alone at a clause's
 * end is left out: "this", "all", "no" and "what" (pronouns), "in", "on", "out" and
 * "about" ("come in", "go on", "talk about"), "her" (an object), "so", "that", "like".
 * The cards of an auto-generated track avoid ending right after one
 * (`AsrOptions.functionWord`). Static, so the cards need no language pack.
 */
const FUNCTION_WORDS: Readonly<Record<string, ReadonlySet<string>>> = {
  en: new Set(
    [
      // Determiners and possessive determiners
      "the a an every my your our their its his",
      // The infinitive marker
      "to",
      // Conjunctions
      "and or but nor because if although unless whether than as until since whereas",
      // Prepositions
      "of for with at from into onto by between without within during against among toward towards upon despite except per via",
    ]
      .join(" ")
      .split(" "),
  ),
};

/** The learning language's function words (`FUNCTION_WORDS`); undefined for a language without the list. */
export function functionWords(
  lang: string,
): ((word: string) => boolean) | undefined {
  const words = own(FUNCTION_WORDS, primary(lang));
  return words && ((word) => words.has(word));
}
