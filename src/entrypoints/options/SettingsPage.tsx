import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { TouchMode } from "../../content/touch/touch-mode";
import type { BrowserEnv } from "../../core/browser-env";
import type { ExplanationProvider } from "../../core/explain/provider";
import type { SupportLinks } from "../../core/links";
import type { Settings, SettingsPatch } from "../../core/settings";
import { createSettingsView } from "../../core/settings-view";
import { languagePair } from "../../i18n/languages";
import { t, type MessageKey } from "../../i18n/t";
import type { send } from "../../messaging/client";
import {
  followPackStatus,
  type PackStatusDeps,
  type PackStatusFollower,
} from "../../messaging/pack-status";
import type {
  CloudStatus,
  HistoryStatus,
  PackStatus,
  SyncStatus,
} from "../../messaging/protocol";
import type { BackupDeps } from "../../ui/backup/BackupButtons";
import { BrandHeader } from "../../ui/BrandHeader";
import { cloudView } from "../../ui/format/cloud";
import { fmt } from "../../ui/format/format";
import { ChevronRightIcon } from "../../ui/icons";
import { usePhoneLayout } from "../../ui/phone-layout";
import { PHONE_SCREEN, PhoneBackBar, PhoneTitle } from "../../ui/phone-screen";
import { PhoneRows } from "../../ui/RowLabel";
import { color, FONT, PAGE_BUTTON_CSS } from "../../ui/styles";
import { PHONE_SETTINGS_CSS } from "./rows";
import { AboutSection } from "./sections/About";
import { AppearanceSection, THEMES } from "./sections/Appearance";
import { DictionariesSection } from "./sections/Dictionaries";
import { HighlightingSection } from "./sections/Highlighting";
import { HistorySection } from "./sections/History";
import { LanguagesSection } from "./sections/Languages";
import { LevelSection } from "./sections/Level";
import { SitesSection } from "./sections/Sites";
import { SupportBox } from "./sections/Support";
import {
  syncSectionLabel,
  SyncSection,
  type CloudRequest,
} from "./sections/Sync";
import { VideoSection } from "./sections/Video";

/** What the settings page works with; `main.tsx` passes the browser's, tests pass fakes. */
export interface SettingsDeps extends BackupDeps, PackStatusDeps {
  send: typeof send;
  env: Pick<BrowserEnv, "name" | "sync" | "features">;
  /** The on-device AI ("Dictionaries and AI"); none: no rows for it. */
  explainProvider?: ExplanationProvider;
  /** The extension's version, from the manifest. */
  version: string;
  /** The data sources and licenses page, which About links to. */
  noticesUrl: string;
  /** Where the Support Langle box's links lead; an empty one is left out. */
  links: SupportLinks;
  /** How often the sync, cloud and history status and the relative times are refreshed. */
  refreshMs: number;
  /** The page's touch mode but in tests (`usePhoneLayout`). */
  touch?: TouchMode;
}

const SECTIONS = [
  { id: "languages", label: "settings.section.languages" },
  { id: "appearance", label: "settings.section.appearance" },
  { id: "level", label: "settings.section.level" },
  { id: "highlighting", label: "settings.section.highlighting" },
  { id: "dictionaries", label: "settings.section.dictionaries" },
  { id: "video", label: "settings.section.video" },
  { id: "sites", label: "settings.section.sites" },
  { id: "history", label: "settings.section.history" },
  { id: "sync", label: "settings.section.sync" },
  { id: "about", label: "settings.section.about" },
] as const satisfies readonly { id: string; label: MessageKey }[];

type SectionId = (typeof SECTIONS)[number]["id"];

const CSS = `
body{background:${color.surface}}
a{color:${color.greenText}}a:hover{color:${color.greenDark}}
.card{background:${color.card};border:1px solid ${color.line};border-radius:14px;padding:24px;display:flex;flex-direction:column;gap:18px;scroll-margin-top:24px}
.h2{margin:0;font-size:18px;font-weight:700}
.lead{margin:-10px 0 0;font-size:14px;line-height:1.5;color:${color.muted}}
.row{display:flex;align-items:center;gap:16px;padding:12px 0;border-top:1px solid ${color.soft}}
.sel{height:40px;min-width:220px;padding:0 12px;border:1px solid ${color.lineStrong};border-radius:8px;background:${color.card};color:${color.ink};font:inherit;font-size:14px}
${PAGE_BUTTON_CSS}
.nav{display:flex;align-items:center;height:40px;padding:0 12px;border-radius:8px;color:${color.ink2};text-decoration:none;font-size:14px}
.nav:hover{background:${color.soft};color:${color.ink}}
.nav[aria-current="true"]{background:${color.greenPale};color:${color.greenDark};font-weight:600}
.chk{width:18px;height:18px;accent-color:${color.green};margin:0}
.soon{font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${color.muted};background:${color.surfaceGray};border-radius:999px;padding:3px 8px}
.sub{display:flex;align-items:center;gap:16px;padding-block:10px;padding-inline:20px 0;border-top:1px solid ${color.soft}}
.st{display:inline-flex;align-items:center;gap:8px;min-width:220px;justify-content:flex-end;font-size:14px;color:${color.ink}}
`;

/** How far below the top of the window a section's top counts as "in view". */
const IN_VIEW_LINE = 120;

/**
 * The section in view: the last one whose top has passed a line near the top of the
 * window; the last section once the page is scrolled to the bottom.
 */
function useSectionInView(): SectionId {
  const [active, setActive] = useState<SectionId>(SECTIONS[0].id);
  useEffect(() => {
    const update = () => {
      const line = IN_VIEW_LINE;
      let current: SectionId = SECTIONS[0].id;
      for (const { id } of SECTIONS) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) current = id;
      }
      const atBottom =
        innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && scrollY > 0) current = SECTIONS.at(-1)!.id;
      setActive(current);
    };
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    update();
    return () => {
      removeEventListener("scroll", update);
      removeEventListener("resize", update);
    };
  }, []);
  return active;
}

/** The settings page (mock Settings): every section, bound to the settings live. */
export function SettingsPage({ deps }: { deps: SettingsDeps }) {
  const phone = usePhoneLayout(deps.touch);
  /** The section pushed over the phone layout's list. */
  const [open, setOpen] = useState<SectionId>();
  const [settings, setSettings] = useState<Settings>();
  const [sync, setSync] = useState<SyncStatus>();
  const [cloud, setCloud] = useState<CloudStatus>();
  const [history, setHistory] = useState<HistoryStatus>();
  const [packs, setPacks] = useState<PackStatus>();
  const [now, setNow] = useState(deps.now);
  const active = useSectionInView();
  const packStatus = useRef<PackStatusFollower>(undefined);

  const warn = (error: unknown) => console.warn("Langle:", error);
  const [settingsView] = useState(() =>
    createSettingsView(setSettings, (patch) =>
      deps.send({ type: "setSettings", patch }).catch(warn),
    ),
  );
  const refreshSync = () =>
    Promise.all([
      deps.send({ type: "syncStatus" }).then(setSync, warn),
      deps.send({ type: "cloudStatus" }).then(setCloud, warn),
    ]);
  const refreshHistory = () =>
    deps.send({ type: "historyStatus" }).then(setHistory, warn);

  useEffect(() => {
    packStatus.current = followPackStatus(deps, setPacks);
    deps.send({ type: "getSettings" }).then(settingsView.stored, warn);
    void refreshSync();
    void refreshHistory();
    const unwatch = deps.watchSettings((next) => {
      settingsView.stored(next);
      void refreshSync();
    });
    const timer = setInterval(() => {
      setNow(deps.now());
      void refreshSync();
      void refreshHistory();
    }, deps.refreshMs);
    return () => {
      unwatch();
      packStatus.current?.stop();
      clearInterval(timer);
    };
  }, []);

  if (!settings) return null;

  function change(patch: SettingsPatch) {
    void settingsView.change(patch).then(() => {
      if ("syncEnabled" in patch) void refreshSync();
    });
  }
  const section = { settings, change };
  const view = cloudView(cloud, settings);

  /** Connects or disconnects (a sign-in window may open), then shows where it stands. */
  function cloudRequest(request: CloudRequest) {
    return deps
      .send(request)
      .catch(warn)
      .finally(() => void refreshSync());
  }

  const sections: Record<SectionId, JSX.Element> = {
    languages: (
      <LanguagesSection
        key="languages"
        {...section}
        packs={packs}
        onRetry={() => {
          deps.send({ type: "retryPacks" }).catch(warn);
        }}
        onRemove={(names) => {
          void (async () => {
            for (const pack of names)
              await deps.send({ type: "removePack", pack });
          })()
            .catch(warn)
            .finally(() => packStatus.current?.refresh());
        }}
      />
    ),
    appearance: (
      <AppearanceSection
        key="appearance"
        {...section}
        app={deps.env.features.appHost}
      />
    ),
    level: <LevelSection key="level" {...section} />,
    highlighting: <HighlightingSection key="highlighting" {...section} />,
    dictionaries: (
      <DictionariesSection
        key="dictionaries"
        {...section}
        env={deps.env}
        explainProvider={deps.explainProvider}
      />
    ),
    video: <VideoSection key="video" {...section} />,
    sites: (
      <SitesSection key="sites" {...section} app={deps.env.features.appHost} />
    ),
    history: (
      <HistorySection
        key="history"
        {...section}
        history={history}
        cloud={view}
        onClear={() =>
          void deps.send({ type: "clearHistory" }).then(refreshHistory, warn)
        }
      />
    ),
    sync: (
      <SyncSection
        key="sync"
        {...section}
        deps={deps}
        env={deps.env}
        sync={sync}
        cloud={view}
        onCloud={cloudRequest}
        now={now}
        onExported={() => setNow(deps.now())}
      />
    ),
    about: (
      <AboutSection
        key="about"
        version={deps.version}
        noticesUrl={deps.noticesUrl}
      />
    ),
  };
  const label = (id: SectionId, key: MessageKey) =>
    t(id === "sync" ? syncSectionLabel(deps.env) : key);

  if (phone) {
    /** What a row of the sections' list shows beside its name (mock MobileSettings). */
    const values: Partial<Record<SectionId, string>> = {
      languages: languagePair(settings.learningLang, settings.nativeLang),
      appearance: t(
        THEMES.find((theme) => theme.id === settings.theme)?.label ??
          "settings.appearance.system",
      ),
      level: fmt(settings.knownLevel),
    };
    function push(id: SectionId | undefined) {
      setOpen(id);
      scrollTo(0, 0);
    }
    return (
      <div
        class="ph"
        style={{
          ...PHONE_SCREEN,
          minHeight: "100dvh",
          gap: "18px",
          ...(open && { paddingTop: 0, gap: "16px" }),
        }}
      >
        <style>{CSS + PHONE_SETTINGS_CSS}</style>
        {open ? (
          <PhoneRows.Provider value>
            <div style={{ margin: "0 -20px -12px" }}>
              <PhoneBackBar
                label={t("settings.title")}
                onBack={() => push(undefined)}
              />
            </div>
            {sections[open]}
          </PhoneRows.Provider>
        ) : (
          <>
            <PhoneTitle title={t("settings.title")} />
            <nav
              aria-label={t("settings.navLabel")}
              style={{
                display: "flex",
                flexDirection: "column",
                borderRadius: "12px",
                background: color.card,
                border: `1px solid ${color.line}`,
                overflow: "hidden",
                flex: "none",
              }}
            >
              {SECTIONS.map(({ id, label: key }, i) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => push(id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    minHeight: "52px",
                    paddingBlock: "0",
                    paddingInline: "16px 12px",
                    margin: 0,
                    border: 0,
                    borderTop: i ? `1px solid ${color.soft}` : 0,
                    background: "none",
                    color: color.ink,
                    font: "inherit",
                    textAlign: "start",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ flex: 1, fontSize: "16px" }}>
                    {label(id, key)}
                  </span>
                  {values[id] && (
                    <span style={{ fontSize: "14px", color: color.muted }}>
                      {values[id]}
                    </span>
                  )}
                  <ChevronRightIcon />
                </button>
              ))}
            </nav>
            <SupportBox
              links={deps.links}
              app={deps.env.features.appHost}
              phone
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "flex",
        gap: "40px",
        padding: "40px 120px",
        background: color.surface,
        color: color.ink,
        fontFamily: FONT,
      }}
    >
      <style>{CSS}</style>
      <div
        style={{
          width: "220px",
          flex: "none",
          alignSelf: "flex-start",
          position: "sticky",
          top: "40px",
          // A window too short for the nav and the Support box scrolls the column.
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <nav
          aria-label={t("settings.navLabel")}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "0 12px 20px",
            }}
          >
            <BrandHeader size="settings" title={t("settings.title")} />
          </div>
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              class="nav"
              href={`#${section.id}`}
              aria-current={active === section.id ? "true" : undefined}
            >
              {label(section.id, section.label)}
            </a>
          ))}
        </nav>
        <SupportBox links={deps.links} app={deps.env.features.appHost} />
      </div>

      <main
        style={{
          flex: 1,
          maxWidth: "800px",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {SECTIONS.map(({ id }) => sections[id])}
      </main>
    </div>
  );
}
