import { useState } from "preact/hooks";
import { t, type MessageKey } from "../../../i18n/t";
import {
  assignStepKey,
  STEP_ACTIONS,
  stepKeyOf,
  type StepAction,
  type StepKeys,
} from "../../../core/settings";
import { RowLabel } from "../../../ui/RowLabel";
import { color } from "../../../ui/styles";
import { Switch } from "../../../ui/Switch";

const LABELS: Record<StepAction, MessageKey> = {
  previous: "settings.video.keys.previous",
  replay: "settings.video.keys.replay",
  next: "settings.video.keys.next",
};

/**
 * "Keyboard shortcuts" (mock `Settings page` `#video`): the step keys' switch and a key
 * button per action. A click on a key waits for the next key press, which becomes the
 * action's key (an action that had it takes the old one); Escape, Tab or leaving the
 * button keeps the key.
 */
export function StepKeysRow(props: {
  keys: StepKeys;
  onChange: (keys: StepKeys) => void;
}) {
  const { keys } = props;
  const [waiting, setWaiting] = useState<StepAction | null>(null);
  const title = t("settings.video.keys");
  return (
    <div class="row" style={{ alignItems: "flex-start" }}>
      <RowLabel title={title} desc={t("settings.video.keysDesc")}>
        <span
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px 20px",
            marginTop: "10px",
          }}
        >
          {STEP_ACTIONS.map((action) => {
            const listening = waiting === action;
            const name = t(LABELS[action]);
            return (
              <span
                key={action}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "14px",
                  color: color.ink2,
                }}
              >
                {name}
                <button
                  type="button"
                  aria-label={t("settings.video.keys.label", {
                    action: name,
                    key: keys[action].toUpperCase(),
                  })}
                  disabled={!keys.on}
                  onClick={() => setWaiting(listening ? null : action)}
                  onBlur={() => listening && setWaiting(null)}
                  onKeyDown={(event) => {
                    if (!listening) return;
                    if (event.key === "Escape" || event.key === "Tab") {
                      setWaiting(null);
                      return;
                    }
                    event.preventDefault();
                    const key = stepKeyOf(event);
                    if (key === undefined) return;
                    setWaiting(null);
                    if (key !== keys[action])
                      props.onChange(assignStepKey(keys, action, key));
                  }}
                  style={{
                    minWidth: "40px",
                    height: "32px",
                    padding: "0 10px",
                    boxSizing: "border-box",
                    borderRadius: "8px",
                    border: `1px solid ${listening ? color.green : color.lineStrong}`,
                    borderBottomWidth: "2px",
                    font: "inherit",
                    fontSize: listening ? "13px" : "14px",
                    fontWeight: 600,
                    cursor: keys.on ? "pointer" : "default",
                    background: listening ? color.greenPale : color.card,
                    color: listening
                      ? color.greenDark
                      : keys.on
                        ? color.ink
                        : color.faint,
                  }}
                >
                  {listening
                    ? t("settings.video.keys.press")
                    : keys[action].toUpperCase()}
                </button>
              </span>
            );
          })}
        </span>
      </RowLabel>
      <Switch
        size="large"
        checked={keys.on}
        label={title}
        onToggle={() => {
          setWaiting(null);
          props.onChange({ ...keys, on: !keys.on });
        }}
      />
    </div>
  );
}
