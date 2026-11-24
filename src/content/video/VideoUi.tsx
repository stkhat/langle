import type { ComponentChildren, CSSProperties } from "preact";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from "preact/hooks";
import { FEEDBACK_URL } from "../../core/links";
import type { Settings } from "../../core/settings";
import { DictionaryWindow } from "../../ui/lookup/DictionaryWindow";
import { keptOpen } from "../../ui/keep-open";
import { usePressAway } from "../../ui/press-away";
import type { SelectedOffsets } from "../../ui/selection-in-root";
import {
  pressedOnText,
  type Anchor,
  type SelectedText,
} from "../../ui/video/text-selection";
import { formatTime } from "../../ui/format/format";
import { elsewhereItems } from "../../ui/lookup/elsewhere";
import { HoverCard } from "../../ui/lookup/HoverCard";
import { LangleMenu } from "../../ui/video/LangleMenu";
import { PlayerButtons } from "../../ui/video/PlayerButtons";
import {
  SubtitleOverlay,
  type SubtitleOverlayProps,
} from "../../ui/video/SubtitleOverlay";
import { VideoPanel } from "../../ui/video/VideoPanel";
import { PhoneTranscript } from "../../ui/video/PhoneTranscript";
import type { TranscriptProps } from "../../ui/video/Transcript";
import { ThemeScope } from "../../ui/ThemeScope";
import { LangleMark } from "../../ui/LangleMark";
import { PauseIcon } from "../../ui/icons";
import { t } from "../../i18n/t";
import { explainSection, shownAnswer } from "../explain/panel";
import { hoverView, windowView } from "../lookup/describe";
import { boxOf, type Box } from "../lookup/geometry";
import {
  dictionaryFrame,
  menuBelowPlacement,
  menuPlacement,
  verticalDictionaryFrame,
} from "./placement";
import type { VideoApp, VideoState, WordPlace } from "./state";
import { filterCounts, toWordRows } from "../words/words";
import { flatCue, videoWords, type VideoWord } from "./words";
import { Floating, keepSelection, TOP_LAYER } from "../lookup/Floating";
import { shallowEqual, useStore, useStoreSelect, type Store } from "../store";

/** Where the parts of the page are, read when needed. */
export interface VideoGeometry {
  player(): Box | null;
  /** The L and ^ buttons. */
  buttons(): Box | null;
  /** Langle's transcript, while it shows. */
  transcript(): Box | null;
  /** What the dictionary window goes to the right of beside a vertical video. */
  beside(): Box | null;
  /** The subtitle box under the video, while it shows. */
  subtitle(): Box | null;
}

/** Sizes the UI follows. */
export interface VideoLayout {
  /** The height of the element the transcript follows (the player, or the site's frame). */
  frameHeight: number;
  /**
   * How far above the player's bottom the in-video subtitle sits (px): 64, or higher
   * while the site's control bar shows (Netflix).
   */
  subtitleBottom: number;
  /** A vertical short video (spec "YouTube Shorts"): subtitle only, in the video. */
  vertical: boolean;
  /**
   * The transcript is in the sidebar beside a player that fills the window or the
   * screen (Netflix; YouTube in fullscreen), the player narrowed for it.
   */
  sidebar: boolean;
  /** The side the sidebar is at: the right, or on a phone the one the user picked. */
  sidebarSide: "left" | "right";
  /**
   * The player fills the window or the screen (Netflix; YouTube in fullscreen): from
   * the adapter's `fillsWindow`, the one signal the phone's fullscreen UI follows (so
   * an app's own fullscreen, without the Fullscreen API, can give it too).
   */
  fillsWindow: boolean;
  /**
   * The page is in touch mode (spec mobile-app.md "Touch in place of hover"): the
   * phone's own subtitle settings apply.
   */
  touch: boolean;
  /**
   * Where the subtitle box under the video is pinned, fixed under a player that stays at
   * the window's top (m.youtube.com's portrait page), in px in the window; null while it
   * scrolls with the page.
   */
  pinned: { top: number; left: number; width: number } | null;
  /** The pinned subtitle box's bottom, in px from the window's top; null when not pinned. */
  pinnedBottom: number | null;
}

/** The pinned subtitle box over the page that scrolls under it. */
const PINNED_LAYER = 10;

/** Where the subtitle goes: the phone's own setting in touch mode, the desktop's otherwise. */
const subtitlePosition = (
  settings: Settings,
  touch: boolean,
): Settings["subtitlePosition"] =>
  touch ? settings.phoneSubtitlePosition : settings.subtitlePosition;

/** Mock Main: the in-video subtitle sits 64px above the player's bottom. */
export const SUBTITLE_BOTTOM = 64;
/** Mock Fullscreen: the subtitle sits 120px above the screen's bottom. */
const FULLSCREEN_SUBTITLE_BOTTOM = 120;
/** Mock Fullscreen: 200px in from each side of the 1440px screen, less on small ones. */
const FULLSCREEN_SUBTITLE_INSET = "clamp(24px, 14%, 200px)";
/** Mock Main: 120px in from each side of the 880px video, less on small players. */
const SUBTITLE_INSET = "clamp(12px, calc((100% - 640px) / 2), 120px)";
/** Mock `YouTube Shorts — subtitles`: 132px above the video's bottom, over its title. */
const VERTICAL_SUBTITLE_BOTTOM = 132;
/** Mock `YouTube Shorts — subtitles`: 12px in from each side of the narrow video. */
const VERTICAL_SUBTITLE_INSET = "12px";
/** The gap kept between the in-video subtitle and the site's control bar (px). */
export const CONTROL_BAR_GAP = 12;

/** The Words tab's words while it does not show. */
const NO_WORDS: readonly VideoWord[] = [];

/** The transcript is never shorter than this (px). */
const MIN_TRANSCRIPT_HEIGHT = 320;
/** A phone's sheet starts no lower than this share of the window's height. */
const SHEET_TOP_MAX = 0.6;
/** On a phone the cards under the subtitle are never shorter than this (px). */
const MIN_PHONE_TRANSCRIPT_HEIGHT = 200;
/** Mock MobileYouTube: the transcript's heading row. */
const PHONE_TRANSCRIPT_HEADER = 48;
/** Langle shows its subtitles and transcript for this video. */
const showing = (state: VideoState) =>
  state.enabled && state.status === "ready";

/** Langle's subtitle is over the video (not in the box below it). */
export const subtitleOverVideo = (
  state: VideoState,
  vertical: boolean,
  touch = false,
) =>
  showing(state) &&
  (state.fullscreen ||
    vertical ||
    subtitlePosition(state.settings, touch) === "inVideo");

/**
 * The playing line: its part of the card's text, and the card's spans in it (cut to the
 * line), with their indices in the card's spans.
 */
function playingLine(state: VideoState) {
  const line = state.lines[state.line];
  const cue = line ? state.cues[line.card] : undefined;
  if (!line || !cue) return undefined;
  const spans = state.spans[line.card] ?? null;
  const shown = (spans ?? []).flatMap((span, index) =>
    span.end > line.start && span.start < line.end
      ? [
          {
            index,
            span: {
              ...span,
              start: Math.max(span.start, line.start) - line.start,
              end: Math.min(span.end, line.end) - line.start,
            },
          },
        ]
      : [],
  );
  return {
    card: line.card,
    /** Where the line starts in the card's text. */
    start: line.start,
    text: cue.text.slice(line.start, line.end),
    spans: spans && shown.map((each) => each.span),
    index: shown.map((each) => each.index),
  };
}

function Subtitle(props: {
  app: VideoApp;
  state: VideoState;
  variant: SubtitleOverlayProps["variant"];
  /** Touch mode: no hover (a tap would hover first), words selected by a long-press. */
  touch: boolean;
}) {
  const { app, state, touch } = props;
  const line = playingLine(state);
  const { panel, settings } = state;
  const ref = (span: number) => ({
    cue: line?.card ?? -1,
    span: line?.index[span] ?? -1,
  });
  // A subtitle that goes (between lines, Langle off) is no longer under the pointer.
  useEffect(() => app.leaveSubtitle, [app]);
  const selected =
    line && panel?.ref.cue === line.card
      ? line.index.indexOf(panel.ref.span)
      : -1;
  return (
    <SubtitleOverlay
      variant={props.variant}
      // Below the video the box stays between lines, so the page does not jump.
      text={line?.text ?? " "}
      spans={line ? line.spans : []}
      highlight={settings.highlight}
      translation={line ? state.subtitleTranslation : ""}
      showTranslation={settings.subtitleTranslation}
      size={settings.subtitleSize}
      opacity={settings.subtitleOpacity}
      learningLang={settings.learningLang}
      nativeLang={settings.nativeLang}
      selected={selected >= 0 ? selected : null}
      onWordEnter={(span, element) => {
        if (!touch) app.enterWord(ref(span), boxOf(element), "subtitle");
      }}
      onWordLeave={app.leaveWord}
      onWordClick={(span) => app.clickWord(ref(span))}
      onHover={(on) => {
        if (touch) return;
        if (on) app.enterSubtitle();
        else app.leaveSubtitle();
      }}
      touch={touch}
      onSelectStart={() => app.selectStart("subtitle")}
      onSnap={(from, to, anchor) =>
        line &&
        snapIn(app, line.card, line.start, "subtitle", { from, to, anchor })
      }
      onSelect={(selected) =>
        selectIn(
          app,
          line?.card ?? -1,
          line?.start ?? 0,
          "subtitle",
          line && selected,
        )
      }
    />
  );
}

/**
 * Words selected in a text that shows a cue from `offset` on (the playing line, or a
 * whole card): offsets in the cue's text, and back for the words they snap to.
 */
function selectIn(
  app: VideoApp,
  cue: number,
  offset: number,
  place: WordPlace,
  selected: SelectedText | undefined,
): SelectedOffsets | undefined {
  const words = app.selectWords(
    selected && {
      cue,
      start: selected.from + offset,
      end: selected.to + offset,
      place,
      anchor: selected.anchor,
    },
    (start, end) => selected?.boxOf(start - offset, end - offset),
  );
  return words && { from: words.start - offset, to: words.end - offset };
}

/** The words a drag selects in a text that shows a cue from `offset` on (see `selectIn`). */
function snapIn(
  app: VideoApp,
  cue: number,
  offset: number,
  place: WordPlace,
  dragged: SelectedOffsets & { anchor: Anchor },
): SelectedOffsets | undefined {
  const words = app.snapWords({
    cue,
    start: dragged.from + offset,
    end: dragged.to + offset,
    place,
    anchor: dragged.anchor,
  });
  return words && { from: words.start - offset, to: words.end - offset };
}

/** One video part's content under the theme setting. */
export function VideoThemed(props: {
  app: VideoApp;
  children: ComponentChildren;
}) {
  const theme = useStoreSelect(props.app.store, (s) => s.settings.theme);
  return <ThemeScope theme={theme}>{props.children}</ThemeScope>;
}

/**
 * Inside the player: the subtitle over the video. In fullscreen the subtitle is always
 * over the video, larger (mock Fullscreen).
 */
export function InPlayerUi(props: {
  app: VideoApp;
  layout: Store<VideoLayout>;
}) {
  const { app } = props;
  const state = useStore(app.store);
  const { subtitleBottom, vertical, touch, fillsWindow } = useStore(
    props.layout,
  );
  const { fullscreen } = state;
  // A phone's fullscreen subtitle is over the page instead (`PhoneFullscreenUi`).
  const inVideo =
    subtitleOverVideo(state, vertical, touch) &&
    state.line >= 0 &&
    !(touch && fillsWindow);
  const inset = fullscreen
    ? FULLSCREEN_SUBTITLE_INSET
    : vertical
      ? VERTICAL_SUBTITLE_INSET
      : SUBTITLE_INSET;
  const bottom = fullscreen
    ? Math.max(FULLSCREEN_SUBTITLE_BOTTOM, subtitleBottom)
    : vertical
      ? VERTICAL_SUBTITLE_BOTTOM
      : subtitleBottom;
  return (
    <>
      {touch && !fillsWindow && state.heldPaused && (
        <PausedPill
          style={{ position: "absolute", left: "12px", top: "12px" }}
        />
      )}
      {inVideo && (
        <div
          style={{
            position: "absolute",
            left: inset,
            right: inset,
            // Netflix's control bar can lift it higher.
            bottom: `${bottom}px`,
            transition: "bottom 0.2s ease-out",
          }}
        >
          <Subtitle
            app={app}
            state={state}
            variant={
              fullscreen ? "fullscreen" : vertical ? "vertical" : "inVideo"
            }
            touch={touch}
          />
        </div>
      )}
    </>
  );
}

/**
 * On a phone, while Langle holds the video paused (a word's sheet is open): "Paused" at
 * the video's top left (mock MobileYouTube, MobileYouTubeLandscape).
 */
function PausedPill(props: { style: CSSProperties }) {
  return (
    <span
      role="status"
      style={{
        ...props.style,
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        height: "28px",
        padding: "0 10px",
        boxSizing: "border-box",
        borderRadius: "14px",
        background: "rgba(0,0,0,0.6)",
        color: "#FFFFFF",
        fontSize: "12px",
        fontWeight: 600,
        lineHeight: 1,
        pointerEvents: "none",
      }}
    >
      <PauseIcon />
      {t("video.paused")}
    </span>
  );
}

/**
 * The Langle menu, above the L and ^ buttons. Over the page, in the top layer like the
 * dictionary window: inside the player, the site's own layers (Netflix's transcript
 * panel over the player) would cover it. Placed again while the page scrolls or resizes.
 */
export function MenuUi(props: {
  app: VideoApp;
  geometry: VideoGeometry;
  layout: Store<VideoLayout>;
}) {
  const { app, geometry } = props;
  const state = useStore(app.store);
  // The site's control bar showing or hiding (the buttons go with it) moves the subtitle.
  const { vertical, touch } = useStore(props.layout);
  const { settings, fullscreen } = state;
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!state.menuOpen) return;
    const options = { capture: true, passive: true };
    addEventListener("scroll", rerender, options);
    addEventListener("resize", rerender, options);
    return () => {
      removeEventListener("scroll", rerender, options);
      removeEventListener("resize", rerender, options);
    };
  }, [state.menuOpen]);
  const player = geometry.player();
  const buttons = geometry.buttons();
  if (!state.menuOpen || !player || !buttons) return null;
  const viewport = {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  };
  // Over a vertical video the buttons are at its top: the menu opens under them.
  const at = vertical
    ? menuBelowPlacement(player, buttons, viewport)
    : menuPlacement(player, buttons, viewport);
  return (
    <div
      style={{
        position: "fixed",
        zIndex: TOP_LAYER,
        right: `${at.right}px`,
        ...("top" in at
          ? { top: `${at.top}px` }
          : { bottom: `${at.bottom}px` }),
        pointerEvents: "auto",
      }}
    >
      <LangleMenu
        enabled={state.enabled}
        position={subtitlePosition(settings, touch)}
        showPositions={!fullscreen && !vertical}
        showTranslation={settings.subtitleTranslation}
        // No transcript over a Short.
        transcriptShown={vertical ? undefined : settings.transcriptShown}
        onToggleTranscript={() =>
          app.changeSettings({ transcriptShown: !settings.transcriptShown })
        }
        // No stepping through a Short's subtitles.
        pauseEachSentence={vertical ? undefined : settings.pauseEachSentence}
        onTogglePauseEach={() =>
          app.changeSettings({
            pauseEachSentence: !settings.pauseEachSentence,
          })
        }
        size={settings.subtitleSize}
        opacity={settings.subtitleOpacity}
        onPosition={(position) =>
          app.changeSettings(
            touch
              ? { phoneSubtitlePosition: position }
              : { subtitlePosition: position },
          )
        }
        onPreview={({ size, opacity }) =>
          app.previewSettings({
            ...(size !== undefined && { subtitleSize: size }),
            ...(opacity !== undefined && { subtitleOpacity: opacity }),
          })
        }
        onSize={(subtitleSize) => app.changeSettings({ subtitleSize })}
        onOpacity={(subtitleOpacity) => app.changeSettings({ subtitleOpacity })}
        onToggleTranslation={() =>
          app.changeSettings({
            subtitleTranslation: !settings.subtitleTranslation,
          })
        }
        onOpenSettings={() => {
          app.setMenuOpen(false);
          app.openSettings();
        }}
        onClose={() => app.setMenuOpen(false)}
      />
    </div>
  );
}

/**
 * Under the video: the large subtitle box (subtitle position "Below video"). Pinned, it
 * is fixed under the player and tells its height (`onPinnedHeight`, null when it goes),
 * so its host keeps its room in the page. Fixed, not sticky: a sticky box sticks only
 * inside its nearest scroll container, and on the iPhone m.youtube.com's `ytm-app`
 * (`overflow-x: hidden`, never scrolled) is that container, so a sticky box scrolled
 * away with the page.
 */
export function BelowVideoUi(props: {
  app: VideoApp;
  layout: Store<VideoLayout>;
  onPinnedHeight?: (height: number | null) => void;
}) {
  const { app, onPinnedHeight } = props;
  const state = useStore(app.store);
  const { touch, fillsWindow, pinned } = useStore(props.layout);
  const band = useRef<HTMLDivElement>(null);
  const shown =
    showing(state) &&
    !state.fullscreen &&
    !(touch && fillsWindow) &&
    subtitlePosition(state.settings, touch) === "belowVideo";
  const isPinned = shown && pinned !== null;
  useLayoutEffect(() => {
    const element = band.current;
    if (!isPinned || !element || !onPinnedHeight) return;
    const tell = () => onPinnedHeight(element.getBoundingClientRect().height);
    const observer = new ResizeObserver(tell);
    observer.observe(element);
    tell();
    return () => {
      observer.disconnect();
      onPinnedHeight(null);
    };
  }, [isPinned]);
  if (!shown) return null;
  return (
    // A phone (mock MobileYouTube): a band from edge to edge under the video.
    <div
      ref={band}
      style={{
        margin: touch ? 0 : "12px 0",
        ...(pinned && {
          position: "fixed",
          top: `${pinned.top}px`,
          left: `${pinned.left}px`,
          width: `${pinned.width}px`,
          zIndex: PINNED_LAYER,
        }),
      }}
    >
      <Subtitle
        app={app}
        state={state}
        variant={touch ? "phoneBelow" : "belowVideo"}
        touch={touch}
      />
    </div>
  );
}

/**
 * In the side column, or the sidebar beside a player that fills the window or the
 * screen: the Transcript and Words tabs, until the user closes them (in fullscreen only
 * in the sidebar).
 */
export function TranscriptUi(props: {
  app: VideoApp;
  layout: Store<VideoLayout>;
}) {
  const { app } = props;
  const state = useStore(app.store);
  const { frameHeight, sidebar, touch, pinnedBottom, fillsWindow } = useStore(
    props.layout,
  );
  const { cues, lines, spans, summaries, settings } = state;
  // A phone has its own fold, and its own setting for the column in fullscreen.
  const shown =
    showing(state) &&
    (touch
      ? !fillsWindow || sidebar
      : settings.transcriptShown && !(state.fullscreen && !sidebar));
  // Only the Words tab shows the words.
  const listed = shown && state.panelTab === "words";
  const words = useMemo(
    () => (listed ? videoWords(cues, lines, spans, summaries) : NO_WORDS),
    [listed, cues, lines, spans, summaries],
  );
  const jump = state.wordsJump;
  const rows = useMemo(
    () =>
      toWordRows(
        words,
        {
          filter: state.wordsFilter,
          sort: state.wordsSort,
          summaries,
          learningLang: settings.learningLang,
          nativeLang: settings.nativeLang,
          // A chip's line is in a card: the card's flat text is its sentence.
          sentence: (word, place) =>
            flatCue(
              cues[word.places[place]!.card]?.text ?? "",
              settings.learningLang,
            ),
        },
        (word, id) => ({
          places: word.places.map((place) => formatTime(place.startMs)),
          pressed:
            jump?.id === id
              ? word.places.findIndex(
                  (place) =>
                    place.card === jump.card && place.line === jump.line,
                )
              : -1,
          at: word.places,
          first: word.first,
        }),
      ),
    [
      words,
      state.wordsFilter,
      state.wordsSort,
      summaries,
      cues,
      settings.learningLang,
      settings.nativeLang,
      jump,
    ],
  );
  const counts = useMemo(() => filterCounts(words), [words]);
  if (!shown) return null;
  const fromTranscript = state.hover?.from === "transcript";
  const selectedInTranscript = state.phrase?.from === "transcript";
  const transcript: TranscriptProps = {
    cues,
    spans,
    translations: state.translations,
    showTranslation: settings.transcriptTranslation,
    highlight: settings.highlight,
    current: state.card,
    onSeek: app.seekToCue,
    onWordEnter: (cue, span, element) => {
      if (!touch) app.enterWord({ cue, span }, boxOf(element), "transcript");
    },
    onWordLeave: app.leaveWord,
    onWordClick: (cue, span) => app.clickWord({ cue, span }),
    touch,
    onSelectStart: () => app.selectStart("transcript"),
    onSnap: (cue, from, to, anchor) =>
      snapIn(app, cue, 0, "transcript", { from, to, anchor }),
    onSelect: (cue, selected) => selectIn(app, cue, 0, "transcript", selected),
    // The list holds still while a word's card shows or words are selected.
    holdScroll: fromTranscript || state.selecting,
    onListScroll: () => {
      // The card would stay where the word was.
      if (fromTranscript) app.dismissHover();
      if (selectedInTranscript) app.clearSelection();
    },
    learningLang: settings.learningLang,
    nativeLang: settings.nativeLang,
  };
  // A phone (mock MobileYouTube): the cards under the subtitle, down to the window's
  // bottom, or in the dark column beside the video in fullscreen.
  if (touch && sidebar)
    return (
      <ThemeScope theme="dark">
        <PhoneTranscript
          {...transcript}
          column
          height={Math.round(frameHeight)}
        />
      </ThemeScope>
    );
  if (touch)
    return (
      <PhoneTranscript
        {...transcript}
        column={false}
        height={Math.max(
          MIN_PHONE_TRANSCRIPT_HEIGHT,
          Math.round(innerHeight - (pinnedBottom ?? innerHeight / 2)) -
            PHONE_TRANSCRIPT_HEADER,
        )}
      />
    );
  return (
    <VideoPanel
      {...transcript}
      feedbackUrl={FEEDBACK_URL}
      tab={state.panelTab}
      onTab={app.setPanelTab}
      onToggleTranslation={() =>
        app.changeSettings({
          transcriptTranslation: !settings.transcriptTranslation,
        })
      }
      onToggleHighlight={app.toggleHighlight}
      words={rows}
      wordsFilter={state.wordsFilter}
      wordsCounts={counts}
      onWordsFilter={app.setWordsFilter}
      wordsSort={state.wordsSort}
      onWordsSort={app.setWordsSort}
      onJumpWord={(row, place) => app.jumpToWord(row.id, row.at[place]!)}
      onListWordEnter={(row, element) => {
        if (!touch) app.enterWord(row.first, boxOf(element), "words");
      }}
      onListWordLeave={app.leaveWord}
      onOpenWord={(row) => app.clickWord(row.first)}
      onWordsScroll={() => {
        // The card would stay where the head was.
        if (state.hover?.from === "words") app.dismissHover();
      }}
      onWordsShown={(shown) =>
        app.wordsShown(shown.map(({ key, head }) => ({ key, head })))
      }
      height={Math.max(MIN_TRANSCRIPT_HEIGHT, Math.round(frameHeight))}
      dataNote={state.dataNote}
      onRetryData={app.retryPacks}
      onClose={() => app.changeSettings({ transcriptShown: false })}
    />
  );
}

/** In the player bar: the L and ^ buttons, while the video has subtitles to show. */
export function PlayerBarUi({ app }: { app: VideoApp }) {
  const state = useStoreSelect(
    app.store,
    ({ status, enabled, menuOpen }) => ({ status, enabled, menuOpen }),
    shallowEqual,
  );
  if (state.status !== "ready" && state.status !== "loading") return null;
  return (
    <PlayerButtons
      enabled={state.enabled}
      menuOpen={state.menuOpen}
      onToggle={() => app.setEnabled(!state.enabled)}
      onMenu={() => app.setMenuOpen(!state.menuOpen)}
    />
  );
}

/**
 * While the dictionary window is open, a press anywhere else closes it: on the video,
 * the page or Langle's other controls. Presses on the window, the hover card and words
 * are marked by them (`keepOpen`): a word's click opens it in the same window. Escape
 * closes it wherever the focus is: after a click on a word it stays in the subtitle or
 * the transcript, whose shadow host keeps keys from the page (read here, capturing).
 */
const useClosedByPressAway = (app: VideoApp, open: boolean) =>
  usePressAway(open, () => app.closePanel(), keptOpen);

/**
 * While words are selected, Escape or a press anywhere else drops the selection and its
 * card. Presses on Langle's cards and windows (`keepOpen`) keep it, and a press on a
 * text words are selected in makes a new selection.
 */
const useSelectionDroppedByPressAway = (app: VideoApp, selecting: boolean) =>
  usePressAway(
    selecting,
    () => app.clearSelection(),
    (event) => keptOpen(event) || pressedOnText(event),
  );

/**
 * Mock MobileYouTubeLandscape: the column beside a video in fullscreen on a phone, 300px
 * wide, 16px from the top and bottom and 44px from its side (clear of the camera's
 * notch); the video gets the rest, less 356px.
 */
export const PHONE_COLUMN = { width: 300, inset: 16, side: 44, room: 356 };
/** Mock MobileYouTubeLandscape: the dictionary panel beside the video, left of the L. */
const PHONE_PANEL_FRAME = { top: 12, bottom: 12, right: 56, width: 300 };
/** Mock MobileYouTubeLandscape: the subtitle's insets and bottom, beside the column or not. */
const PHONE_SUBTITLE = {
  full: { inset: "clamp(12px, 14vw, 120px)", bottom: 28 },
  narrow: { inset: "12px", bottom: 14 },
};
/** Over the video and the site's own layers; under Langle's cards and windows. */
const OVER_VIDEO_LAYER = TOP_LAYER - 47;

/** The dictionary in the column, in the transcript's place. */
const columnFrame = (side: "left" | "right") => {
  const frame = {
    top: PHONE_COLUMN.inset,
    bottom: PHONE_COLUMN.inset,
    width: PHONE_COLUMN.width,
  };
  return side === "left"
    ? { ...frame, left: PHONE_COLUMN.side }
    : { ...frame, right: PHONE_COLUMN.side };
};

/**
 * A video in fullscreen on a phone (mock MobileYouTubeLandscape): over the page, above
 * the site's own layers over the video (m.youtube.com's covers the player's centre), the
 * subtitle near the bottom of the video's room and the L at its top right, which opens
 * the Langle sheet (the toolbar popup). The room is the window less the column's.
 */
function PhoneFullscreenUi(props: {
  app: VideoApp;
  state: VideoState;
  column: "left" | "right" | null;
}) {
  const { app, state, column } = props;
  const room = (side: "left" | "right") =>
    column === side ? PHONE_COLUMN.room : 0;
  const { inset, bottom } = column
    ? PHONE_SUBTITLE.narrow
    : PHONE_SUBTITLE.full;
  return (
    <>
      {state.heldPaused && (
        <PausedPill
          style={{
            position: "fixed",
            zIndex: OVER_VIDEO_LAYER,
            left: `${room("left") + (column ? 12 : 56)}px`,
            top: column ? "12px" : "16px",
          }}
        />
      )}
      {state.line >= 0 && (
        <div
          style={{
            position: "fixed",
            zIndex: OVER_VIDEO_LAYER,
            left: `calc(${room("left")}px + ${inset})`,
            right: `calc(${room("right")}px + ${inset})`,
            bottom: `${bottom}px`,
          }}
        >
          <Subtitle
            app={app}
            state={state}
            variant={column ? "phoneFullscreenNarrow" : "phoneFullscreen"}
            touch
          />
        </div>
      )}
      <button
        type="button"
        aria-label={t("video.openLangle")}
        onClick={app.openPopup}
        style={{
          position: "fixed",
          zIndex: OVER_VIDEO_LAYER,
          top: "12px",
          right: `${room("right") + 8}px`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "44px",
          height: "44px",
          padding: 0,
          border: "1px solid rgba(255,255,255,0.35)",
          borderRadius: "22px",
          background: "rgba(255,255,255,0.08)",
          cursor: "pointer",
        }}
      >
        <LangleMark size={26} />
      </button>
    </>
  );
}

/**
 * Over the page: the hover card, the selection's card and the dictionary window (in
 * fullscreen too: the host is then inside the fullscreen element). On a phone the
 * sheet, and in fullscreen the parts over the video (`PhoneFullscreenUi`) with the
 * dictionary beside the video or in the column.
 */
export function PageUi(props: {
  app: VideoApp;
  geometry: VideoGeometry;
  layout: Store<VideoLayout>;
}) {
  const { app, geometry } = props;
  const state = useStore(app.store);
  const { vertical, sidebar, sidebarSide, touch, fillsWindow } = useStore(
    props.layout,
  );
  const { hover, panel, phrase, settings, fullscreen, explain } = state;
  const phoneFullscreen = touch && fillsWindow;
  const position = sidebar
    ? "sidebar"
    : fullscreen
      ? "fullscreen"
      : subtitlePosition(settings, touch);
  // Placed when the window opens or the screen changes; it stays where the user drags it.
  const frame = useMemo(() => {
    const player = geometry.player();
    const viewport = { width: innerWidth, height: innerHeight };
    if (!player) return { left: viewport.width - 376, top: 64, height: 400 };
    return vertical && !fullscreen
      ? verticalDictionaryFrame(player, geometry.beside(), viewport)
      : dictionaryFrame(player, position, viewport, geometry.transcript());
  }, [panel?.opened, fullscreen, sidebar]);
  // A phone (mock MobileYouTubeDictionary): the sheet opens under the subtitle, so the
  // sentence stays in view; it never starts below the middle of the window.
  const sheetTop = useMemo(() => {
    const above = geometry.subtitle() ?? geometry.player();
    const top = above ? above.bottom : innerHeight * SHEET_TOP_MAX;
    return Math.round(Math.min(Math.max(top, 0), innerHeight * SHEET_TOP_MAX));
  }, [panel?.opened]);
  useClosedByPressAway(app, !!panel);
  useSelectionDroppedByPressAway(app, state.selecting);
  if (!showing(state)) return null;
  const selected = panel?.ref.selected !== undefined;
  // In the column it takes the transcript's place (in the column's dark theme).
  const inColumn = phoneFullscreen && sidebar;
  const window = panel && (
    <DictionaryWindow
      key={`${panel.opened} ${fullscreen} ${sidebar}`}
      {...(phoneFullscreen
        ? {
            variant: "side" as const,
            frame: inColumn ? columnFrame(sidebarSide) : PHONE_PANEL_FRAME,
            selected,
            back: inColumn,
          }
        : touch && !fullscreen
          ? { variant: "sheet" as const, frame: { top: sheetTop }, selected }
          : {
              variant: "window" as const,
              frame,
              // Over a video that fills the window or the screen: the darker shadow.
              fullscreen: fullscreen || sidebar,
            })}
      entry={windowView(panel.card, shownAnswer(explain))}
      nativeLang={settings.nativeLang}
      learningLang={settings.learningLang}
      status={panel.card.status}
      onStatus={app.setPanelStatus}
      onUse={app.useMeaning}
      onSpeak={app.speak}
      explain={explainSection(panel.card, explain, app)}
      dictionaries={panel.dictionaries}
      here={{
        source: "video",
        items: panel.here.map((line) => ({
          time: formatTime(line.timeMs),
          text: line.text,
          marks: line.marks,
          onClick: () => app.seekTo(line.timeMs),
        })),
      }}
      elsewhere={elsewhereItems(panel.card.elsewhere, Date.now())}
      onClose={app.closePanel}
    />
  );

  return (
    <>
      {phoneFullscreen && (
        <PhoneFullscreenUi
          app={app}
          state={state}
          column={sidebar ? sidebarSide : null}
        />
      )}
      {inColumn ? <ThemeScope theme="dark">{window}</ThemeScope> : window}
      {hover && (
        <Floating
          anchor={hover.anchor}
          shift={8}
          onPointerEnter={app.keepHover}
          onPointerLeave={app.releaseHover}
        >
          <HoverCard
            variant="video"
            {...hoverView(hover.card)}
            nativeLang={settings.nativeLang}
            onLearning={() => app.setHoverStatus("learning")}
            onKnown={() => app.setHoverStatus("known")}
            onDetails={app.openHoverDetails}
          />
        </Floating>
      )}
      {phrase && (
        // Pressing the card's buttons must not clear the selection.
        <Floating anchor={phrase.anchor} shift={8} onMouseDown={keepSelection}>
          <HoverCard
            variant="video"
            selection
            {...hoverView(phrase.card)}
            nativeLang={settings.nativeLang}
            onLearning={() => app.saveSelection("learning")}
            onKnown={() => app.saveSelection("known")}
            onDetails={app.openSelectionDetails}
          />
        </Floating>
      )}
    </>
  );
}
