import type { AdBlocking, AdBlockingView } from "../../../core/ad-blocking";
import { t } from "../../../i18n/t";
import { calendarDate } from "../../../ui/format/format";
import { color } from "../../../ui/styles";
import { Section, SwitchRow } from "../rows";

const MUTED = { fontSize: "13px", lineHeight: 1.5, color: color.muted };

/**
 * The phone app's ad blocking (mock MobileSettingsAdBlocking): "Block ads", the sites
 * where it is off, each with Remove (⋮ on a page turns it off there), and when the
 * filter lists were last updated, or that they have not been yet (nothing is blocked
 * until they are).
 */
export function AdBlockingSection(props: {
  view: AdBlockingView;
  change(state: AdBlocking): void;
  now: number;
}) {
  const { on, offSites, listsUpdatedAt } = props.view;
  return (
    <Section
      id="adblocking"
      label="settings.section.adBlocking"
      lead={t("settings.adBlocking.lead")}
    >
      <SwitchRow
        first
        title={t("settings.adBlocking.block")}
        desc=""
        checked={on}
        onToggle={() => props.change({ on: !on, offSites })}
      />
      <section
        aria-labelledby="adblocking-off"
        style={{ display: "flex", flexDirection: "column", gap: "8px" }}
      >
        <h2
          id="adblocking-off"
          style={{
            margin: 0,
            marginInlineStart: "4px",
            fontSize: "13px",
            fontWeight: 600,
            color: color.muted,
          }}
        >
          {t("settings.adBlocking.offSites")}
        </h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderRadius: "12px",
            background: color.card,
            border: `1px solid ${color.line}`,
            overflow: "hidden",
          }}
        >
          {offSites.map((site, i) => (
            <div
              key={site}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                minHeight: "56px",
                padding: "12px 16px",
                boxSizing: "border-box",
                borderTop: i ? `1px solid ${color.soft}` : 0,
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "16px",
                  overflowWrap: "anywhere",
                }}
              >
                <bdi>{site}</bdi>
              </span>
              <button
                type="button"
                aria-label={t("settings.sites.remove", { site })}
                onClick={() =>
                  props.change({
                    on,
                    offSites: offSites.filter((s) => s !== site),
                  })
                }
                style={{
                  flex: "none",
                  height: "44px",
                  padding: "0 12px",
                  marginInlineEnd: "-8px",
                  border: 0,
                  borderRadius: "8px",
                  background: "none",
                  color: color.greenText,
                  font: "inherit",
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t("action.remove")}
              </button>
            </div>
          ))}
          {offSites.length === 0 && (
            <p
              style={{
                margin: 0,
                padding: "16px",
                fontSize: "14px",
                lineHeight: 1.5,
                color: color.muted,
              }}
            >
              {t("settings.adBlocking.none")}
            </p>
          )}
        </div>
      </section>
      <p style={{ ...MUTED, margin: "0 4px" }}>
        {listsUpdatedAt === undefined
          ? t("settings.adBlocking.notYet")
          : t("settings.adBlocking.updated", {
              date: calendarDate(listsUpdatedAt, props.now),
            })}
      </p>
    </Section>
  );
}
