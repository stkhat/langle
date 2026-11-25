import { useEffect, useState } from "preact/hooks";
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
  cloudErrorLine,
  cloudSizeLine,
  cloudView,
  type CloudView,
} from "../../ui/format/cloud";
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
import { SaveAll } from "./SaveAll";
import { Subtitles } from "./Subtitles";
import { RATE_NUDGE_AT, RateNudge, SupportNav } from "./Support";

/** What the popup works with; `main.tsx` passes the browser's, tests pass fakes. */
export interface PopupDeps extends PackStatusDeps {
  /** Asks the active tab's content script; undefined when nothing there answers. */
  askPage(request: PageRequest): Promise<PageSummary | undefined>;
  /** `BrowserEnv.sync`: the browser's sync, or this device only (the phone app). */
  sync: SyncPlace;
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
              onClick={props.onReconnect}
              style={NOTE_BUTTON}
            >
              {t("cloud.reconnect")}
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
    deps.send({ type: "cloudStatus" }).then(setCloud, warn);
  }

  /** Signs in (a window opens, which may close the popup) and connects this device. */
  function connect(provider: CloudProviderId) {
    void deps
      .send({ type: "cloudConnect", provider })
      .catch(warn)
      .finally(refreshCloud);
  }

  function askPage(request: PageRequest) {
    return deps.askPage(request).then(setSummary, () => setSummary(undefined));
  }

  useEffect(() => {
    let lang: string | undefined;
    const refresh = () => {
      setNow(deps.now());
      void askPage({ type: "pageSummary" });
      deps.send({ type: "syncStatus" }).then(setSync, warn);
      refreshCloud();
      if (lang) refreshCounts(lang);
    };
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

  const view = cloudView(cloud, settings);

  const siteOn =
    settings && summary
      ? !settings.disabledSites.some((e) => onHost(summary.hostname, e))
      : true;

  function toggleSite() {
    if (!settings || !summary) return;
    const { hostname } = summary;
    const disabledSites = siteOn
      ? [...settings.disabledSites, hostname]
      : settings.disabledSites.filter((e) => !onHost(hostname, e));
    void settingsView.change({ disabledSites });
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
        <CloudLine
          view={view}
          now={now}
          onReconnect={() => connect(view.provider)}
        />
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
              onClick={() => connect(view.provider)}
              style={NOTE_BUTTON}
            >
              {t("cloud.connect")}
            </button>
          </div>
        )}

        {langleOn && summary && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                minWidth: 0,
              }}
            >
              <span
                style={{ fontSize: phone ? "15px" : "14px", fontWeight: 600 }}
              >
                {t("popup.site")}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  color: color.muted,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {summary.hostname}
              </span>
            </div>
            <Switch
              size={phone ? "phone" : "large"}
              checked={siteOn}
              label={t("popup.siteSwitch")}
              onToggle={toggleSite}
            />
          </div>
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
