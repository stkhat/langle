import type { CSSProperties } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { color } from "./styles";

type Style = CSSProperties;

/** A row that wraps; its options (`rowOption`) share the width and keep their labels. */
export const wrapRow = (gap: Style["gap"]): Style => ({
  display: "flex",
  flexWrap: "wrap",
  gap,
});

/** An option in a `wrapRow`: grows from 0, never narrower than its label. */
export const rowOption: Style = { flex: "1 1 0", minWidth: "max-content" };

/**
 * A row of options side by side (status buttons, segments, tabs). While the labels fit
 * on one line it is a grid of equal columns, as the mock draws them, each at least as
 * wide as its label: a longer label (a translation) takes the width it needs and the
 * others share the rest. When they cannot all fit, it becomes a `wrapRow`. A label never
 * wraps inside its option. Spread `row` on the row (with `ref`) and `option` on each
 * option.
 */
export function useOptionRow(gap: Style["gap"]) {
  const ref = useRef<HTMLDivElement>(null);
  const [wrap, setWrap] = useState(false);
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    const fit = () => {
      if (!wrap) {
        // The columns run past the row: the labels do not fit on one line.
        if (row.scrollWidth > row.clientWidth + 1) setWrap(true);
        return;
      }
      const tops = new Set(
        [...row.children].map((o) => (o as HTMLElement).offsetTop),
      );
      if (tops.size <= 1) setWrap(false);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    return () => observer.disconnect();
  });
  const row: Style = wrap
    ? wrapRow(gap)
    : {
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "minmax(max-content, 1fr)",
        gap,
      };
  return { ref, row, option: wrap ? rowOption : {} };
}

/** Mock `segBtn`'s track: the options sit on it side by side. */
export const segmentGroup: Style = {
  gap: "2px",
  padding: "3px",
  borderRadius: "10px",
  background: color.surfaceGray,
};

/** Mock `segBtn`: the selected option is raised. */
export const segment = (selected: boolean): Style => ({
  margin: 0,
  border: 0,
  borderRadius: "8px",
  font: "inherit",
  fontSize: "13px",
  cursor: "pointer",
  ...(selected
    ? {
        background: color.raised,
        color: color.ink,
        fontWeight: 600,
        boxShadow: "0 1px 3px rgba(20,24,43,0.18)",
      }
    : { background: "transparent", color: color.ink3 }),
});

/** A segmented control: one option pressed at a time. */
export function Segmented<T extends string>(props: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onPick: (id: T) => void;
  /** The track's own look, over a `useOptionRow` row. */
  style?: Style;
  /** Each option's size, over `segment`. */
  button: (selected: boolean) => Style;
}) {
  const { ref, row, option } = useOptionRow(segmentGroup.gap);
  return (
    <div
      ref={ref}
      role="group"
      aria-label={props.label}
      style={{ ...row, ...segmentGroup, ...props.style }}
    >
      {props.options.map(({ id, label }) => {
        const selected = props.value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => props.onPick(id)}
            style={{
              ...option,
              ...segment(selected),
              ...props.button(selected),
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
