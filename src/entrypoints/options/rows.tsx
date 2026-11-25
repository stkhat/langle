import type { ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import type { Settings, SettingsPatch } from "../../core/settings";
import { t, type MessageKey } from "../../i18n/t";
import { PhoneRows, RowLabel } from "../../ui/RowLabel";
import { Segmented } from "../../ui/Segmented";
import { color } from "../../ui/styles";
import { Switch } from "../../ui/Switch";

/** What every section gets. */
export interface SectionProps {
  settings: Settings;
  /** Shows the change at once and saves it. */
  change(patch: SettingsPatch): void;
}

/**
 * A section: a card on a computer; in the phone layout the pushed screen's title and
 * lead, its rows on one card (`PHONE_SETTINGS_CSS`).
 */
export function Section(props: {
  id: string;
  label: MessageKey;
  lead?: string;
  gap?: string;
  children: ComponentChildren;
}) {
  const phone = useContext(PhoneRows);
  const heading = `${props.id}-heading`;
  const Heading = phone ? "h1" : "h2";
  return (
    <section
      id={props.id}
      class="card"
      aria-labelledby={heading}
      style={props.gap && !phone ? { gap: props.gap } : undefined}
    >
      <Heading id={heading} class="h2">
        {t(props.label)}
      </Heading>
      {props.lead && <p class="lead">{props.lead}</p>}
      {props.children}
    </section>
  );
}

export function SwitchRow(props: {
  title: string;
  desc: string;
  /** The switch's name; the title by default. */
  label?: string;
  checked: boolean;
  onToggle: () => void;
  /** The section's first row: no line above. */
  first?: boolean;
  before?: ComponentChildren;
}) {
  const phone = useContext(PhoneRows);
  return (
    <div
      class="row"
      style={
        props.first && !phone ? { borderTop: 0, paddingTop: 0 } : undefined
      }
    >
      {props.before}
      <RowLabel title={props.title} desc={props.desc} />
      <Switch
        size={phone ? "phone" : "large"}
        checked={props.checked}
        label={props.label ?? props.title}
        onToggle={props.onToggle}
      />
    </div>
  );
}

/** A row with a few options side by side (mock: "New words you didn't save"). */
export function ChoiceRow<T extends string>(props: {
  title: string;
  desc: string;
  options: readonly { id: T; label: MessageKey }[];
  value: T;
  onPick: (id: T) => void;
}) {
  const phone = useContext(PhoneRows);
  return (
    // On a phone the options go under the title, across the row.
    <div class={phone ? "row col" : "row"}>
      <RowLabel title={props.title} desc={props.desc} />
      <Segmented
        label={props.title}
        options={props.options.map((o) => ({ ...o, label: t(o.label) }))}
        value={props.value}
        onPick={props.onPick}
        style={{ display: phone ? "flex" : "inline-flex", flex: "none" }}
        button={(selected) => ({
          height: phone ? "40px" : "34px",
          padding: "0 14px",
          fontWeight: 600,
          ...(phone && { flex: 1, fontSize: "14px" }),
          ...(!selected && { color: color.muted }),
        })}
      />
    </div>
  );
}

export function LaterRow(props: { title: string; desc: string }) {
  return (
    <div class="row">
      <RowLabel title={props.title} desc={props.desc} />
      <span class="soon">{t("settings.comingLater")}</span>
    </div>
  );
}

/**
 * The phone layout's section styles, under `.ph` (mock MobileSettingsSection): the
 * title and lead on the page, and each run of rows on a white card.
 */
export const PHONE_SETTINGS_CSS = `
.ph .card{background:none;border:0;border-radius:0;padding:0;gap:0}
.ph .card>*+*{margin-top:16px}
.ph .card>.lead{margin-top:6px}
.ph .h2{font-size:28px;font-weight:700;letter-spacing:-0.02em}
.ph .lead{margin:0;font-size:14px}
.ph :is(.row,.sub){min-height:64px;box-sizing:border-box;gap:14px;padding:12px 16px;background:${color.card};border:1px solid ${color.line};border-top-color:${color.soft};border-bottom:0}
.ph .card>:is(.row,.sub)+:is(.row,.sub){margin-top:0}
.ph .card>:is(.row,.sub):not(:is(.row,.sub)+*){border-top-color:${color.line};border-radius:12px 12px 0 0}
.ph .card>:is(.row,.sub):not(:has(+:is(.row,.sub))){border-bottom:1px solid ${color.line};border-bottom-left-radius:12px;border-bottom-right-radius:12px}
.ph .sub{padding-left:28px}
.ph :is(.row,.sub){flex-wrap:wrap}
.ph .col{flex-direction:column;align-items:stretch;gap:10px}
.ph .sel{height:44px;min-width:0;max-width:100%;font-size:16px}
.ph .btn{height:44px;font-size:15px}
.ph .st{min-width:0}
`;
