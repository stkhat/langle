import { useContext } from "preact/hooks";
import type { Settings } from "../../../core/settings";
import { t, type MessageKey } from "../../../i18n/t";
import { PhoneRows, RowLabel } from "../../../ui/RowLabel";
import { useOptionRow } from "../../../ui/Segmented";
import { color } from "../../../ui/styles";
import { Section, SwitchRow, type SectionProps } from "../rows";
import { StepKeysRow } from "./StepKeysRow";

type Position = Settings["subtitlePosition"];

const POSITIONS: readonly {
  id: Position;
  label: MessageKey;
  desc: MessageKey;
  bar: { bottom: string };
}[] = [
  {
    id: "inVideo",
    label: "settings.video.inVideo",
    desc: "settings.video.inVideoDesc",
    bar: { bottom: "10px" },
  },
  {
    id: "belowVideo",
    label: "settings.video.belowVideo",
    desc: "settings.video.belowVideoDesc",
    bar: { bottom: "-16px" },
  },
];

/** The phone's own positions (mock MobileSettingsSection): below the video by default. */
const PHONE_POSITIONS: typeof POSITIONS = [
  {
    id: "belowVideo",
    label: "settings.video.belowVideoDefault",
    desc: "settings.video.belowVideoDesc",
    bar: { bottom: "-14px" },
  },
  {
    id: "inVideo",
    label: "settings.video.inVideoPhone",
    desc: "settings.video.inVideoDesc",
    bar: { bottom: "8px" },
  },
];

const FULLSCREEN: readonly {
  id: Settings["phoneFullscreenTranscript"];
  label: MessageKey;
}[] = [
  { id: "off", label: "settings.video.fullscreen.off" },
  { id: "left", label: "settings.video.fullscreen.left" },
  { id: "right", label: "settings.video.fullscreen.right" },
];

/** The pictures draw a video frame and its subtitle, dark in both themes. */
const VIDEO_FRAME = "#14182B";
const PHONE_VIDEO_FRAME = "#1E2233";

/**
 * The subtitle position, both translations and the step keys. In the phone layout it
 * sets the phone's own position (`phoneSubtitlePosition`, read in touch mode) and the
 * fullscreen transcript, and has no keyboard shortcuts.
 */
export function VideoSection(props: SectionProps) {
  const s = props.settings;
  const phone = useContext(PhoneRows);
  const position = phone ? s.phoneSubtitlePosition : s.subtitlePosition;
  const pick = (id: Position) =>
    props.change(
      phone ? { phoneSubtitlePosition: id } : { subtitlePosition: id },
    );
  return (
    <Section
      id="video"
      label="settings.section.video"
      lead={t(phone ? "settings.video.leadPhone" : "settings.video.lead")}
    >
      <div
        role="group"
        aria-label={t("subtitle.position")}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: phone ? "10px" : "12px",
        }}
      >
        {(phone ? PHONE_POSITIONS : POSITIONS).map((p) => {
          const on = position === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => pick(p.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "6px",
                padding: phone ? "12px" : "16px",
                boxSizing: "border-box",
                margin: 0,
                borderRadius: "12px",
                font: "inherit",
                color: color.ink,
                textAlign: "start",
                cursor: "pointer",
                background: on && !phone ? color.greenPale : color.card,
                border: `2px solid ${on ? color.green : color.line}`,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "relative",
                  display: "block",
                  width: phone ? "100%" : "160px",
                  height: phone ? "64px" : "90px",
                  marginBottom: "18px",
                  borderRadius: "6px",
                  background: phone ? PHONE_VIDEO_FRAME : VIDEO_FRAME,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: phone ? "14%" : "30px",
                    right: phone ? "14%" : "30px",
                    height: "10px",
                    borderRadius: "3px",
                    background: phone
                      ? p.id === "belowVideo"
                        ? "#C9CDD6"
                        : "#FFFFFF"
                      : on
                        ? "#6FE3C3"
                        : "#C9CDD6",
                    ...p.bar,
                  }}
                ></span>
              </span>
              <span style={{ fontSize: "15px", fontWeight: 600 }}>
                {t(p.label)}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  lineHeight: 1.45,
                  color: color.muted,
                }}
              >
                {t(p.desc)}
              </span>
            </button>
          );
        })}
      </div>
      <SwitchRow
        title={t("subtitle.translation")}
        desc={t("settings.video.subtitleTranslationDesc")}
        checked={s.subtitleTranslation}
        onToggle={() =>
          props.change({ subtitleTranslation: !s.subtitleTranslation })
        }
      />
      <SwitchRow
        title={t("transcript.translation")}
        desc={t("settings.video.transcriptTranslationDesc")}
        checked={s.transcriptTranslation}
        onToggle={() =>
          props.change({ transcriptTranslation: !s.transcriptTranslation })
        }
      />
      {phone ? (
        <FullscreenRow
          value={s.phoneFullscreenTranscript}
          onPick={(phoneFullscreenTranscript) =>
            props.change({ phoneFullscreenTranscript })
          }
        />
      ) : (
        <StepKeysRow
          keys={s.stepKeys}
          onChange={(stepKeys) => props.change({ stepKeys })}
        />
      )}
    </Section>
  );
}

/** "Transcript in fullscreen": Off, Left or Right (mock MobileSettingsSection). */
function FullscreenRow(props: {
  value: Settings["phoneFullscreenTranscript"];
  onPick: (id: Settings["phoneFullscreenTranscript"]) => void;
}) {
  const title = t("settings.video.fullscreen");
  const { ref, row, option } = useOptionRow(0);
  return (
    <div class="row">
      <RowLabel title={title} desc={t("settings.video.fullscreenDesc")} />
      <div
        ref={ref}
        role="radiogroup"
        aria-label={title}
        style={{
          ...row,
          border: `1px solid ${color.lineStrong}`,
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {FULLSCREEN.map((o) => {
          const on = props.value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => props.onPick(o.id)}
              style={{
                ...option,
                height: "44px",
                border: 0,
                margin: 0,
                font: "inherit",
                fontSize: "14px",
                cursor: "pointer",
                ...(on
                  ? {
                      background: color.green,
                      color: color.white,
                      fontWeight: 600,
                    }
                  : { background: color.card, color: color.ink2 }),
              }}
            >
              {t(o.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
