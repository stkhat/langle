import type { SiteRow as Row } from "../../core/site-access/site-row";
import { t } from "../../i18n/t";
import { color } from "../../ui/styles";
import { Switch } from "../../ui/Switch";
import { NUDGE_FONT } from "./Support";

const NUDGE_ID = "site-nudge";

/**
 * "On this site" with the host and its switch (mock Toolbar). On the first opening on
 * a new site in the learning language (mock SiteAccessAsk) the switch is ringed and a
 * bubble under the row, its tail pointing up at the switch, says what it does.
 */
export function SiteRow(props: {
  row: Exclude<Row, "hidden">;
  host: string;
  phone: boolean;
  onToggle: () => void;
}) {
  const ask = props.row === "ask";
  const line = (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          minWidth: 0,
        }}
      >
        <span
          style={{ fontSize: props.phone ? "15px" : "14px", fontWeight: 600 }}
        >
          {t("popup.site")}
        </span>
        <span
          style={{
            fontSize: "13px",
            color: color.muted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {props.host}
        </span>
      </div>
      <Switch
        size={props.phone ? "phone" : "large"}
        checked={props.row === "on"}
        label={t("popup.siteSwitch")}
        onToggle={props.onToggle}
        {...(ask && {
          describedBy: NUDGE_ID,
          // A 3px gap of the card's color, then 2px orange.
          ring: `0 0 0 3px ${color.card}, 0 0 0 5px ${color.orange}`,
        })}
      />
    </div>
  );
  if (!ask) return line;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {line}
      <div
        id={NUDGE_ID}
        role="status"
        style={{
          position: "relative",
          fontFamily: NUDGE_FONT,
          paddingBlock: "10px",
          paddingInline: "12px",
          borderRadius: "10px",
          background: color.orangeTint,
          color: color.orangeText,
          fontSize: "15px",
          fontWeight: 800,
        }}
      >
        {t("popup.siteAsk")}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            // Under the switch's middle: the switch is 44px wide, at the row's end.
            insetInlineEnd: "16px",
            top: "-6px",
            width: "12px",
            height: "12px",
            background: color.orangeTint,
            transform: "rotate(45deg)",
          }}
        ></span>
      </div>
    </div>
  );
}
