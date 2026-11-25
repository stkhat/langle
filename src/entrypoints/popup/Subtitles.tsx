import { useId, useState } from "preact/hooks";
import {
  SUBTITLE_OPACITY_MAX,
  SUBTITLE_OPACITY_MIN,
  SUBTITLE_OPACITY_STEP,
  SUBTITLE_SIZE_MAX,
  SUBTITLE_SIZE_MIN,
  SUBTITLE_SIZE_STEP,
  type Settings,
  type SettingsPatch,
} from "../../core/settings";
import { t } from "../../i18n/t";
import { Segmented } from "../../ui/Segmented";
import { color, sectionHeading } from "../../ui/styles";
import { Switch } from "../../ui/Switch";

const POSITIONS = [
  ["belowVideo", "video.menu.belowVideo"],
  ["inVideo", "video.menu.inVideo"],
] as const;

const SIDES = [
  ["off", "popup.subtitles.off"],
  ["left", "popup.subtitles.left"],
  ["right", "popup.subtitles.right"],
] as const;

/** Mock MobileLangleSheet's segmented rows: an outlined box, the chosen option filled. */
const SEGMENTS = {
  style: {
    gap: 0,
    padding: 0,
    borderRadius: "8px",
    border: `1px solid ${color.lineStrong}`,
    background: color.card,
    overflow: "hidden",
  },
  button: (selected: boolean) => ({
    height: "44px",
    borderRadius: 0,
    fontSize: "14px",
    boxShadow: "none",
    ...(selected
      ? { background: color.green, color: color.white, fontWeight: 600 }
      : { background: color.card, color: color.ink3, fontWeight: 400 }),
  }),
};

function SwitchRow(props: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        minHeight: "44px",
      }}
    >
      <span style={{ flex: 1, fontSize: "15px" }}>{props.label}</span>
      <Switch
        size="phone"
        checked={props.checked}
        label={props.label}
        onToggle={props.onToggle}
      />
    </div>
  );
}

/** A slider with its label and value above it; the value is saved when it is let go. */
function SliderRow(props: {
  label: string;
  value: number;
  range: readonly [min: number, max: number, step: number];
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [min, max, step] = props.range;
  /** The value being dragged, until it is let go. */
  const [dragged, setDragged] = useState<number>();
  const value = dragged ?? props.value;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <span
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "15px",
        }}
      >
        <label for={id}>{props.label}</label>
        <span style={{ color: color.muted }}>{`${value}%`}</span>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={`${value}%`}
        onInput={(e) => setDragged(Number(e.currentTarget.value))}
        onChange={(e) => {
          setDragged(undefined);
          props.onChange(Number(e.currentTarget.value));
        }}
        style={{
          width: "100%",
          height: "32px",
          margin: 0,
          accentColor: color.green,
          cursor: "pointer",
        }}
      />
    </div>
  );
}

/**
 * The Langle sheet's Subtitles section on a video, in the phone layout (mock
 * MobileLangleSheet, video): where the subtitle goes, dual subtitles, the transcript
 * under the video and in fullscreen, text size, and the background only in the video.
 * The desktop keeps these in the player's L menu.
 */
export function Subtitles(props: {
  settings: Settings;
  change: (patch: SettingsPatch) => void;
}) {
  const { settings, change } = props;
  return (
    <section
      aria-label={t("popup.subtitles")}
      style={{ display: "flex", flexDirection: "column", gap: "14px" }}
    >
      <h2 style={sectionHeading}>{t("popup.subtitles")}</h2>
      <Segmented
        label={t("subtitle.position")}
        options={POSITIONS.map(([id, label]) => ({ id, label: t(label) }))}
        value={settings.phoneSubtitlePosition}
        onPick={(phoneSubtitlePosition) => change({ phoneSubtitlePosition })}
        style={SEGMENTS.style}
        button={SEGMENTS.button}
      />
      <SwitchRow
        label={t("video.menu.dualSubtitles")}
        checked={settings.subtitleTranslation}
        onToggle={() =>
          change({ subtitleTranslation: !settings.subtitleTranslation })
        }
      />
      <SwitchRow
        label={t("popup.subtitles.transcript")}
        checked={settings.transcriptShown}
        onToggle={() => change({ transcriptShown: !settings.transcriptShown })}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "15px" }}>
          {t("popup.subtitles.fullscreen")}
        </span>
        <Segmented
          label={t("popup.subtitles.fullscreen")}
          options={SIDES.map(([id, label]) => ({ id, label: t(label) }))}
          value={settings.phoneFullscreenTranscript}
          onPick={(phoneFullscreenTranscript) =>
            change({ phoneFullscreenTranscript })
          }
          style={SEGMENTS.style}
          button={SEGMENTS.button}
        />
      </div>
      <SliderRow
        label={t("video.menu.size")}
        value={settings.subtitleSize}
        range={[SUBTITLE_SIZE_MIN, SUBTITLE_SIZE_MAX, SUBTITLE_SIZE_STEP]}
        onChange={(subtitleSize) => change({ subtitleSize })}
      />
      {settings.phoneSubtitlePosition === "inVideo" && (
        <SliderRow
          label={t("video.menu.opacity")}
          value={settings.subtitleOpacity}
          range={[
            SUBTITLE_OPACITY_MIN,
            SUBTITLE_OPACITY_MAX,
            SUBTITLE_OPACITY_STEP,
          ]}
          onChange={(subtitleOpacity) => change({ subtitleOpacity })}
        />
      )}
    </section>
  );
}
