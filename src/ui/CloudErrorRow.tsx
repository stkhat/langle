import { t } from "../i18n/t";
import { cloudErrorLine, type CloudView } from "./format/cloud";
import { relativeTime } from "./format/format";
import { color } from "./styles";

/** The phone's Reconnect (mock `MobileStartReconnect`): 40px, beside the lines. */
const RECONNECT = {
  flex: "none",
  height: "40px",
  padding: "0 14px",
  borderRadius: "10px",
  border: `1px solid ${color.lineStrong}`,
  background: color.card,
  color: color.ink,
  font: "inherit",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
} as const;

/**
 * What stopped saving to the user's cloud storage, in the phone layout (Home and the
 * Langle sheet; mock `MobileStartReconnect`): the red line over when it last saved,
 * with Reconnect at the right when signing in again is the answer. Nothing while it
 * saves (a retry goes on by itself).
 */
export function CloudErrorRow(props: {
  view: Extract<CloudView, { kind: "connected" }>;
  now: number;
  /** The phone app: "Update Langle on this phone". */
  thisPhone: boolean;
  onReconnect: () => void;
}) {
  const { view } = props;
  const { status } = view;
  const error = cloudErrorLine(status, view.name, props.thisPhone);
  if (!error) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        <span
          style={{ fontSize: "13px", fontWeight: 600, color: color.danger }}
        >
          {error}
        </span>
        <span style={{ fontSize: "12px", color: color.muted }}>
          {status.lastSavedAt === undefined
            ? t("sync.notSaved")
            : t("popup.cloud.lastSaved", {
                provider: view.name,
                when: relativeTime(status.lastSavedAt, props.now),
              })}
        </span>
      </span>
      {status.error === "reconnect" && (
        <button type="button" style={RECONNECT} onClick={props.onReconnect}>
          {t("cloud.reconnect")}
        </button>
      )}
    </div>
  );
}
