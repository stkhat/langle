import { t } from "../../i18n/t";
import { ChevronRightIcon, SourceIcon } from "../icons";
import { color } from "../styles";
import { langAttrs } from "../text-direction";

/** An occurrence in another source. */
export interface ElsewhereItem {
  title: string;
  meta: string;
  text: string;
  href?: string;
  video: boolean;
}

/** Its icon, title, meta and sentence; a link when it has one. */
export function ElsewhereRow(props: {
  item: ElsewhereItem;
  /** The sentence's language. */
  lang: string;
  /** The phone layout (mock MobileWordsDetail): a card, larger type, › when a link. */
  touch?: boolean;
  /** Opens the link instead of a new tab (the app opens pages over Home). */
  onOpen?: (href: string) => void;
}) {
  const { item, touch, onOpen } = props;
  const style = {
    display: "flex",
    gap: "10px",
    padding: touch ? "12px" : "10px",
    borderRadius: touch ? "10px" : "8px",
    background: touch ? color.card : color.surface,
    ...(touch && { border: `1px solid ${color.line}` }),
    color: "inherit",
    textDecoration: "none",
  };
  const size = touch ? "14px" : "13px";
  const children = (
    <>
      <span style={{ flex: "none", color: color.muted, paddingTop: "1px" }}>
        <SourceIcon
          video={item.video}
          label={t(item.video ? "dict.source.video" : "dict.source.page")}
        />
      </span>
      <span
        style={{
          flex: touch ? 1 : undefined,
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: size, fontWeight: 600, lineHeight: 1.4 }}>
          {item.title}
        </span>
        <span style={{ fontSize: "12px", color: color.muted }}>
          {item.meta}
        </span>
        <span
          {...langAttrs(props.lang)}
          style={{ fontSize: size, lineHeight: 1.5, color: color.ink3 }}
        >
          {item.text}
        </span>
      </span>
      {touch && item.href && <ChevronRightIcon />}
    </>
  );
  const { href } = item;
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      style={style}
      onClick={
        onOpen &&
        ((event) => {
          event.preventDefault();
          onOpen(href);
        })
      }
    >
      {children}
    </a>
  ) : (
    <div style={style}>{children}</div>
  );
}
