import type { ComponentChildren, CSSProperties } from "preact";
import { BackChevronIcon } from "./icons";
import { color, FONT } from "./styles";

/**
 * A tab's screen in the phone app (mock MobileWords, MobileSettings): the page's width
 * less 20px each side, under the status bar. The tab bar is the app's own, below it.
 */
export const PHONE_SCREEN: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "14px",
  boxSizing: "border-box",
  padding:
    "calc(8px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))",
  background: color.surface,
  color: color.ink,
  fontFamily: FONT,
  fontSize: "15px",
};

/** A tab's title, as Home's ("Words", "Settings"), and what goes beside it. */
export function PhoneTitle(props: {
  title: string;
  children?: ComponentChildren;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        minHeight: "48px",
        flex: "none",
      }}
    >
      <h1
        style={{
          margin: 0,
          flex: 1,
          fontSize: "28px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        {props.title}
      </h1>
      {props.children}
    </header>
  );
}

/**
 * The bar of a screen pushed over a tab's list ("‹ Words", "‹ Settings"): it stays at
 * the top while the screen scrolls.
 */
export function PhoneBackBar(props: { label: string; onBack(): void }) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        height: "calc(48px + env(safe-area-inset-top))",
        boxSizing: "border-box",
        padding: "calc(2px + env(safe-area-inset-top)) 8px 2px 4px",
        background: color.surface,
      }}
    >
      <button
        type="button"
        onClick={() => props.onBack()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "2px",
          height: "44px",
          paddingBlock: "0",
          paddingInline: "4px 10px",
          border: 0,
          borderRadius: "22px",
          background: "none",
          color: color.greenText,
          font: "inherit",
          fontSize: "16px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <BackChevronIcon />
        {props.label}
      </button>
    </div>
  );
}
