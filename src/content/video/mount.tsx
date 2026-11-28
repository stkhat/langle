import { render, type JSX } from "preact";
import { fullscreenElement } from "../fullscreen";
import { boxOf } from "../lookup/geometry";
import { UiRoot } from "../../ui/locale-root";
import { createShadowHost } from "../shadow-host";
import { inUse } from "./hold";
import { createStore } from "../store";
import {
  BelowVideoUi,
  CONTROL_BAR_GAP,
  InPlayerUi,
  MenuUi,
  PageUi,
  phoneColumn,
  PlayerBarUi,
  SUBTITLE_BOTTOM,
  subtitleOverVideo,
  TranscriptUi,
  VideoThemed,
  type Column,
  type VideoGeometry,
  type VideoLayout,
} from "./VideoUi";
import { NO_INSETS, safeAreaReader, sameInsets } from "../../ui/safe-area";
import { controlsTopIn, sameBoxes, shownControls } from "./site-controls";
import type { InsertionPoint, PlatformAdapter } from "./platform";
import { transcriptPlace } from "./placement";
import type { VideoApp } from "./state";
import { NEVER_TOUCH, type TouchMode } from "../touch/touch-mode";

export interface MountOptions {
  adapter: PlatformAdapter;
  app: VideoApp;
  /**
   * Whether the page is in touch mode (spec mobile-app.md "Touch in place of hover").
   * Default: never (the desktop).
   */
  touchMode?: TouchMode;
}

interface Part {
  host: HTMLElement;
  /**
   * Where the host belongs now (`player`: the adapter's player element, read once per
   * placing); null when its place is not on the page.
   */
  point(player: HTMLElement | null): InsertionPoint | null;
  /**
   * Moves back into the same parent in the current second, so a site that keeps taking
   * the host out cannot start a loop. A new parent (a control bar the site built again)
   * is not counted.
   */
  moves: { second: number; count: number; parent: Element | null };
}

/** Elements that do not draw their children (the fullscreen element can be the video). */
const NO_CHILDREN = new Set([
  "VIDEO",
  "AUDIO",
  "IMG",
  "IFRAME",
  "CANVAS",
  "EMBED",
  "OBJECT",
]);

/**
 * Where the parts over the page go in fullscreen, where only the fullscreen element is
 * drawn: straight inside it (deeper, an ancestor with a transform would move what is
 * fixed), or in its parent when it cannot hold children. Null outside fullscreen, or when
 * the whole page is in fullscreen.
 */
function fullscreenHost(): Element | null {
  const element = fullscreenElement();
  if (!element || element.contains(document.body)) return null;
  return NO_CHILDREN.has(element.tagName) ? element.parentElement : element;
}

/** The transcript sidebar beside a player that fills the window (mock FullWindow): 360px wide, 16px in. */
const SIDEBAR: Column = {
  width: 360,
  top: 16,
  bottom: 16,
  side: 16,
  room: 392,
};

/** The sidebar host's style for `column` (the desktop's, or a phone's) at `side`. */
const sidebarStyle = (column: Column, side: "left" | "right") =>
  `position: fixed; z-index: ${SIDEBAR_LAYER}; top: ${column.top}px;` +
  ` ${side}: ${column.side}px; bottom: ${column.bottom}px;` +
  ` width: ${column.width}px; overflow: hidden;`;
/** Above the site's player, below Langle's menu, hover card and dictionary window. */
const SIDEBAR_LAYER = 2147483600;

/** `element` stays where it is while the page scrolls: it or an ancestor is fixed or sticky. */
function staysInWindow(element: Element): boolean {
  for (let at: Element | null = element; at; at = at.parentElement) {
    const { position } = getComputedStyle(at);
    if (position === "fixed" || position === "sticky") return true;
  }
  return false;
}

/** The most a part is moved back into the same parent in one second. */
const MAX_MOVES_PER_SECOND = 10;

/**
 * Mounts the video UI on the site's page, each part in its own shadow root: the
 * subtitle inside the player, the subtitle box under it, the transcript in the side
 * column, the L and ^ buttons in the player bar, and the menu, the hover card and the
 * dictionary window over the page (inside the fullscreen element while there is one).
 * Where the player fills the window or the screen (Netflix; YouTube in fullscreen), the
 * transcript goes in a sidebar at the right instead, and the player is narrowed for it.
 * The site re-renders its page (YouTube is a single-page app): a MutationObserver puts
 * the parts back. Returns an unmount.
 */
export function mountVideoUi({
  adapter,
  app,
  touchMode = NEVER_TOUCH,
}: MountOptions): () => void {
  const layout = createStore<VideoLayout>({
    frameHeight: 0,
    subtitleBottom: SUBTITLE_BOTTOM,
    vertical: adapter.vertical?.() ?? false,
    sidebar: false,
    sidebarSide: "right",
    fillsWindow: false,
    touch: touchMode.on(),
    pinned: null,
    pinnedBottom: null,
    bandBottom: null,
    siteControls: [],
    controlsLift: 0,
    safeArea: NO_INSETS,
  });
  const safeArea = safeAreaReader();
  const sidebar = document.createElement("langle-video-sidebar");
  let sidebarStyled = sidebarStyle(SIDEBAR, "right");
  sidebar.style.cssText = sidebarStyled;
  const parts: Part[] = [];
  const roots: ShadowRoot[] = [];

  function part(
    name: string,
    style: string,
    point: Part["point"],
    ui: JSX.Element,
  ): HTMLElement {
    const { host, root } = createShadowHost(name, style);
    render(
      <UiRoot>
        <VideoThemed app={app}>{ui}</VideoThemed>
      </UiRoot>,
      root,
    );
    roots.push(root);
    parts.push({ host, point, moves: { second: 0, count: 0, parent: null } });
    return host;
  }

  /** The hosts the geometry measures, once made. */
  const made: {
    buttons?: HTMLElement;
    transcript?: HTMLElement;
    below?: HTMLElement;
  } = {};
  const geometry: VideoGeometry = {
    player: () => boxOf(adapter.playerElement()),
    buttons: () => boxOf(made.buttons?.isConnected ? made.buttons : null),
    transcript: () => {
      const box = boxOf(made.transcript?.isConnected ? made.transcript : null);
      return box && box.bottom > box.top ? box : null;
    },
    beside: () => boxOf(adapter.besidePlayer?.() ?? null),
    subtitle: () => {
      const box = boxOf(made.below?.isConnected ? made.below : null);
      // Pinned: where the box shows, not where its room has scrolled to.
      const { pinned, pinnedBottom } = layout.get();
      if (box && pinned && pinnedBottom !== null)
        return { ...box, top: pinned.top, bottom: pinnedBottom };
      return box && box.bottom > box.top ? box : null;
    },
  };

  part(
    "langle-video-player",
    "position: absolute; inset: 0; pointer-events: none; z-index: 60;",
    (player) => (player ? { parent: player, before: null } : null),
    <InPlayerUi app={app} layout={layout} />,
  );
  const belowHost = part(
    "langle-video-below",
    "display: block;",
    () => {
      const below = adapter.belowVideoElement();
      return below ? { parent: below, before: below.firstElementChild } : null;
    },
    <BelowVideoUi
      app={app}
      layout={layout}
      onPinnedHeight={(height) => {
        pinnedHeight = height;
        belowHost.style.height = height === null ? "" : `${height}px`;
        tellPinnedBottom();
      }}
    />,
  );
  made.below = belowHost;
  made.transcript = part(
    "langle-transcript",
    // Clickable inside a frame that lets clicks through to the video (Netflix).
    "display: block; margin-bottom: 12px; pointer-events: auto;",
    (player) => {
      const side = adapter.sideColumn();
      const below = adapter.belowVideoElement();
      const place = transcriptPlace({
        sidebar: layout.get().sidebar,
        sideColumn: side !== null,
        vertical: layout.get().vertical,
        belowInPage: below !== null && !(player?.contains(below) ?? false),
      });
      if (place === "sidebar") return { parent: sidebar, before: null };
      if (place === "sideColumn") return side;
      if (place !== "belowVideo" || !below) return null;
      // After the subtitle box, which opens the area under the player.
      return {
        parent: below,
        before:
          belowHost.parentElement === below
            ? belowHost.nextElementSibling
            : below.firstElementChild,
      };
    },
    <TranscriptUi app={app} layout={layout} />,
  );
  made.buttons = part(
    "langle-player-buttons",
    "display: inline-flex; align-items: center; height: 100%; vertical-align: top;" +
      (adapter.controlsStyle ?? ""),
    () => adapter.controlsPoint(),
    <PlayerBarUi app={app} />,
  );
  part(
    "langle-video",
    "display: contents;",
    () => {
      const parent = fullscreenHost() ?? document.body;
      return parent ? { parent, before: null } : null;
    },
    // The menu first: the dictionary window and the hover card stack above it.
    <>
      <MenuUi app={app} geometry={geometry} layout={layout} />
      <PageUi app={app} geometry={geometry} layout={layout} />
    </>,
  );

  const resize = new ResizeObserver(([entry]) => {
    if (entry) layout.set({ frameHeight: entry.contentRect.height });
  });
  let observed: Element | null = null;

  /**
   * Keeps the in-video subtitle clear of the site's control bar while it shows. While
   * Langle is in use the subtitle stays where it is: Netflix takes its bar away a few
   * seconds after the pointer stops on a word, and moving the word from under it would
   * close the hover card (and play the video again).
   */
  function liftSubtitle(playerElement: HTMLElement | null) {
    if (inUse(app.store.get())) return;
    const player = boxOf(playerElement);
    // Netflix's bar; on a phone, the controls along the player's bottom.
    const barTop =
      adapter.controlBarTop?.() ??
      (player ? controlsTopIn(layout.get().siteControls, player) : null);
    const subtitleBottom =
      barTop === null || !player
        ? SUBTITLE_BOTTOM
        : Math.max(
            SUBTITLE_BOTTOM,
            Math.ceil(player.bottom - barTop + CONTROL_BAR_GAP),
          );
    if (subtitleBottom !== layout.get().subtitleBottom)
      layout.set({ subtitleBottom });
  }

  /**
   * While Langle's subtitle is over the video, the site's control bar shows only after a
   * longer move (it lifts the subtitle), and never while Langle is in use.
   */
  function holdBackControlBar() {
    const state = app.store.get();
    adapter.holdBackControlBar?.(
      !subtitleOverVideo(state, layout.get().vertical, layout.get().touch)
        ? "free"
        : inUse(state)
          ? "hidden"
          : "delay",
    );
  }

  /**
   * The sidebar shows while the transcript does beside a player that fills the window:
   * the player is narrowed for it, and given its width back otherwise. In touch mode
   * it is the phone's column, at the side `phoneFullscreenTranscript` picks ("off":
   * none); the desktop's sidebar never shows there.
   */
  function arrangeSidebar() {
    const { enabled, status, settings } = app.store.get();
    const { touch, vertical } = layout.get();
    const fillsWindow = !vertical && (adapter.fillsWindow?.() ?? false);
    const side =
      touch && settings.phoneFullscreenTranscript === "left" ? "left" : "right";
    const on =
      enabled &&
      status === "ready" &&
      fillsWindow &&
      (touch
        ? settings.phoneFullscreenTranscript !== "off"
        : settings.transcriptShown);
    const column = touch ? phoneColumn(layout.get().safeArea, side) : SIDEBAR;
    adapter.narrowPlayer?.(on ? column.room : 0, side);
    if (on) {
      const style = sidebarStyle(column, side);
      if (style !== sidebarStyled)
        sidebar.style.cssText = sidebarStyled = style;
      const parent = fullscreenHost() ?? document.body;
      if (sidebar.parentElement !== parent) parent.append(sidebar);
    } else sidebar.remove();
    const now = layout.get();
    if (
      on !== now.sidebar ||
      side !== now.sidebarSide ||
      fillsWindow !== now.fillsWindow
    )
      layout.set({ sidebar: on, sidebarSide: side, fillsWindow });
  }

  /** The pinned subtitle box's height, null while it is not pinned or not shown. */
  let pinnedHeight: number | null = null;
  const belowResize = new ResizeObserver(() => schedule());
  belowResize.observe(belowHost);

  function tellPinnedBottom() {
    const { pinned } = layout.get();
    const pinnedBottom =
      pinned === null ? null : pinned.top + (pinnedHeight ?? 0);
    if (pinnedBottom !== layout.get().pinnedBottom)
      layout.set({ pinnedBottom });
    tellBandBottom();
  }

  /** Where a phone's dictionary sheet opens under: the band's bottom, else the player's. */
  function tellBandBottom() {
    const band = geometry.subtitle() ?? geometry.player();
    const bandBottom = band ? Math.round(band.bottom) : null;
    if (bandBottom !== layout.get().bandBottom) layout.set({ bandBottom });
  }

  /** The window's box, where the site's controls are looked for. */
  const windowBox = () => ({
    left: 0,
    top: 0,
    right: innerWidth,
    bottom: innerHeight,
  });

  /** The roots `siteControls` watches for the controls showing or hiding. */
  let watched: readonly Element[] = [];
  let controlsWatch: MutationObserver | undefined;

  /**
   * Touch mode: the site's controls shown now over the video (`siteControls`), measured
   * again when they show or hide (a class or style change in their roots, the end of
   * their fade), and how far they lift the subtitle in fullscreen.
   */
  function measureControls(touch: boolean) {
    const roots = touch ? (adapter.siteControls?.() ?? []) : [];
    if (
      roots.length !== watched.length ||
      roots.some((root, i) => root !== watched[i])
    ) {
      controlsWatch ??= new MutationObserver(checkControls);
      controlsWatch.disconnect();
      for (const root of roots)
        controlsWatch.observe(root, {
          attributes: true,
          subtree: true,
          attributeFilter: ["class", "style", "hidden", "aria-hidden"],
        });
      watched = roots;
    }
    const screen = windowBox();
    const siteControls = roots.length ? shownControls(roots, screen) : [];
    if (!sameBoxes(siteControls, layout.get().siteControls))
      layout.set({ siteControls });
    // In use, the words stay where the finger is.
    if (inUse(app.store.get())) return;
    const top = controlsTopIn(siteControls, screen);
    const controlsLift =
      top === null ? 0 : Math.ceil(innerHeight - top + CONTROL_BAR_GAP);
    if (controlsLift !== layout.get().controlsLift)
      layout.set({ controlsLift });
  }

  /** Touch mode: the screen's safe area, read again as the phone turns. */
  function measureSafeArea(touch: boolean) {
    const insets = touch ? safeArea.read() : NO_INSETS;
    if (!sameInsets(insets, layout.get().safeArea))
      layout.set({ safeArea: insets });
  }

  /**
   * In touch mode, under a player that stays at the window's top while the page
   * scrolls (it or an ancestor is fixed or sticky: m.youtube.com's portrait page), the
   * subtitle box is pinned under the player (`BelowVideoUi`), so the line stays in view
   * over the page; its host keeps its room in the page.
   */
  function pinBelow(player: HTMLElement | null) {
    const box =
      layout.get().touch &&
      belowHost.isConnected &&
      player &&
      !player.contains(belowHost) &&
      staysInWindow(player)
        ? boxOf(player)
        : null;
    const room = box && boxOf(belowHost);
    const pinned =
      box && room
        ? {
            top: Math.round(box.bottom),
            left: Math.round(room.left),
            width: Math.round(room.right - room.left),
          }
        : null;
    const now = layout.get().pinned;
    if (
      pinned?.top !== now?.top ||
      pinned?.left !== now?.left ||
      pinned?.width !== now?.width
    )
      layout.set({ pinned });
    tellPinnedBottom();
  }

  /** Puts every part where it belongs (only those that moved: no mutation otherwise). */
  function place() {
    const vertical = adapter.vertical?.() ?? false;
    if (vertical !== layout.get().vertical) layout.set({ vertical });
    const touch = touchMode.on();
    if (touch !== layout.get().touch) layout.set({ touch });
    measureSafeArea(touch);
    arrangeSidebar();
    // Not before: narrowing the player tells the site, which may render it again.
    const player = adapter.playerElement();
    const second = Math.floor(performance.now() / 1000);
    for (const { host, point, moves } of parts) {
      const at = point(player);
      if (!at) continue;
      // At the end (before: null), anywhere in the parent will do.
      const placed =
        host.parentElement === at.parent &&
        (at.before === null ||
          at.before === host ||
          at.before === host.nextElementSibling);
      if (placed) continue;
      if (moves.second !== second || moves.parent !== at.parent)
        Object.assign(moves, { second, count: 0, parent: at.parent });
      if (++moves.count > MAX_MOVES_PER_SECOND) continue;
      at.parent.insertBefore(host, at.before);
    }
    holdBackControlBar();
    measureControls(touch);
    liftSubtitle(player);
    pinBelow(player);
    tellBandBottom();
    const frame = layout.get().sidebar ? sidebar : player;
    if (frame !== observed) {
      if (observed) resize.unobserve(observed);
      if (frame) resize.observe(frame);
      observed = frame;
    }
  }

  let frame: number | undefined;
  const schedule = () => {
    frame ??= requestAnimationFrame(() => {
      frame = undefined;
      place();
    });
  };
  // A control's style changes often (the progress bar as it plays): once a frame, only the
  // controls are measured, and the parts placed again only when the ones shown changed.
  let controlsFrame: number | undefined;
  function checkControls() {
    controlsFrame ??= requestAnimationFrame(() => {
      controlsFrame = undefined;
      if (
        !sameBoxes(
          shownControls(watched, windowBox()),
          layout.get().siteControls,
        )
      )
        schedule();
    });
  }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  place();

  const onFullscreen = () => {
    app.setFullscreen(fullscreenElement() !== null);
    schedule();
  };
  document.addEventListener("fullscreenchange", onFullscreen);
  // The phone turning (the safe area, the column); the site's controls done fading.
  addEventListener("resize", schedule);
  const onFade = () => {
    if (watched.length) checkControls();
  };
  document.addEventListener("transitionend", onFade, true);
  document.addEventListener("animationend", onFade, true);
  // Langle on or off, the video's subtitles, the menu's switch and the column's ×.
  const offStore = app.store.subscribe(schedule);
  const offTouch = touchMode.watch(schedule);

  return () => {
    offStore();
    offTouch();
    observer.disconnect();
    resize.disconnect();
    belowResize.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
    if (controlsFrame !== undefined) cancelAnimationFrame(controlsFrame);
    document.removeEventListener("fullscreenchange", onFullscreen);
    removeEventListener("resize", schedule);
    document.removeEventListener("transitionend", onFade, true);
    document.removeEventListener("animationend", onFade, true);
    controlsWatch?.disconnect();
    safeArea.remove();
    for (const root of roots) render(null, root);
    for (const { host } of parts) host.remove();
    sidebar.remove();
    adapter.narrowPlayer?.(0);
  };
}
