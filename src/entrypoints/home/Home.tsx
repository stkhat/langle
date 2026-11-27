import { Fragment, type CSSProperties } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { DataNote } from "../../core/packs/state";
import type { Settings } from "../../core/settings";
import type { SetupStage } from "../../core/setup";
import { onHost } from "../../core/url";
import { languageName, languagePair } from "../../i18n/languages";
import { t } from "../../i18n/t";
import {
  followPackStatus,
  pairNote,
  type PackStatusDeps,
} from "../../messaging/pack-status";
import type { CloudProviderId } from "../../core/cloud/provider";
import type {
  CloudStatus,
  Counts,
  RecentPage,
  SyncStatus,
} from "../../messaging/protocol";
import { CloudErrorRow } from "../../ui/CloudErrorRow";
import {
  cloudErrorLine,
  cloudView,
  type CloudView,
} from "../../ui/format/cloud";
import { fmt, formatTime, relativeTime } from "../../ui/format/format";
import { syncSavedLine } from "../../ui/format/sync";
import { LangleMark } from "../../ui/LangleMark";
import { LanguageDataNote } from "../../ui/packs/LanguageDataNote";
import { color, FONT, SERIF_FONT, underline } from "../../ui/styles";
import { pageForSearch } from "./address";

type Style = CSSProperties;

/** What Home works with; `main.tsx` passes the app's, tests pass fakes. */
export interface HomeDeps extends PackStatusDeps {
  /** Opens a web page over Home (`appHost.openPage`). */
  openPage(url: string): void;
  /** Opens the first run, before this device is set up. */
  openSetup(): void;
  /**
   * `BrowserEnv.features.appGoogleAuth`: the app can sign in to Google, so the saved line
   * can be Google Drive's.
   */
  googleAuth: boolean;
  now(): number;
  /** How often the counts, the saved line and the recent pages are asked again. */
  refreshMs: number;
}

/** The rows Continue shows at most. */
const CONTINUE_ROWS = 10;
/** The tiles Sites shows at most, YouTube's included. */
const SITE_TILES = 4;
const YOUTUBE_HOME = "https://m.youtube.com/";

/**
 * The phone app's Home (mock `MobileStart`, docs/specs/mobile-app.md "Home"): Langle and
 * the pair, the search field, the counts and the saved line, the recent pages
 * (Continue) and the sites. Before this device is set up, only the way to the first run.
 */
export function Home(props: { deps: HomeDeps; stage: SetupStage }) {
  return (
    <main style={MAIN}>
      {props.stage === "ready" ? (
        <Ready deps={props.deps} />
      ) : (
        <Pending stage={props.stage} openSetup={props.deps.openSetup} />
      )}
    </main>
  );
}

function Header(props: { pair?: string; gray?: boolean }) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        minHeight: "48px",
      }}
    >
      <LangleMark size={34} gray={props.gray} />
      <h1
        style={{
          margin: 0,
          flex: 1,
          fontSize: "28px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        {t("app.name")}
      </h1>
      {props.pair && (
        <span style={{ fontSize: "13px", color: color.muted }}>
          {props.pair}
        </span>
      )}
    </header>
  );
}

function Pending(props: {
  stage: Exclude<SetupStage, "ready">;
  openSetup(): void;
}) {
  const consent = props.stage === "consent";
  return (
    <>
      <Header gray />
      <section
        aria-label={t("app.name")}
        style={{
          ...CARD,
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          padding: "16px",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "16px", fontWeight: 600 }}>
            {t("popup.setup.title")}
          </span>
          <span
            style={{ fontSize: "14px", lineHeight: 1.45, color: color.muted }}
          >
            {t(consent ? "popup.setup.consent" : "popup.setup.languages")}
          </span>
        </span>
        <button type="button" onClick={props.openSetup} style={PRIMARY}>
          {t(consent ? "popup.setup.review" : "popup.setup.choose")}
        </button>
      </section>
    </>
  );
}

const warn = (error: unknown) => console.warn("Langle:", error);

function Ready({ deps }: { deps: HomeDeps }) {
  const [settings, setSettings] = useState<Settings>();
  const [counts, setCounts] = useState<Counts>();
  const [sync, setSync] = useState<SyncStatus>();
  const [cloud, setCloud] = useState<CloudStatus>();
  const [recents, setRecents] = useState<RecentPage[]>([]);
  const [data, setData] = useState<DataNote | null>(null);
  const [now, setNow] = useState(deps.now);

  /** A Reconnect is running: the button reads "Connecting…" until the line follows. */
  const [connecting, setConnecting] = useState(false);

  function refreshCloud() {
    return deps.googleAuth
      ? deps.send({ type: "cloudStatus" }).then(setCloud, warn)
      : Promise.resolve();
  }

  /** Google's sheet opens; the line follows once it is answered. */
  function reconnect(provider: CloudProviderId) {
    setConnecting(true);
    void deps
      .send({ type: "cloudConnect", provider })
      .catch(warn)
      .then(refreshCloud)
      .finally(() => setConnecting(false));
  }

  useEffect(() => {
    let lang: string | undefined;
    const refresh = () => {
      setNow(deps.now());
      deps.send({ type: "syncStatus" }).then(setSync, warn);
      void refreshCloud();
      deps
        .send({ type: "recentsList", limit: RECENTS_ASKED })
        .then(setRecents, warn);
      if (lang) deps.send({ type: "counts", lang }).then(setCounts, warn);
    };
    const stored = (next: Settings) => {
      lang = next.learningLang;
      setSettings(next);
      refresh();
    };
    // The other devices' changes are read now, not at the next 5-minute check.
    deps.send({ type: "cloudCheck" }).catch(warn);
    deps.send({ type: "getSettings" }).then(stored, warn);
    refresh();
    const unwatch = deps.watchSettings(stored);
    const packs = followPackStatus(deps, (status) => setData(pairNote(status)));
    const timer = setInterval(refresh, deps.refreshMs);
    // Home shows again when a page over it closes: what was read there is new.
    const onShow = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      unwatch();
      packs.stop();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

  const open = (url: string) => (event: MouseEvent) => {
    event.preventDefault();
    deps.openPage(url);
  };

  return (
    <>
      <Header
        pair={
          settings && languagePair(settings.learningLang, settings.nativeLang)
        }
      />
      {settings && data && (
        <LanguageDataNote
          note={data}
          language={languageName(settings.learningLang)}
          onRetry={() => {
            deps.send({ type: "retryPacks" }).catch(() => undefined);
          }}
          style={{
            ...CARD,
            marginTop: "-8px",
            padding: "12px 14px",
            fontSize: "14px",
          }}
        />
      )}
      <Search openPage={deps.openPage} />
      <section
        aria-label={t("home.words")}
        style={{ display: "flex", flexDirection: "column", gap: "10px" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "8px",
          }}
        >
          <CountTile
            value={counts?.learning}
            label={t("status.learning")}
            swatch={{
              background: color.hlLearning,
              boxShadow: underline(color.hlLearningLine),
            }}
          />
          <CountTile
            value={counts?.known}
            label={t("status.known")}
            swatch={{
              background: color.surfaceGray,
              boxShadow: underline(color.knownLine),
            }}
          />
          <CountTile value={counts?.phrases} label={t("kind.phrases")} />
        </div>
        <SavedLines
          sync={sync}
          cloud={cloudView(cloud, settings, { googleAuth: deps.googleAuth })}
          now={now}
          connecting={connecting}
          onReconnect={reconnect}
        />
      </section>
      {recents.length > 0 && (
        <Continue
          pages={recents.slice(0, CONTINUE_ROWS)}
          now={now}
          open={open}
        />
      )}
      <Sites sites={sitesOf(recents)} open={open} />
    </>
  );
}

/** All the store keeps: Sites counts the sites of every one. */
const RECENTS_ASKED = 50;

function Search(props: { openPage(url: string): void }) {
  const [text, setText] = useState("");
  return (
    <form
      role="search"
      style={{ margin: "-8px 0 0" }}
      onSubmit={(event) => {
        event.preventDefault();
        const url = pageForSearch(text);
        if (!url) return;
        props.openPage(url);
        // Home shows again with an empty field when the page is left.
        setText("");
      }}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          height: "48px",
          padding: "0 16px",
          boxSizing: "border-box",
          border: `1px solid ${color.lineStrong}`,
          borderRadius: "24px",
          background: color.card,
          color: color.muted,
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
          style={{ flex: "none" }}
        >
          <circle cx="11" cy="11" r="6"></circle>
          <path d="M20 20l-4.5-4.5"></path>
        </svg>
        <input
          type="text"
          aria-label={t("home.search")}
          placeholder={t("home.search")}
          enterKeyHint="go"
          autoCapitalize="off"
          autoCorrect="off"
          spellcheck={false}
          value={text}
          onInput={(event) => setText(event.currentTarget.value)}
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            padding: 0,
            background: "none",
            color: color.ink,
            font: "inherit",
            fontSize: "16px",
            outline: "none",
          }}
        />
      </label>
    </form>
  );
}

function CountTile(props: {
  value: number | undefined;
  label: string;
  swatch?: Style;
}) {
  return (
    <div
      style={{
        ...CARD,
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        padding: "12px",
      }}
    >
      <span style={{ fontSize: "22px", fontWeight: 700 }}>
        {props.value === undefined ? " " : fmt(props.value)}
      </span>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12px",
          color: color.muted,
        }}
      >
        {props.swatch && (
          <span
            aria-hidden="true"
            style={{
              width: "10px",
              height: "8px",
              borderRadius: "2px",
              ...props.swatch,
            }}
          ></span>
        )}
        {props.label}
      </span>
    </div>
  );
}

/**
 * "Saved to Google Drive · 2 minutes ago" while the phone saves to the user's cloud
 * storage (or what stopped it, with Reconnect when that helps); otherwise "Saved on this
 * phone · 2 minutes ago", or "Not saved yet".
 */
function SavedLines(props: {
  sync: SyncStatus | undefined;
  cloud: CloudView | undefined;
  now: number;
  connecting: boolean;
  onReconnect(provider: CloudProviderId): void;
}) {
  const { cloud, now } = props;
  if (cloud?.kind === "connected") {
    const { status } = cloud;
    if (cloudErrorLine(status, cloud.name))
      return (
        <CloudErrorRow
          view={cloud}
          now={now}
          thisPhone
          connecting={props.connecting}
          onReconnect={() => props.onReconnect(cloud.provider)}
        />
      );
    return status.lastSavedAt === undefined ? (
      <SavedLine line={t("sync.notSaved")} saved={false} />
    ) : (
      <SavedLine
        line={t("cloud.saved", {
          provider: cloud.name,
          when: relativeTime(status.lastSavedAt, now),
        })}
        saved
      />
    );
  }
  const { sync } = props;
  if (!sync) return null;
  return (
    <SavedLine
      line={syncSavedLine(sync, (at) =>
        t("popup.sync.savedDevice", { when: relativeTime(at, now) }),
      )}
      saved={sync.enabled && sync.lastSavedAt !== undefined}
    />
  );
}

/** The saved line, with the check once something was saved. */
function SavedLine({ line, saved }: { line: string; saved: boolean }) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "13px",
        color: color.ink3,
      }}
    >
      {saved && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={color.green}
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          style={{ flex: "none" }}
        >
          <path d="M5 12l5 5 9-10"></path>
        </svg>
      )}
      {line}
    </span>
  );
}

type Open = (url: string) => (event: MouseEvent) => void;

function Continue(props: { pages: RecentPage[]; now: number; open: Open }) {
  return (
    <section aria-labelledby="home-continue" style={SECTION}>
      <h2 id="home-continue" style={HEADING}>
        {t("home.continue")}
      </h2>
      <div
        style={{
          ...CARD,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {props.pages.map((page, i) => (
          <Fragment key={page.key}>
            {i > 0 && (
              <div
                style={{
                  height: "1px",
                  background: color.line,
                  marginInlineStart: "120px",
                }}
              ></div>
            )}
            <a
              href={page.url}
              onClick={props.open(page.url)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                minHeight: "76px",
                padding: "10px 12px",
                boxSizing: "border-box",
                color: color.ink,
                textDecoration: "none",
              }}
            >
              <Thumbnail page={page} />
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "3px",
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    lineHeight: 1.3,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {page.title}
                </span>
                <span style={{ fontSize: "12px", color: color.muted }}>
                  {metaLine(page, props.now)}
                </span>
              </span>
            </a>
          </Fragment>
        ))}
      </div>
    </section>
  );
}

const THUMB: Style = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "96px",
  height: "54px",
  borderRadius: "8px",
  flex: "none",
  overflow: "hidden",
};

/** A video's picture with how far it was watched; a page's document icon. */
function Thumbnail({ page }: { page: RecentPage }) {
  if (page.kind === "page")
    return (
      <span
        aria-hidden="true"
        style={{ ...THUMB, background: color.surfaceGray, color: color.muted }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M6 3h9l4 4v14H6z"></path>
          <path d="M9 11h7M9 15h7M9 7h3"></path>
        </svg>
      </span>
    );
  const picture = videoPicture(page.key);
  const share = watchedShare(page);
  return (
    <span aria-hidden="true" style={{ ...THUMB, background: "#0B0C10" }}>
      {picture && (
        <img
          src={picture}
          alt=""
          loading="lazy"
          // Offline the picture fails: the dark box stays, with no broken-image sign.
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      {share > 0 && (
        <span
          style={{
            position: "absolute",
            insetInlineStart: 0,
            bottom: 0,
            width: `${share}%`,
            height: "3px",
            background: color.greenBright,
          }}
        ></span>
      )}
    </span>
  );
}

/** A YouTube video's picture (`mqdefault`, 16:9), from its normalized watch URL. */
export function videoPicture(key: string): string | undefined {
  const url = new URL(key);
  const id =
    onHost(url.hostname, "youtube.com") && url.pathname === "/watch"
      ? url.searchParams.get("v")
      : null;
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : undefined;
}

/** How far the video was watched, 0–100. */
function watchedShare(page: RecentPage): number {
  if (page.position === undefined || !page.duration) return 0;
  return Math.min(100, (page.position / page.duration) * 100);
}

/** "Home Bakery Club · 4:12 of 9:30" for a video; "The Weekend Table · Yesterday" for a page. */
export function metaLine(page: RecentPage, now: number): string {
  if (page.kind === "page")
    return `${page.site} · ${capitalized(relativeTime(page.openedAt, now))}`;
  const parts = [page.channel ?? page.site];
  if (page.position !== undefined && page.duration)
    parts.push(
      t("home.progress", {
        position: formatTime(page.position * 1000),
        duration: formatTime(page.duration * 1000),
      }),
    );
  return parts.join(" · ");
}

const capitalized = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

export interface SiteTile {
  name: string;
  url: string;
  /** The letter of its icon; none for YouTube, which has its play icon. */
  letter?: string;
}

/**
 * YouTube, then the sites of the recent pages (not videos), the most opened first,
 * four tiles in all. A site is a host without `www.` or `m.`, named as its newest
 * page names it; its letter is the host's first.
 */
export function sitesOf(pages: RecentPage[]): SiteTile[] {
  const sites = new Map<string, { tile: SiteTile; opens: number }>();
  for (const page of pages) {
    if (page.kind !== "page") continue;
    const url = new URL(page.url);
    const host = url.hostname.replace(/^(www|m)\./, "");
    const known = sites.get(host);
    if (known) known.opens += page.opens;
    else
      sites.set(host, {
        // Pages come newest first: the first one names the site.
        tile: {
          name: page.site,
          url: `${url.protocol}//${url.host}/`,
          letter: host.charAt(0).toUpperCase(),
        },
        opens: page.opens,
      });
  }
  return [
    { name: t("platform.youtube"), url: YOUTUBE_HOME },
    ...[...sites.values()]
      .sort((a, b) => b.opens - a.opens)
      .slice(0, SITE_TILES - 1)
      .map(({ tile }) => tile),
  ];
}

function Sites(props: { sites: SiteTile[]; open: Open }) {
  return (
    <section aria-labelledby="home-sites" style={SECTION}>
      <h2 id="home-sites" style={HEADING}>
        {t("home.sites")}
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "10px",
        }}
      >
        {props.sites.map((site) => (
          <a
            key={site.url}
            href={site.url}
            onClick={props.open(site.url)}
            style={{
              ...CARD,
              display: "flex",
              alignItems: "center",
              gap: "10px",
              height: "60px",
              padding: "0 12px",
              boxSizing: "border-box",
              minWidth: 0,
              color: color.ink,
              textDecoration: "none",
              fontSize: "15px",
              fontWeight: 600,
            }}
          >
            <span aria-hidden="true" style={SITE_ICON}>
              {site.letter ?? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill={color.ink}
                >
                  <path d="M9 7.5v9l7.5-4.5z"></path>
                </svg>
              )}
            </span>
            <span
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {site.name}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

const MAIN: Style = {
  display: "flex",
  flexDirection: "column",
  gap: "22px",
  minHeight: "100vh",
  boxSizing: "border-box",
  padding:
    "calc(8px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))",
  background: color.surface,
  color: color.ink,
  fontFamily: FONT,
  fontSize: "15px",
};

const CARD: Style = {
  borderRadius: "12px",
  background: color.card,
  border: `1px solid ${color.line}`,
};

const SECTION: Style = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const HEADING: Style = { margin: 0, fontSize: "17px", fontWeight: 700 };

const PRIMARY: Style = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "48px",
  border: 0,
  borderRadius: "12px",
  background: color.greenText,
  color: color.white,
  font: "inherit",
  fontSize: "16px",
  fontWeight: 600,
  cursor: "pointer",
};

const SITE_ICON: Style = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "36px",
  height: "36px",
  borderRadius: "10px",
  background: color.surfaceGray,
  flex: "none",
  fontFamily: SERIF_FONT,
  fontSize: "17px",
  fontWeight: 600,
};
