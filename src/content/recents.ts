import { appHostOf } from "../core/app-host";
import type { send } from "../messaging/client";
import type { PlatformAdapter } from "./video/platform";

/**
 * What content scripts tell the phone app's recent pages (Home's Continue and Sites,
 * docs/specs/mobile-app.md "Home"): a visit when a page loads and, on a video, where it
 * is. Only where `appHost` exists; elsewhere nothing is sent.
 */
export interface RecentsDeps {
  send: typeof send;
  /** The global `appHost` is looked for on (tests pass their own). */
  g?: object;
  doc?: Document;
  win?: Window;
}

/** How often a playing video's position is sent. */
const PROGRESS_INTERVAL_MS = 10_000;

/** The page's site as people name it: `og:site_name`, else the host without `www.` or `m.`. */
export function siteName(
  doc: Document = document,
  href: string = doc.location.href,
): string {
  const named = doc
    .querySelector<HTMLMetaElement>('meta[property="og:site_name"]')
    ?.content.trim();
  return named || new URL(href).hostname.replace(/^(www|m)\./, "");
}

/** Sends the visit of an article page (the article script, on load). */
export function reportPageVisit({
  send,
  g = globalThis,
  doc = document,
}: RecentsDeps): void {
  if (!appHostOf(g)) return;
  const site = siteName(doc);
  void send({
    type: "recentsVisit",
    page: {
      url: doc.location.href,
      title: doc.title.trim() || site,
      site,
      kind: "page",
    },
  }).catch(() => undefined);
}

/**
 * Follows a video site's videos: a visit for each video shown, and its position every
 * 10 s while it plays, when it pauses and when the page goes away. Returns the stop.
 */
export function followVideoRecents(
  adapter: PlatformAdapter,
  {
    send,
    g = globalThis,
    doc = document,
    win = window,
    intervalMs = PROGRESS_INTERVAL_MS,
  }: RecentsDeps & { intervalMs?: number },
): () => void {
  if (!appHostOf(g)) return () => undefined;
  let shown: string | undefined;
  const quiet = (sent: Promise<unknown>) => void sent.catch(() => undefined);

  /** The site's own title and channel for the video shown, when it has them. */
  const details = async (id: string) => {
    const found = await adapter.details?.().catch(() => undefined);
    return found?.id === id ? found : undefined;
  };

  const visit = async () => {
    const id = adapter.videoId();
    if (!id || id === shown) return;
    shown = id;
    const known = await details(id);
    if (adapter.videoId() !== id) return;
    quiet(
      send({
        type: "recentsVisit",
        page: {
          url: adapter.url(),
          title: known?.title || adapter.title() || siteName(doc),
          site: siteName(doc),
          kind: "video",
        },
      }),
    );
  };

  const progress = async () => {
    const id = adapter.videoId();
    const video = adapter.video();
    if (!id || id !== shown || !video || adapter.adShowing()) return;
    const { currentTime: position, duration } = video;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const known = await details(id);
    const title = known?.title || adapter.title();
    quiet(
      send({
        type: "recentsProgress",
        progress: {
          url: adapter.url(),
          position,
          duration,
          ...(title && { title }),
          ...(known?.channel && { channel: known.channel }),
        },
      }),
    );
  };

  const tick = () => {
    void visit();
    const video = adapter.video();
    if (video && !video.paused) void progress();
  };
  const onPause = (event: Event) => {
    if (event.target === adapter.video()) void progress();
  };
  const onLeave = () => void progress();

  void visit();
  const offNavigate = adapter.onNavigate(() => void visit());
  const timer = win.setInterval(tick, intervalMs);
  // Captured: `pause` does not bubble.
  doc.addEventListener("pause", onPause, true);
  win.addEventListener("pagehide", onLeave);
  return () => {
    offNavigate();
    win.clearInterval(timer);
    doc.removeEventListener("pause", onPause, true);
    win.removeEventListener("pagehide", onLeave);
  };
}
