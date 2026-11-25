// Runs in the page (page.evaluate): what a translation can break in the layout. It
// walks the document and every open shadow root (check build), all of them on an
// extension page, only Langle's (`langle-*` hosts) on a web page.

export interface Issue {
  type: string;
  path: string;
  text: string;
  detail?: string;
}

export interface Control {
  path: string;
  h: number;
  w: number;
  lines: number;
  text: string;
}

export interface Measured {
  issues: Issue[];
  controls: Control[];
  /** Visible text nodes, trimmed. */
  texts: string[];
  /** aria-label, placeholder and title values. */
  attrs: string[];
  lang: string | null;
  dir: string | null;
}

export function measure(scope: "page" | "langle"): Measured {
  const issues: Issue[] = [];
  const controls: Control[] = [];
  const texts = new Set<string>();
  const attrs = new Set<string>();
  const CONTROL =
    "button,[role=button],[role=tab],[role=switch],[role=menuitem],[role=option],[role=radio],[role=checkbox],select,label,a,summary";

  const roots: (Document | ShadowRoot)[] = [];
  const isLangleRoot = (root: Document | ShadowRoot): boolean => {
    let r: Node = root;
    while (r instanceof ShadowRoot) {
      if (r.host.localName.startsWith("langle-")) return true;
      r = r.host.getRootNode();
    }
    return false;
  };
  const collect = (root: Document | ShadowRoot) => {
    roots.push(root);
    for (const el of root.querySelectorAll("*"))
      if (el.shadowRoot) collect(el.shadowRoot);
  };
  collect(document);
  const scoped =
    scope === "page" ? roots : roots.filter((r) => isLangleRoot(r));

  const parentOf = (el: Element): Element | null => {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  };
  const pathOf = (el: Element): string => {
    const parts: string[] = [];
    let e: Element | null = el;
    while (e && e !== document.documentElement) {
      const parent: Element | null = e.parentElement;
      const siblings = parent
        ? [...parent.children]
        : [...(e.getRootNode() as ShadowRoot | Document).children];
      parts.push(`${e.localName}${siblings.indexOf(e)}`);
      if (!parent) {
        const root = e.getRootNode();
        if (root instanceof ShadowRoot) {
          parts.push("#");
          e = root.host;
          continue;
        }
      }
      e = parent;
    }
    return parts.reverse().join(">");
  };
  const short = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 80);
  const visible = (el: Element, cs: CSSStyleDeclaration) =>
    el.getClientRects().length > 0 &&
    cs.visibility !== "hidden" &&
    Number(cs.opacity) > 0;
  const ownText = (el: Element) =>
    [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join("")
      .trim();
  const lineCount = (el: Element) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set<number>();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (!node.data.trim()) continue;
      range.selectNodeContents(node);
      for (const r of range.getClientRects())
        if (r.width > 0) tops.add(Math.round(r.top / 4));
    }
    return tops.size;
  };
  const clips = (v: string) => v === "hidden" || v === "clip";

  const rtlUi =
    scope === "page"
      ? document.documentElement.dir === "rtl"
      : scoped.some((r) => r.querySelector("[dir=rtl]") !== null);

  for (const root of scoped) {
    for (const el of root.querySelectorAll("*")) {
      if (el instanceof SVGElement) continue;
      if (el.localName === "style" || el.localName === "script") continue;
      const cs = getComputedStyle(el);
      if (!visible(el, cs)) continue;
      for (const name of ["aria-label", "placeholder", "title"]) {
        const v = el.getAttribute(name);
        if (v?.trim()) attrs.add(v.trim());
      }
      const text = ownText(el);
      if (text) texts.add(short(text));
      const isControl = el.matches(CONTROL);
      if (!text && !isControl) continue;
      const path = pathOf(el);
      const label = short(el.textContent ?? "");
      const inline = cs.display === "inline";

      if (!inline) {
        const sw = el.scrollWidth;
        const cw = el.clientWidth;
        if (cw > 0 && sw > cw + 1) {
          const type =
            cs.textOverflow === "ellipsis"
              ? "ellipsis"
              : clips(cs.overflowX)
                ? "clipped"
                : cs.overflowX === "visible"
                  ? "overflow"
                  : "scrollX";
          issues.push({ type, path, text: label, detail: `${sw}>${cw}` });
        }
        const sh = el.scrollHeight;
        const ch = el.clientHeight;
        if (ch > 0 && sh > ch + 1 && clips(cs.overflowY))
          issues.push({
            type: cs.webkitLineClamp !== "none" ? "lineClamp" : "clippedY",
            path,
            text: label,
            detail: `${sh}>${ch}`,
          });
      }

      // Cut off by the nearest ancestor that does not let it show.
      if (text) {
        const rect = el.getBoundingClientRect();
        for (let a = parentOf(el); a; a = parentOf(a)) {
          if (a === document.body || a === document.documentElement) break;
          const acs = getComputedStyle(a);
          if (acs.overflowX === "visible" && acs.overflowY === "visible")
            continue;
          const ar = a.getBoundingClientRect();
          const outX = rect.right > ar.right + 1 || rect.left < ar.left - 1;
          const outY = rect.bottom > ar.bottom + 1 || rect.top < ar.top - 1;
          if (outX && clips(acs.overflowX))
            issues.push({ type: "cutByAncestor", path, text: label });
          else if (outX && a.scrollWidth > a.clientWidth + 1)
            issues.push({ type: "scrollX", path: pathOf(a), text: label });
          else if (
            outY &&
            clips(acs.overflowY) &&
            rect.top < ar.bottom &&
            rect.bottom > ar.top
          )
            issues.push({ type: "cutByAncestorY", path, text: label });
          break;
        }
      }

      if (rtlUi && text && !inline && cs.textAlign === "left")
        issues.push({ type: "physicalLeft", path, text: label });

      if (isControl && !inline) {
        const r = el.getBoundingClientRect();
        controls.push({
          path,
          h: Math.round(r.height),
          w: Math.round(r.width),
          lines: lineCount(el),
          text: label,
        });
      }
    }

    // Siblings in the flow that overlap.
    for (const parent of root.querySelectorAll("*")) {
      const kids = [...parent.children].filter((k) => {
        if (k instanceof SVGElement || k.localName === "style") return false;
        const cs = getComputedStyle(k);
        return (
          visible(k, cs) &&
          // Wrapped inline boxes share lines by design.
          cs.display !== "contents" &&
          cs.display !== "inline" &&
          (k.textContent ?? "").trim() !== ""
        );
      });
      if (kids.length < 2 || kids.length > 60) continue;
      const rects = kids.map((k) => ({
        k,
        r: k.getBoundingClientRect(),
        abs: ["absolute", "fixed", "sticky"].includes(
          getComputedStyle(k).position,
        ),
      }));
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]!;
          const b = rects[j]!;
          const w =
            Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const h =
            Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (w > 2 && h > 2)
            issues.push({
              type: a.abs || b.abs ? "overlapPositioned" : "overlap",
              path: pathOf(a.k),
              text: `${short(a.k.textContent ?? "").slice(0, 30)} | ${short(b.k.textContent ?? "").slice(0, 30)}`,
              detail: `${Math.round(w)}x${Math.round(h)}`,
            });
        }
    }
  }

  if (
    scope === "page" &&
    document.documentElement.scrollWidth > document.documentElement.clientWidth
  )
    issues.push({
      type: "pageScrollX",
      path: "html",
      text: "",
      detail: `${document.documentElement.scrollWidth}>${document.documentElement.clientWidth}`,
    });

  let lang: string | null = null;
  let dir: string | null = null;
  if (scope === "page") {
    lang = document.documentElement.lang;
    dir = document.documentElement.dir;
  } else
    for (const r of scoped) {
      const el = r.querySelector("[lang]");
      if (el) {
        lang = el.getAttribute("lang");
        dir = el.getAttribute("dir");
        break;
      }
    }

  return {
    issues,
    controls,
    texts: [...texts],
    attrs: [...attrs],
    lang,
    dir,
  };
}
