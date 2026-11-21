/**
 * A language's part-of-speech tagger, as its language pack has it (`LanguagePack.tagger`),
 * and what the language-independent rules read from it: a tag per token with its
 * confidence, and how each word of a sentence is used (an auxiliary, a participle used
 * as an adjective). Languages without a tagger leave those rules off.
 */
import type { PerceptronModel } from "./perceptron";

/** One token's tag. */
export interface TokenTag {
  /** The tagger's own tag (Penn Treebank for English: VBD, NNS, …; Spanish: VERB.Fin, NOUN, …). */
  tag: string;
  /**
   * The part of speech as the dictionaries label senses: noun, verb, adjective, adverb,
   * preposition, conjunction, determiner, pronoun, numeral, interjection, particle;
   * "other" for punctuation and the rest.
   */
  label: string;
  /** An inflected form of `label`: a past, a participle, a third person, a comparative. */
  inflected: boolean;
  /** The tag says the written form carries an ending: `inflected`, or a plural. */
  morph: boolean;
  /** A proper-noun tag. */
  proper: boolean;
  /**
   * The class of tags the language's grammar tells apart beyond `label`, when it does:
   * a universal tag's part of speech (UD: AUX and VERB, both verbs, are not read
   * alike; their verb forms are).
   */
  kind?: string;
  /** How sure the tagger is; compare with `Tagger.threshold`. Infinity for a word with one tag. */
  confidence: number;
  /**
   * The tagger's next best tags, best first, each with how far it is behind this one
   * (`confidence` is the first one's), for `readTag`. None for a word with one tag or
   * a tag never trusted.
   */
  rivals?: readonly RivalTag[];
}

/** One of a token's next best tags (`TokenTag.rivals`). */
export interface RivalTag extends Omit<TokenTag, "confidence" | "rivals"> {
  /** How far its score is behind the token's tag, in the tagger's margin units. */
  behind: number;
}

/** A word of a tagged sentence, as the language's grammar reads it. */
export interface TaggedWord {
  /** The word as keys compare it (lower case). */
  form: string;
  /** Its base forms (`LanguagePack.lemmas`). */
  bases: readonly string[];
  tag: TokenTag;
  /** The tag is trusted (`readTag`). */
  trusted: boolean;
  /** Punctuation comes between the word before and this one. */
  pauseBefore: boolean;
  /**
   * Punctuation comes after this word, before the next one or at the text's end (a
   * line of speech recognition cut off mid-clause ends without: "keine Zeit zu").
   */
  pauseAfter?: boolean;
  /** Written with a capital or not; unknown in a document in capitals. */
  capital?: boolean;
  /**
   * A sentence's first word that the tagger read as a proper noun for its capital
   * ("Tengo que irme", "Para hacer"): its tag in the sentence with it written in lower
   * case, which says what it is as a word (`namedVerbConstruction`).
   */
  lowerTag?: TokenTag;
}

/** How a word is used in its sentence. */
export interface WordUse {
  /**
   * An auxiliary here: "has" in "has spent", "is" in "is going", "did" in "did you go",
   * "had" in "had to", "got" in "got hurt". Its dictionary entry's grammar pointer
   * fits ("haveの三人称単数現在"); its tag says nothing of its meaning.
   */
  auxiliary: boolean;
  /**
   * How a word tagged as an inflected verb is used: after an auxiliary ("aux": a
   * perfect, a progressive), as a finite verb, otherwise as a verb ("other"), or not as
   * a verb (false: before a noun, "demanding work"; a state, "was established").
   */
  verbal: "aux" | "finite" | "other" | false;
  /**
   * A participle not after an auxiliary, where a preposition may stand: a clause's
   * start, after a pause or a noun ("Including taxes, …", "costs including taxes").
   */
  prepositionSlot: boolean;
  /** The part of speech the use gives instead of the tag's: a gerund after a determiner is a noun. */
  label?: string;
  /**
   * The part of speech the grammar gives the word whatever its tag says, trusted or
   * not (French "personne" in "je ne connais personne": the pronoun "nobody"); rule
   * A2 reads it as it reads a trusted tag's.
   */
  grammarPos?: string;
  /**
   * An auxiliary that keeps its verb's meaning here (English be: "was built", "is
   * going"), which the native languages say with their own verb; its hover is that
   * verb's (`sensePos`), not an auxiliary's grammar pointer.
   */
  lexical?: true;
  /**
   * What a contraction's clitic stands for here, when the sentence decides (English
   * "he's been": "has", "it's a": "is", "I'd seen": "had", "I'd go": "would"): the
   * hover names that expansion alone (`Span.clitic`).
   */
  clitic?: string;
  /**
   * The base the sentence's grammar decides, for a form two verbs share whose tag says
   * nothing of which (Spanish "fue": ser or ir; "se fue" is ir); rule A1 takes it.
   */
  base?: string;
  /**
   * `base` is a separable verb whose particle stands later in the clause (German "er
   * fängt morgen an": anfangen): rule A1 takes it even where the pack's main part of
   * speech for it is another (its noun "Aussehen" is commoner than "aussehen").
   */
  separable?: true;
  /**
   * The separable verb whose particle this word is, its finite verb earlier in the
   * clause (German "sieht … aus": aussehen): the word reads as that verb, as its
   * finite verb does (`separable`).
   */
  particleOf?: string;
  /**
   * A verb the grammar reads as pronominal here, from a reflexive pronoun before it
   * that decided its base ("se fueron de campamento": irse): a plain verb's pattern
   * does not start at it (`ir de`, to act like), a pronominal verb's may.
   */
  pronominal?: true;
  /**
   * A verb followed by an infinitive: the word that introduces it ("tengo que irme":
   * "que"; "acabo de llegar": "de"; "essayer de comprendre": "de"), "" for none ("suele
   * venir"). Rule A2 shows the senses its source says with that word first
   * (`constructionPos`).
   */
  construction?: string;
  /**
   * The case of the pronominal verb's reflexive pronoun, where its form shows it
   * (German "mir", "dir": dative; "mich", "dich": accusative; not "sich", "uns",
   * "euch"): rule A2 shows the senses the source gives that case first ("ich stelle
   * mir … vor": to imagine; "ich stelle mich vor": to introduce oneself).
   */
  reflexiveCase?: "dative" | "accusative";
  /**
   * A third-person subject pronoun's number, where its finite verb's form shows it
   * (German "sie sind": plural, they; "sie ist": singular, she): rule A2 shows the
   * pronoun's senses of that number first (`Sense.number`).
   */
  number?: "singular" | "plural";
}

/**
 * What a word is, as the phrase rules read a dictionary phrase's context
 * (`phrases/fit.ts`): the language's closed classes, from the word's trusted tag and
 * its form.
 */
export interface WordRole {
  /** A determiner that opens a noun phrase ("the", "my", "what"; not "that"). */
  determiner: boolean;
  /** Opens a noun phrase: a determiner, a noun (a proper noun even when not trusted), a number. */
  nounPhrase: boolean;
  /** Can open an object or a complement: a noun phrase, "that", an object pronoun, a wh-word. */
  object: boolean;
  /** A modal or a do-support auxiliary ("can", "do" in "do you know", "don't"). */
  modal: boolean;
  /** A personal pronoun or possessive other than "it" ("you", "him", "your"). */
  personal: boolean;
  /** The infinitive marker ("to" before a verb). */
  infinitive: boolean;
  /** A preposition. */
  preposition: boolean;
  /** Can be a subject: a pronoun or a noun. */
  subject: boolean;
  /** The partitive "of" ("all of that"). */
  partitive: boolean;
  /** A form of "be", also in a contraction ("it's", "we're"). */
  be: boolean;
  /** A past participle ("held"). */
  pastParticiple: boolean;
}

export interface Tagger {
  /**
   * Tags the tokens of one sentence (its words and punctuation as written, without
   * spaces), one tag per token. A token the language writes as two words for its
   * tagger ("don't") takes its first word's tag.
   */
  tag(tokens: readonly string[]): TokenTag[];
  /** Tags at or above this confidence are trusted. */
  readonly threshold: number;
  /** How each word of a tagged sentence is used (the language's grammar). */
  uses(words: readonly TaggedWord[]): WordUse[];
  /** What a tagged word is among the language's closed classes. */
  role(word: TaggedWord): WordRole;
}

/** The model a language pack ships for its tagger. */
export type TaggerModel = PerceptronModel;

/**
 * Two tags say the same of a word: its part of speech (and `kind`), its ending, and
 * whether it is a name.
 */
const readsAlike = (
  a: Omit<TokenTag, "confidence" | "rivals">,
  b: Omit<TokenTag, "confidence" | "rivals">,
) =>
  a.label === b.label &&
  a.kind === b.kind &&
  a.inflected === b.inflected &&
  a.morph === b.morph &&
  a.proper === b.proper;

/**
 * The tag a word is read by, when it counts as evidence (undefined otherwise). A form
 * that is not a headword of its own (an inflected form) can only carry a tag that says
 * it has an ending ("calmer" is no noun). A tag it cannot carry still says the word's
 * part of speech, as a tag of that part of speech the form can carry and the tagger
 * lists says it ("cases" NN: a noun, as its NNS), or else nothing ("looming" NN: no
 * noun tag with an ending listed). The word is read by the best tag the form can carry,
 * and that counts when the tagger is confident of what it says of the word, by
 * `threshold`: how far it is ahead of the best reading that differs (`readsAlike`).
 * Tags that say the same do not count against each other: "netted" a past or a
 * participle, a verb either way (but UD's AUX and VERB, which the grammar tells apart,
 * do: `kind`). So "looming" (VBG 3.6 ahead of NN, 11.8 of JJ) is a verb, and "cases"
 * (VBZ 1.7 ahead of NN) nothing. A tag the form cannot carry and the tagger is sure of,
 * ahead of every tag it can by `threshold`, says the word is what the dictionary has no
 * entry for: "research funding" (NN 5.9 ahead of VBG), a gerund noun, is not read as a
 * verb. Never a proper-noun tag (a name is no word to look up; "Deposit my specimen"
 * at a sentence start). Its `confidence` is that lead, its `rivals` left out.
 */
export function readTag(
  tag: TokenTag,
  threshold: number,
  form: string,
  bases: readonly string[],
): TokenTag | undefined {
  const headword = bases.length === 0 || bases.includes(form);
  const { rivals = [], confidence, ...first } = tag;
  type Reading = Omit<TokenTag, "confidence" | "rivals">;
  const tags = [
    { reading: first as Reading, behind: 0 },
    ...rivals.map(({ behind, ...reading }) => ({ reading, behind })),
  ];
  const carried = ({ reading }: { reading: Reading }) =>
    headword || reading.morph;
  // Each tag as a reading the form can carry, by its own score.
  const readings = tags.flatMap((one) => {
    const as = carried(one)
      ? one
      : tags.find(
          (other) =>
            carried(other) && other.reading.label === one.reading.label,
        );
    return as ? [{ reading: as.reading, behind: one.behind }] : [];
  });
  const best = readings[0];
  if (!best || best.reading.proper || best.behind >= threshold)
    return undefined;
  const other = readings.find((one) => !readsAlike(one.reading, best.reading));
  // With no other reading among those listed, the last listed bounds the lead: every
  // tag not listed is further behind.
  const lead =
    rivals.length === 0
      ? confidence
      : (other ?? rivals.at(-1)!).behind - best.behind;
  if (lead < threshold) return undefined;
  return { ...best.reading, confidence: lead };
}
