import type { SetupStage } from "../../core/setup";
import { t } from "../../i18n/t";
import { BrandHeader } from "../../ui/BrandHeader";
import { color, FONT } from "../../ui/styles";

/**
 * The popup until this device is set up (mock `First run — before agreeing (toolbar
 * popup)`): the gray mark and the name, what is left to do, and the way to it.
 */
export function SetupPending(props: {
  stage: Exclude<SetupStage, "ready">;
  /** Opens the setup. */
  review(): void;
}) {
  const consent = props.stage === "consent";
  return (
    <div
      role="dialog"
      aria-label={t("app.name")}
      style={{
        width: "360px",
        boxSizing: "border-box",
        background: color.card,
        color: color.ink,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          minHeight: "64px",
          boxSizing: "border-box",
          padding: "12px 16px",
          borderBottom: `1px solid ${color.line}`,
        }}
      >
        <BrandHeader size="popup" title={t("app.name")} gray />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          padding: "14px 16px 16px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "14px", fontWeight: 600 }}>
            {t("popup.setup.title")}
          </span>
          <span
            style={{ fontSize: "13px", lineHeight: 1.45, color: color.muted }}
          >
            {t(consent ? "popup.setup.consent" : "popup.setup.languages")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => props.review()}
          style={{
            boxSizing: "border-box",
            height: "40px",
            padding: "0 16px",
            border: `1px solid ${color.greenFill}`,
            borderRadius: "8px",
            background: color.greenFill,
            color: color.white,
            font: "inherit",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t(consent ? "popup.setup.review" : "popup.setup.choose")}
        </button>
      </div>
    </div>
  );
}
