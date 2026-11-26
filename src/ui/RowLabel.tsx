import {
  createContext,
  type ComponentChildren,
  type CSSProperties,
} from "preact";
import { useContext } from "preact/hooks";
import { color } from "./styles";

/**
 * The settings rows are in the phone layout (mock MobileSettingsSection): titles in
 * the body's weight, larger, and controls a finger's size.
 */
export const PhoneRows = createContext(false);

/** A settings row's title over its description; a `<label>` when it names a control (`for`). */
export function RowLabel(props: {
  title: ComponentChildren;
  desc: ComponentChildren;
  for?: string;
  /** A sub-row's smaller title. */
  small?: boolean;
  style?: CSSProperties;
  /** Below the description. */
  children?: ComponentChildren;
}) {
  const Tag = props.for ? "label" : "span";
  const phone = useContext(PhoneRows);
  return (
    <Tag
      for={props.for}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        flex: 1,
        minWidth: 0,
        ...props.style,
      }}
    >
      <span
        style={
          phone
            ? { fontSize: props.small ? "15px" : "16px" }
            : { fontSize: props.small ? "14px" : "15px", fontWeight: 600 }
        }
      >
        {props.title}
      </span>
      {props.desc !== "" && (
        <span
          style={{ fontSize: "13px", lineHeight: 1.45, color: color.muted }}
        >
          {props.desc}
        </span>
      )}
      {props.children}
    </Tag>
  );
}
