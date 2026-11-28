import {
  alignAsrSentences,
  asrSentenceCards,
  cueWords,
} from "../../core/subtitles/asr";
import {
  alignByOverlap,
  joinCoveredCards,
  joinerFor,
  shiftCues,
  timingError,
  trackOffset,
} from "../../core/subtitles/translation";
import { functionWords } from "../../core/tagging/function-words";
import type { VideoCaptions } from "./platform";
import type { VideoState } from "./state";

/**
 * The transcript's cards, the lines the video shows and each card's translation, from
 * the subtitles the adapter read; for a manual track with the site's translation, also
 * each line's translation (`lineTranslations`).
 */
export function captionCards(captions: VideoCaptions): {
  state: Pick<
    VideoState,
    "cues" | "lines" | "spans" | "translationSource" | "translations"
  >;
  /**
   * The translation under each subtitle line (in `state.lines` order), when the lines
   * are not shown with their card's whole translation; else null.
   */
  lineTranslations: string[] | null;
} {
  const asr = captions.track.kind === "asr";
  const joiner = joinerFor(captions.track.lang);
  const { translation: given } = captions;
  // A human track timed off the original's clock is moved onto it, for the cards and the
  // subtitle line alike.
  const translation =
    given.source === "siteTrack"
      ? {
          ...given,
          cues: shiftCues(given.cues, trackOffset(captions.cues, given.cues)),
        }
      : given;
  const site =
    translation.source === "siteTrack" ||
    translation.source === "siteAutoTranslate";
  // Cards are the original's sentences however the site cut its cues: a manual track's cues
  // get word times spread over their text and go through the same sentence rules, each cue
  // staying one subtitle line.
  const cues = asr
    ? captions.cues
    : captions.cues.map((cue) => ({ ...cue, words: cueWords(cue) }));
  // Auto-generated tracks avoid cards that end on a function word; a manual track's cues
  // already end where its sentences do.
  const options = {
    joiner,
    lang: captions.track.lang,
    linesByCue: !asr,
    functionWord: asr ? functionWords(captions.track.lang) : undefined,
  };
  // YouTube translates a track sentence by sentence: follow its sentences.
  const aligned =
    translation.source === "siteAutoTranslate"
      ? alignAsrSentences(cues, translation.cues, {
          ...options,
          translationJoiner: joinerFor(translation.lang),
        })
      : undefined;
  const sentences = aligned ?? asrSentenceCards(cues, options);
  // A human translation line that covers most of two sentences translates them together.
  const { cards, lines } =
    translation.source === "siteTrack"
      ? joinCoveredCards(sentences, translation.cues, joiner)
      : sentences;
  const timing = {
    lang: translation.lang,
    ...(translation.source === "siteTrack" && {
      timingErrorMs: timingError(captions.cues, translation.cues),
    }),
  };
  return {
    state: {
      cues: cards,
      lines,
      spans: cards.map(() => null),
      translationSource: translation.source,
      translations:
        aligned?.translations ??
        (site
          ? alignByOverlap(cards, translation.cues, timing)
          : cards.map(() => "")),
    },
    // Merged sentences no longer match a line's time: each line gets the translated
    // lines it overlaps by the cards' rule, so a translation timed a little apart from
    // the original changes with the line, never while it shows (2026-11-28: read by
    // time, it came and went mid-line and moved the line up and down).
    lineTranslations:
      site && !asr
        ? alignByOverlap(
            lines.map((line) => ({
              startMs: line.startMs,
              endMs: line.endMs,
              text: cards[line.card]?.text.slice(line.start, line.end) ?? "",
            })),
            translation.cues,
            timing,
          )
        : null,
  };
}
