import { useEffect, useRef, useState } from "preact/hooks";
import type { TouchMode } from "../../content/touch/touch-mode";
import type { SyncPlace } from "../../core/browser-env";
import type { CloudProviderId } from "../../core/cloud/provider";
import type { CloudStatus, Counts, SyncStatus } from "../../messaging/protocol";
import { onHost } from "../../core/url";
import type { DataNote } from "../../core/packs/state";
import type { SupportLinks } from "../../core/links";
import type { Settings } from "../../core/settings";
import { createSettingsView } from "../../core/settings-view";
import { languageName, languagePair } from "../../i18n/languages";
import { t } from "../../i18n/t";
import {
  followPackStatus,
  pairNote,
  type PackStatusDeps,
} from "../../messaging/pack-status";
import type { PageRequest, PageSummary } from "../../messaging/page-protocol";
import { BrandHeader } from "../../ui/BrandHeader";
import {
  appCloud,
  cloudErrorLine,
  cloudSizeLine,
  cloudView,
  type CloudView,
} from "../../ui/format/cloud";
import { CloudErrorRow } from "../../ui/CloudErrorRow";
import { fmt, relativeTime } from "../../ui/format/format";
import {
  browserSyncName,
  syncSavedLine,
  syncSpace,
} from "../../ui/format/sync";
import { CheckIcon, GearIcon, WordListIcon } from "../../ui/icons";
import { HighlightChips } from "../../ui/lookup/HighlightChips";
import { Meter } from "../../ui/Meter";
import {
  LanguageDataNote,
  NOTE,
  NOTE_BUTTON,
} from "../../ui/packs/LanguageDataNote";
import { color, FONT } from "../../ui/styles";
import { usePhoneLayout } from "../../ui/phone-layout";
import { Switch } from "../../ui/Switch";
import { siteRow, type LangProbe } from "../../core/site-access/site-row";
import { SaveAll } from "./SaveAll";
import { SiteRow } from "./SiteRow";
import { Subtitles } from "./Subtitles";
import { RATE_NUDGE_AT, RateNudge, SupportNav } from "./Support";

/** What the popup works with; `main.tsx` passes the browser's, tests pass fakes. */
export interface PopupDeps extends PackStatusDeps {
  /** Asks the active tab's content script; undefined when nothing there answers. */
  askPage(request: PageRequest): Promise<PageSummary | undefined>;
  /** `BrowserEnv.sync`: the browser's sync, or this device only (the phone app). */
  sync: SyncPlace;
  /**
   * `BrowserEnv.features.appGoogleAuth`: the phone app can sign in to Google, so it can
   * save to Google Drive (without it the app offers no cloud provider).
   */
  appGoogleAuth: boolean;
  /** The page's touch mode, which picks the phone layout; the real one by default. */
  touch?: TouchMode;
  /** Where the footer's links lead; an empty one is left out. */
  links: SupportLinks;
  /** Opens a link in a new tab (and so closes the popup). */
  openTab(url: string): void;
  openOptions(): void;
  openWordList(): void;
  /** Closes the popup. */
  close(): void;
  now(): number;
  /** How often the tab, the counts and the sync and cloud status are asked again while open. */
  refreshMs: number;
  /** Per-site access to articles; none where the browser has none (the phone app). */
  siteAccess?: SiteAccessDeps;
}

/** The active web tab, as `activeTab` lets the popup read it. */
export interface WebTab {
  tabId: number;
  host: string;
}

/** Chrome's per-site access, for the "On this site" row (architecture.md "Site access"). */
export interface SiteAccessDeps {
  /** The active tab when it shows an `http`/`https` page; undefined otherwise. */
  activeTab(): Promise<WebTab | undefined>;
  /** The tab's `<html lang>` ("" without one); rejects where the tab cannot be scripted. */
  probeLang(tabId: number): Promise<string>;
  /** The manifest's own content scripts cover the host (the video sites). */
  staticHost(host: string): boolean;
  granted(host: string): Promise<boolean>;
  /** Chrome's prompt for the host: called in the click handler, before anything is awaited. */
  request(host: string): Promise<boolean>;
  remove(host: string): Promise<boolean>;
  seenHosts(): Promise<string[]>;
  addSeen(host: string): Promise<void>;
}

/** A count; in the phone layout all three alike on the light surface (mock MobileLangleSheet). */
function CountTile(props: {
  value: number;
  label: string;
  green?: boolean;
  phone: boolean;
}) {
  const green = props.green && !props.phone;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        padding: props.phone ? "10px 12px" : "10px",
        borderRadius: "10px",
        background: green
          ? color.greenPale
          : props.phone
            ? color.surface
            : color.surfaceGray,
      }}
    >
      <span
        style={{
          fontSize: "20px",
          fontWeight: 700,
          color: green ? color.greenDark : color.ink,
        }}
      >
        {fmt(props.value)}
      </span>
      <span
        style={{
          fontSize: "12px",
          color: props.phone ? color.muted : color.ink2,
        }}
      >
        {props.label}
      </span>
    </div>
  );
}

/**
 * "Saved to Chrome sync · 2 min ago" over its space, or on a device that syncs nothing
 * (the phone app) "Saved on this phone · 2 min ago" alone.
 */
function SyncLine(props: {
  status: SyncStatus;
  place: SyncPlace;
  now: number;
  phone: boolean;
}) {
  const { status, place } = props;
  const line = syncSavedLine(status, (lastSavedAt) => {
    const when = relativeTime(lastSavedAt, props.now);
    return place.kind === "browser"
      ? t("popup.sync.saved", {
          syncName: browserSyncName(place.browser),
          when,
        })
      : t("popup.sync.savedDevice", { when });
  });
  if (!status.enabled) return <span style={{ fontSize: "13px" }}>{line}</span>;
  const { used, quota, share } = syncSpace(status);
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: props.phone ? "8px" : "6px",
          fontSize: "13px",
          ...(props.phone && { color: color.ink3 }),
        }}
      >
        {status.lastSavedAt !== undefined && <CheckIcon />}
        <span>{line}</span>
      </div>
      {place.kind === "browser" && (
        <>
          <Meter share={share} />
          <span style={{ fontSize: "12px", color: color.muted }}>
            {t("popup.sync.space", { used, quota })}
          </span>
        </>
      )}
    </>
  );
}

/**
 * The sync block while this device saves to its own cloud storage (mock CloudSync):
 * "Saved to Google Drive · 2 min ago" over the size and devices, or the red line of
 * what stopped it (Reconnect needed, with Reconnect; storage full or update needed,
 * without a button) over when it last saved.
 */
function CloudLine(props: {
  view: Extract<CloudView, { kind: "connected" }>;
  now: number;
  connecting: boolean;
  onReconnect: () => void;
}) {
  const { view, now } = props;
  const { status } = view;
  const error = cloudErrorLine(status, view.name);
  const when =
    status.lastSavedAt === undefined
      ? undefined
      : relativeTime(status.lastSavedAt, now);
  if (error)
    return (
      <>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13px",
          }}
        >
          <span style={{ flex: 1, fontWeight: 600, color: color.danger }}>
            {error}
          </span>
          {status.error === "reconnect" && (
            <button
              type="button"
              disabled={props.connecting}
              onClick={props.onReconnect}
              style={NOTE_BUTTON}
            >
              {props.connecting ? t("cloud.connecting") : t("cloud.reconnect")}
            </button>
          )}
        </div>
        <span style={{ fontSize: "12px", color: color.muted }}>
          {when === undefined
            ? t("sync.notSaved")
            : t("popup.cloud.lastSaved", { provider: view.name, when })}
        </span>
      </>
    );
  const size = cloudSizeLine(status);
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
        }}
      >
        {when !== undefined && <CheckIcon />}
        <span>
          {when === undefined
            ? t("sync.notSaved")
            : t("cloud.saved", { provider: view.name, when })}
        </span>
      </div>
      {size && (
        <span style={{ fontSize: "12px", color: color.muted }}>{size}</span>
      )}
    </>
  );
}

/**
 * The cloud line in the phone layout (mock `MobileLangleSheet`): "Saved to Google Drive
 * · 2 min ago" with the size and devices at its right, or what stopped it as on Home.
 */
function PhoneCloudLine(props: {
  view: Extract<CloudView, { kind: "connected" }>;
  now: number;
  /** The phone app: "Update Langle on this phone". */
  thisPhone: boolean;
  connecting: boolean;
  onReconnect: () => void;
}) {
  const { view, now } = props;
  const { status } = view;
  if (cloudErrorLine(status, view.name))
    return (
      <CloudErrorRow
        view={view}
        now={now}
        thisPhone={props.thisPhone}
        connecting={props.connecting}
        onReconnect={props.onReconnect}
      />
    );
  const size = cloudSizeLine(status);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "2px 8px",
        fontSize: "13px",
        color: color.ink3,
      }}
    >
      {status.lastSavedAt !== undefined && <CheckIcon />}
      {/* Whole: the size goes under it, at the right, when both do not fit. */}
      <span style={{ flex: 1, whiteSpace: "nowrap" }}>
        {status.lastSavedAt === undefined
          ? t("sync.notSaved")
          : t("cloud.saved", {
              provider: view.name,
              when: relativeTime(status.lastSavedAt, now),
            })}
      </span>
      {size && (
        <span
          style={{ marginLeft: "auto", fontSize: "12px", color: color.muted }}
        >
          {size}
        </span>
      )}
    </div>
  );
}

/** The header's icon buttons (word list, settings). */
const headerButton = {
  flex: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "40px",
  height: "40px",
  borderRadius: "8px",
  color: color.ink3,
  border: 0,
  background: "none",
  padding: 0,
  cursor: "pointer",
} as const;

/** The header's icon buttons in the phone layout: 44px round targets. */
const phoneHeaderButton = {
  ...headerButton,
  width: "44px",
  height: "44px",
  borderRadius: "22px",
} as const;

/**
 * The toolbar popup (mock Toolbar): the header's switch for Langle as a whole, the
 * language data while it is missing (mock LanguageData), this site, this page,
 * highlights, counts, sync (browser sync, or the user's own cloud storage), the rating
 * nudge and the Support Langle footer. While Langle is switched off, only the header,
 * sync and the footer.
 */
export function Popup({ deps }: { deps: PopupDeps }) {
  /** The phone layout (mock MobileLangleSheet): the full width, 44px targets, Subtitles. */
  const phone = usePhoneLayout(deps.touch);
  const [settings, setSettings] = useState<Settings>();
  const [counts, setCounts] = useState<Counts>();
  /** The active tab's summary; none while asking, or when nothing there answers. */
  const [summary, setSummary] = useState<PageSummary>();
  const [sync, setSync] = useState<SyncStatus>();
  const [cloud, setCloud] = useState<CloudStatus>();
  const [data, setData] = useState<DataNote | null>(null);
  const [now, setNow] = useState(deps.now);
  const [connecting, setConnecting] = useState(false);
  /** The active web tab, where the browser has per-site access. */
  const [tab, setTab] = useState<WebTab>();
  const [granted, setGranted] = useState<boolean>();
  const [seenBefore, setSeenBefore] = useState<boolean>();
  const [probe, setProbe] = useState<LangProbe>();
  /** The tab whose grant the refresh asks again; set once the opening knows it. */
  const accessTab = useRef<WebTab | undefined>(undefined);
  /** The host was added to the seen hosts in this opening. */
  const recorded = useRef(false);

  const warn = (error: unknown) => console.warn("Langle:", error);
  const [settingsView] = useState(() =>
    createSettingsView(setSettings, (patch) =>
      deps.send({ type: "setSettings", patch }).catch(warn),
    ),
  );

  function refreshCounts(lang: string) {
    deps.send({ type: "counts", lang }).then(setCounts, warn);
  }

  function refreshCloud() {
    return deps.send({ type: "cloudStatus" }).then(setCloud, warn);
  }

  /**
   * Signs in (a window opens, which may close the popup) and connects this device; the
   * button reads "Connecting…" until the line follows.
   */
  function connect(provider: CloudProviderId) {
    setConnecting(true);
    void deps
      .send({ type: "cloudConnect", provider })
      .catch(warn)
      .then(refreshCloud)
      .finally(() => setConnecting(false));
  }

  function askPage(request: PageRequest) {
    return deps.askPage(request).then(setSummary, () => setSummary(undefined));
  }

  /**
   * Finds out what the row shows on an article host: whether it was seen before this
   * opening, its grant and, where no Langle script answers, the page's `<html lang>`.
   */
  async function openOnTab() {
    const access = deps.siteAccess;
    if (!access) return;
    const web = await access.activeTab().catch(() => undefined);
    if (!web) return;
    setTab(web);
    if (access.staticHost(web.host)) return;
    const [seen, grant, answer] = await Promise.all([
      access.seenHosts().catch((): string[] => []),
      access.granted(web.host).catch(() => false),
      deps.askPage({ type: "pageSummary" }).catch(() => undefined),
    ]);
    setSeenBefore(seen.includes(web.host.toLowerCase()));
    setGranted(grant);
    accessTab.current = web;
    if (!answer) await probeTab(web);
  }

  /** Reads the tab's `<html lang>` (`activeTab`); a failure hides the row. */
  async function probeTab(web: WebTab) {
    const result = await deps.siteAccess?.probeLang(web.tabId).then(
      (lang): LangProbe => ({ lang }),
      (): LangProbe => "failed",
    );
    setProbe(result);
  }

  useEffect(() => {
    let lang: string | undefined;
    const refresh = () => {
      setNow(deps.now());
      void askPage({ type: "pageSummary" });
      deps.send({ type: "syncStatus" }).then(setSync, warn);
      void refreshCloud();
      if (lang) refreshCounts(lang);
      // A grant made in Chrome's own menus while the popup is open.
      const web = accessTab.current;
      if (web && deps.siteAccess)
        deps.siteAccess.granted(web.host).then(setGranted, warn);
    };
    void openOnTab();
    // The other devices' changes are read now, not at the next 5-minute check.
    deps.send({ type: "cloudCheck" }).catch(warn);
    deps.send({ type: "getSettings" }).then((s) => {
      lang = s.learningLang;
      settingsView.stored(s);
      refreshCounts(lang);
    }, warn);
    refresh();
    const packs = followPackStatus(deps, (status) => setData(pairNote(status)));
    const unwatch = deps.watchSettings((s) => {
      lang = s.learningLang;
      settingsView.stored(s);
    });
    const timer = setInterval(refresh, deps.refreshMs);
    return () => {
      unwatch();
      packs.stop();
      clearInterval(timer);
    };
  }, []);

  /** Langle runs at all (the header's switch); while off only the header and sync show. */
  const langleOn = settings?.enabled !== false;

  function toggleLangle() {
    if (!settings) return;
    const enabled = !settings.enabled;
    void settingsView.change({ enabled });
  }

  const view = cloudView(
    cloud,
    settings,
    appCloud({
      sync: deps.sync,
      features: { appGoogleAuth: deps.appGoogleAuth },
    }),
  );

  const host = summary?.hostname ?? tab?.host;
  const access = deps.siteAccess;
  /** Today's off-list switch alone: the video sites, or no per-site access. */
  const listOnly = !access || (host !== undefined && access.staticHost(host));
  const offListed =
    !!settings && !!host && settings.disabledSites.some((e) => onHost(host, e));
  const row = siteRow({
    host,
    answered: !!summary,
    listOnly,
    granted,
    offListed,
    seenBefore,
    probe,
    learningLang: settings?.learningLang ?? "",
  });
  const siteOn = row === "on";

  // Opening the popup where the row shows decides the host on this computer: no mark
  // and no bubble there again. `seenBefore` keeps what it was for this opening.
  useEffect(() => {
    if (recorded.current || listOnly || !tab || row === "hidden" || !langleOn)
      return;
    recorded.current = true;
    access?.addSeen(tab.host).catch(warn);
  }, [row, langleOn]);

  function toggleSite() {
    if (!settings || !host) return;
    const others = settings.disabledSites.filter((e) => !onHost(host, e));
    if (listOnly || !access) {
      const disabledSites = siteOn ? [...settings.disabledSites, host] : others;
      void settingsView.change({ disabledSites });
      return;
    }
    // Used once, the switch is decided: no bubble for the rest of this opening.
    setSeenBefore(true);
    if (siteOn) {
      // Chrome refuses to remove a grant the manifest makes, or one host out of "On
      // all sites": then the off list keeps the host off.
      const add = settings.disabledSites;
      void access
        .remove(host)
        .catch(() => false)
        .then(() => access.granted(host))
        .then((still) => {
          setGranted(still);
          if (still)
            void settingsView.change({ disabledSites: [...add, host] });
          // The page gives its page back and stops answering: the row needs the probe.
          else if (tab) void probeTab(tab);
        }, warn);
      return;
    }
    if (!granted) {
      // Not awaited: Chrome's prompt needs this click, and closes the popup.
      if (tab)
        deps
          .send({ type: "siteAccessPending", tabId: tab.tabId, host })
          .catch(warn);
      access.request(host).then((yes) => {
        if (yes) setGranted(true);
      }, warn);
    }
    if (offListed) void settingsView.change({ disabledSites: others });
  }

  /** The nudge shows once Learning reaches 100 words, until Rate or × answers it. */
  const nudging =
    !!deps.links.review &&
    settings?.rateNudgeDone === false &&
    (counts?.learning ?? 0) >= RATE_NUDGE_AT;

  /** Stores that the nudge was answered, everywhere (the setting syncs). */
  function nudgeDone(): Promise<unknown> {
    if (!settings || settings.rateNudgeDone) return Promise.resolve();
    return settingsView.change({ rateNudgeDone: true });
  }

  function pageAction(request: PageRequest) {
    void askPage(request).then(() => {
      if (settings) refreshCounts(settings.learningLang);
    });
  }

  const countTiles = langleOn && counts && (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "8px",
      }}
    >
      <CountTile
        value={counts.learning}
        label={t("status.learning")}
        green
        phone={phone}
      />
      <CountTile value={counts.known} label={t("status.known")} phone={phone} />
      <CountTile
        value={counts.phrases}
        label={t("kind.phrases")}
        phone={phone}
      />
    </div>
  );

  const savedLine =
    view?.kind === "connected" ? (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {phone ? (
          <PhoneCloudLine
            view={view}
            now={now}
            thisPhone={deps.sync.kind === "device"}
            connecting={connecting}
            onReconnect={() => connect(view.provider)}
          />
        ) : (
          <CloudLine
            view={view}
            now={now}
            connecting={connecting}
            onReconnect={() => connect(view.provider)}
          />
        )}
      </div>
    ) : (
      sync && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <SyncLine status={sync} place={deps.sync} now={now} phone={phone} />
        </div>
      )
    );

  return (
    <div
      role="dialog"
      aria-label={t("app.name")}
      style={{
        width: phone ? "100%" : "360px",
        boxSizing: "border-box",
        background: color.card,
        color: color.ink,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        ...(phone && { fontSize: "15px" }),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: phone ? "6px" : "8px",
          paddingBlock: phone ? "10px 12px" : "12px",
          paddingInline: phone ? "20px 16px" : "16px 8px",
          borderBottom: `1px solid ${color.line}`,
        }}
      >
        <BrandHeader
          size={phone ? "phone" : "popup"}
          stacked
          title={t("app.name")}
          pair={
            settings
              ? languagePair(settings.learningLang, settings.nativeLang)
              : ""
          }
        />
        {/* Pushed to the end by its margin, not a spacer: one gap more for the pair. */}
        <button
          type="button"
          aria-label={t("wordlist.title")}
          title={t("wordlist.title")}
          onClick={deps.openWordList}
          style={{
            ...(phone ? phoneHeaderButton : headerButton),
            marginInlineStart: "auto",
          }}
        >
          <WordListIcon size={phone ? 22 : 20} />
        </button>
        <button
          type="button"
          aria-label={t("action.openSettings")}
          title={t("action.openSettings")}
          onClick={deps.openOptions}
          style={phone ? phoneHeaderButton : headerButton}
        >
          <GearIcon size={phone ? 22 : 20} />
        </button>
        {settings && (
          <span style={{ display: "flex", padding: phone ? 0 : "0 8px 0 4px" }}>
            <Switch
              size={phone ? "phone" : "large"}
              checked={langleOn}
              label={t("popup.langleSwitch")}
              onToggle={toggleLangle}
            />
          </span>
        )}
      </div>

      <div
        style={{
          // The phone's bottom: the content's 4px and the sheet's 28px.
          padding: phone ? "16px 20px 32px" : "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: phone ? "20px" : "16px",
        }}
      >
        {langleOn && data && settings && (
          <LanguageDataNote
            note={data}
            language={languageName(settings.learningLang)}
            onRetry={() => {
              deps.send({ type: "retryPacks" }).catch(warn);
            }}
          />
        )}

        {view?.kind === "too" && (
          <div style={NOTE}>
            <span style={{ flex: 1, minWidth: 0 }}>
              {t("cloud.connectToo", { provider: view.name })}
            </span>
            <button
              type="button"
              disabled={connecting}
              onClick={() => connect(view.provider)}
              style={NOTE_BUTTON}
            >
              {connecting ? t("cloud.connecting") : t("cloud.connect")}
            </button>
          </div>
        )}

        {langleOn && host && row !== "hidden" && (
          <SiteRow row={row} host={host} phone={phone} onToggle={toggleSite} />
        )}

        {phone &&
          langleOn &&
          settings &&
          summary?.supported &&
          summary.scope === "video" &&
          siteOn && (
            <Subtitles
              settings={settings}
              change={(patch) => void settingsView.change(patch)}
            />
          )}

        {langleOn && summary?.supported && siteOn && (
          <SaveAll
            phone={phone}
            scope={summary.scope}
            unsavedCount={summary.unsaved}
            done={summary.done}
            onAddLearning={() =>
              pageAction({ type: "pageSaveAll", status: "learning" })
            }
            onMarkKnown={() =>
              pageAction({ type: "pageSaveAll", status: "known" })
            }
            onUndo={() => pageAction({ type: "pageUndo" })}
            {...(summary.scope === "page" && {
              onShowWords() {
                void deps
                  .askPage({ type: "pageShowWords" })
                  .catch(warn)
                  .finally(deps.close);
              },
            })}
          />
        )}

        {langleOn && settings && (
          <HighlightChips
            look={phone ? "phone" : "popup"}
            highlight={settings.highlight}
            onToggle={(category) => {
              const on = !settings.highlight[category];
              void settingsView.change({ highlight: { [category]: on } });
            }}
          />
        )}

        {phone ? (
          // Mock MobileLangleSheet: the counts and the saved line under a rule.
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              paddingTop: "14px",
              borderTop: `1px solid ${color.line}`,
            }}
          >
            {countTiles}
            {savedLine}
          </div>
        ) : (
          <>
            {countTiles}
            {savedLine}
            {nudging && <RateNudge onDismiss={() => void nudgeDone()} />}
          </>
        )}
      </div>

      {/* The phone's sheet has no footer: its store page and links are the desktop's. */}
      {!phone && (
        <SupportNav
          reviewUrl={deps.links.review}
          coffeeUrl={deps.links.coffee}
          nudging={nudging}
          onRate={() =>
            // Stored first: opening a tab closes the popup.
            void nudgeDone().finally(() => deps.openTab(deps.links.review))
          }
          onOpen={deps.openTab}
        />
      )}
    </div>
  );
}
