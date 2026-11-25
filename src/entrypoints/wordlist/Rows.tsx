import type { CSSProperties } from "preact";
import { useEffect, useState } from "preact/hooks";
import { t } from "../../i18n/t";
import type { TermSummary } from "../../messaging/protocol";
import { shortDate } from "../../ui/format/format";
import { BookmarkIcon, ChevronRightIcon } from "../../ui/icons";
import { useShownRows } from "../../ui/rows-in-view";
import { color } from "../../ui/styles";
import { langAttrs } from "../../ui/text-direction";

type Style = CSSProperties;

/** The fixed columns' widths: Status, Seen, Last seen. */
const FIXED = [110, 70, 110];
/**
 * The header's columns: a fixed column widens to its heading where a translation is
 * longer than the column (the rows follow through `--fixed-columns`, `fitColumns`).
 */
export const HEADER_COLUMNS = `220px minmax(0, 1fr) ${FIXED.map((px) => `minmax(${px}px, max-content)`).join(" ")}`;
/** A row's columns: the header's fixed widths, as `fitColumns` measured them. */
const COLUMNS = `220px minmax(0, 1fr) var(--fixed-columns, ${FIXED.map((px) => `${px}px`).join(" ")})`;

/** Gives the rows under `list` the fixed column widths `header` (on HEADER_COLUMNS) took. */
export function fitColumns(header: HTMLElement, list: HTMLElement): void {
  const tracks = getComputedStyle(header)
    .gridTemplateColumns.split(" ")
    .slice(2)
    .join(" ");
  if (list.style.getPropertyValue("--fixed-columns") !== tracks)
    list.style.setProperty("--fixed-columns", tracks);
}
/** A row's height plus the gap under it (px). */
const ROW_STRIDE = 50;
/** The phone layout's row (mock MobileWords): 64px, a line between rows, no gap. */
const PHONE_ROW_STRIDE = 64;
/** Above this many rows, only the rows in view are rendered. */
const WINDOW_ABOVE = 500;
/** Rows rendered beyond the view on each side while windowing. */
const OVERSCAN = 6;

function StatusBadge(props: { status: TermSummary["status"] }) {
  const learning = props.status === "learning";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: "24px",
        padding: "0 9px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: learning ? color.hlLearning : color.surfaceGray,
        color: learning ? color.greenDark : color.ink2,
      }}
    >
      {t(learning ? "status.learning" : "status.known")}
    </span>
  );
}

/**
 * The Meaning column: the meanings the user chose (marked, joined by " · ") instead of
 * the short meaning.
 */
export function rowMeaning(term: TermSummary, nativeLang: string) {
  const mine = term.meanings ?? [];
  if (mine.length === 0)
    return { text: term.short ?? "", lang: term.glossLang ?? nativeLang };
  const langs = new Set(mine.map((m) => m.lineLang ?? nativeLang));
  return {
    text: mine.map((m) => m.line).join(" · "),
    lang: langs.size === 1 ? [...langs][0]! : nativeLang,
    mine: true,
  };
}

const phraseTag: Style = {
  fontSize: "11px",
  fontWeight: 600,
  color: color.greenDark,
  background: color.greenPale,
  borderRadius: "999px",
  padding: "2px 7px",
};

function Row(props: {
  term: TermSummary;
  selected: boolean;
  nativeLang: string;
  now: number;
  onPick: () => void;
  style?: Style;
}) {
  const { term, selected } = props;
  const meaning = rowMeaning(term, props.nativeLang);
  return (
    <button
      type="button"
      class={selected ? undefined : "rowb"}
      data-row-id={term.id}
      aria-pressed={selected}
      onClick={props.onPick}
      style={{
        display: "grid",
        gridTemplateColumns: COLUMNS,
        alignItems: "center",
        width: "100%",
        height: "48px",
        flex: "none",
        boxSizing: "border-box",
        textAlign: "start",
        borderRadius: "8px",
        font: "inherit",
        color: color.ink,
        cursor: "pointer",
        padding: 0,
        margin: 0,
        ...(selected
          ? {
              background: color.greenPale,
              border: `1px solid ${color.greenLine}`,
            }
          : { background: "transparent", border: "1px solid transparent" }),
        ...props.style,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "0 12px",
          minWidth: 0,
        }}
      >
        <span
          data-head
          style={{
            fontSize: "15px",
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {term.key}
        </span>
        {term.kind === "phrase" && (
          <span style={phraseTag}>{t("kind.phrase")}</span>
        )}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "0 12px",
          minWidth: 0,
          fontSize: "14px",
          color: color.ink2,
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {meaning.mine && (
          <BookmarkIcon label={t("wordlist.yourMeanings")} size={13} />
        )}
        <span
          {...langAttrs(meaning.lang)}
          style={{ overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {meaning.text}
        </span>
      </span>
      <span style={{ padding: "0 12px" }}>
        <StatusBadge status={term.status} />
      </span>
      <span
        style={{
          padding: "0 12px",
          fontSize: "14px",
          color: color.ink3,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {term.seen}
      </span>
      <span style={{ padding: "0 12px", fontSize: "13px", color: color.muted }}>
        {shortDate(term.lastSeen, props.now)}
      </span>
    </button>
  );
}

/** A row of the phone layout (mock MobileWords): word and meaning, status, ›. A tap opens it. */
function PhoneRow(props: {
  term: TermSummary;
  first: boolean;
  nativeLang: string;
  onPick: () => void;
  style?: Style;
}) {
  const { term } = props;
  const meaning = rowMeaning(term, props.nativeLang);
  return (
    <button
      type="button"
      class="rowb"
      data-row-id={term.id}
      onClick={props.onPick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        height: `${PHONE_ROW_STRIDE}px`,
        flex: "none",
        boxSizing: "border-box",
        paddingBlock: "10px",
        paddingInline: "16px 12px",
        margin: 0,
        border: 0,
        borderTop: props.first ? 0 : `1px solid ${color.soft}`,
        background: "transparent",
        textAlign: "start",
        font: "inherit",
        color: color.ink,
        cursor: "pointer",
        ...props.style,
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "3px",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minWidth: 0,
          }}
        >
          <span
            data-head
            style={{
              fontSize: "16px",
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {term.key}
          </span>
          {term.kind === "phrase" && (
            <span style={{ ...phraseTag, flex: "none" }}>
              {t("kind.phrase")}
            </span>
          )}
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            minWidth: 0,
            fontSize: "14px",
            color: color.ink2,
          }}
        >
          {meaning.mine && (
            <BookmarkIcon label={t("wordlist.yourMeanings")} size={12} />
          )}
          <span
            {...langAttrs(meaning.lang)}
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {meaning.text}
          </span>
        </span>
      </span>
      <StatusBadge status={term.status} />
      <ChevronRightIcon />
    </button>
  );
}

/** The rows, all of them, or only those in view above `WINDOW_ABOVE`. */
export function Rows(props: {
  rows: TermSummary[];
  selectedId: string | null;
  nativeLang: string;
  now: number;
  empty: string | null;
  onPick: (term: TermSummary) => void;
  /** Rows came into view (their meanings may need translating). */
  onShown: (terms: TermSummary[]) => void;
  /** The phone layout's rows (`PhoneRow`). */
  phone?: boolean;
}) {
  const { phone } = props;
  const stride = phone ? PHONE_ROW_STRIDE : ROW_STRIDE;
  const scroller = useShownRows<HTMLDivElement, TermSummary>(
    props.rows,
    props.onShown,
  );
  const [view, setView] = useState({ top: 0, height: 0 });
  const windowed = props.rows.length > WINDOW_ABOVE;

  useEffect(() => {
    const element = scroller.current;
    if (!element || !windowed) return;
    const measure = () =>
      setView({ top: element.scrollTop, height: element.clientHeight });
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      resize.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, [windowed]);

  const row = (term: TermSummary, index: number, style?: Style) =>
    phone ? (
      <PhoneRow
        key={term.id}
        term={term}
        first={index === 0}
        nativeLang={props.nativeLang}
        onPick={() => props.onPick(term)}
        {...(style && { style })}
      />
    ) : (
      <Row
        key={term.id}
        term={term}
        selected={term.id === props.selectedId}
        nativeLang={props.nativeLang}
        now={props.now}
        onPick={() => props.onPick(term)}
        {...(style && { style })}
      />
    );

  let content;
  if (windowed) {
    const first = Math.max(0, Math.floor(view.top / stride) - OVERSCAN);
    const last = Math.min(
      props.rows.length,
      Math.ceil((view.top + view.height) / stride) + OVERSCAN,
    );
    content = (
      <div
        style={{
          position: "relative",
          flex: "none",
          height: `${props.rows.length * stride - (phone ? 0 : 2)}px`,
        }}
      >
        {props.rows.slice(first, last).map((term, i) =>
          row(term, first + i, {
            position: "absolute",
            insetInlineStart: 0,
            top: `${(first + i) * stride}px`,
          }),
        )}
      </div>
    );
  } else content = props.rows.map((term, i) => row(term, i));

  return (
    <div
      ref={scroller}
      data-rows
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: phone ? 0 : "2px",
      }}
    >
      {content}
      {props.empty && (
        <p
          style={{
            margin: 0,
            padding: phone ? "24px 16px" : "24px 12px",
            fontSize: "14px",
            color: color.muted,
          }}
        >
          {props.empty}
        </p>
      )}
    </div>
  );
}
