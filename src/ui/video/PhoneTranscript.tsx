import { useState } from "preact/hooks";
import { t } from "../../i18n/t";
import { FoldIcon } from "../icons";
import { color, iconButton, phoneColumnPanel, root } from "../styles";
import { Transcript, type TranscriptProps } from "./Transcript";

/**
 * The transcript on a phone (mock MobileYouTube, MobileYouTubeLandscape): a "Transcript"
 * heading over the cards. Under the video (`column` false) the heading has a fold
 * button and the cards are `height` px tall; in the dark column beside a video in
 * fullscreen the panel is `height` px tall and the cards fill it.
 */
export function PhoneTranscript(
  props: TranscriptProps & { column: boolean; height?: number },
) {
  const [open, setOpen] = useState(true);
  const { column } = props;
  const shown = column || open;
  return (
    <section
      aria-label={t("video.transcript")}
      style={root({
        display: "flex",
        flexDirection: "column",
        ...(column
          ? {
              ...phoneColumnPanel,
              height: props.height ? `${props.height}px` : "100%",
            }
          : {
              background: color.card,
              borderBottom: `1px solid ${color.line}`,
            }),
      })}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          height: "48px",
          padding: column ? "0 16px" : "0 4px 0 16px",
          flex: "none",
          borderBottom: `1px solid ${color.line}`,
        }}
      >
        <h2
          style={{
            flex: 1,
            margin: 0,
            fontSize: "12px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: color.muted,
            fontWeight: 600,
          }}
        >
          {t("video.transcript")}
        </h2>
        {!column && (
          <button
            type="button"
            aria-label={t(
              open ? "video.hideTranscript" : "video.showTranscript",
            )}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            style={{
              ...iconButton,
              width: "44px",
              height: "44px",
              borderRadius: "22px",
              color: color.ink3,
            }}
          >
            <FoldIcon folded={!open} />
          </button>
        )}
      </div>
      {shown && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            ...(column
              ? { flex: 1, minHeight: 0 }
              : { height: `${props.height ?? 320}px` }),
          }}
        >
          <Transcript {...props} look={column ? "phoneColumn" : "phone"} />
        </div>
      )}
    </section>
  );
}
