import { useEffect, useState } from "preact/hooks";
import type { CloudProviderId } from "../../../core/cloud/provider";
import type { BrowserEnv } from "../../../core/browser-env";
import { t, type MessageKey } from "../../../i18n/t";
import type { CloudStatus, SyncStatus } from "../../../messaging/protocol";
import {
  BackupButtons,
  BackupStatus,
  type BackupDeps,
  type BackupNote,
} from "../../../ui/backup/BackupButtons";
import {
  cloudConnectedDesc,
  cloudErrorLine,
  cloudSizeLine,
  type CloudView,
} from "../../../ui/format/cloud";
import { relativeTime } from "../../../ui/format/format";
import {
  browserSyncName,
  syncSavedLine,
  syncSpace,
} from "../../../ui/format/sync";
import { Meter } from "../../../ui/Meter";
import { RowLabel } from "../../../ui/RowLabel";
import { color } from "../../../ui/styles";
import { LaterRow, Section, SwitchRow, type SectionProps } from "../rows";

/** What the cloud rows ask the background for; resolves once it is done. */
export type CloudRequest =
  | { type: "cloudConnect"; provider: CloudProviderId }
  | { type: "cloudDisconnect" };

function syncLine(sync: SyncStatus | undefined, now: number): string {
  if (!sync) return "";
  return syncSavedLine(sync, (lastSavedAt) =>
    t("settings.sync.lastSaved", { when: relativeTime(lastSavedAt, now) }),
  );
}

/** Mock `.box`: the status under a sync row. */
const BOX = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  padding: "14px",
  borderRadius: "10px",
  background: color.surface,
} as const;

/** Mock `.bl`: the box's first line, a title at the left and a figure at the right. */
const BOX_LINE = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  fontSize: "13px",
} as const;

/** Mock `.bs`. */
const BOX_NOTE = { fontSize: "12px", lineHeight: 1.45, color: color.muted };

/** The browser-sync switch and its space, while no cloud storage is connected here. */
function BrowserSyncRows(
  props: SectionProps & {
    browser: string;
    syncName: string;
    sync: SyncStatus | undefined;
    now: number;
  },
) {
  const { settings, sync, syncName } = props;
  const { used, quota, share } = syncSpace(sync);
  return (
    <>
      <SwitchRow
        first
        title={t("settings.sync.switch", { syncName })}
        desc={t("settings.sync.switchDesc", { browser: props.browser })}
        checked={settings.syncEnabled}
        onToggle={() => props.change({ syncEnabled: !settings.syncEnabled })}
      />
      <div style={BOX}>
        <div style={BOX_LINE}>
          <span style={{ fontWeight: 600 }}>{t("settings.sync.space")}</span>
          <span>{t("settings.sync.spaceUsed", { used, quota })}</span>
        </div>
        <Meter share={share} height={8} />
        <span style={BOX_NOTE}>{syncLine(sync, props.now)}</span>
      </div>
    </>
  );
}

/**
 * What an error box says under its red line (mock CloudSync's three errors); `phone`:
 * the phone app's "this phone" (mock MobileSettingsSync).
 */
function errorNote(status: CloudStatus, now: number, phone = false): string {
  const saved =
    status.lastSavedAt === undefined
      ? undefined
      : t("settings.cloud.lastSaved", {
          when: relativeTime(status.lastSavedAt, now),
        });
  const parts =
    status.error === "reconnect"
      ? [
          saved,
          t(
            phone
              ? "settings.cloud.reconnectDescPhone"
              : "settings.cloud.reconnectDesc",
          ),
        ]
      : status.error === "full"
        ? [
            saved,
            t(
              phone
                ? "settings.cloud.fullDescPhone"
                : "settings.cloud.fullDesc",
            ),
          ]
        : [t("settings.cloud.updateDesc"), saved];
  return parts.filter((part) => part !== undefined).join(" ");
}

/** "Saved to Google Drive · 2 min ago", or "Not saved yet" before the first write. */
function savedLine(view: { name: string; status: CloudStatus }, now: number) {
  const { lastSavedAt } = view.status;
  return lastSavedAt === undefined
    ? t("sync.notSaved")
    : t("cloud.saved", {
        provider: view.name,
        when: relativeTime(lastSavedAt, now),
      });
}

/** "Your own cloud storage" while connected: Disconnect (and Reconnect), then the status. */
function ConnectedRows(props: {
  view: Extract<CloudView, { kind: "connected" }>;
  now: number;
  busy: boolean;
  onCloud: (request: CloudRequest) => void;
}) {
  const { view, now } = props;
  const { status } = view;
  const error = cloudErrorLine(status, view.name);
  const saved = savedLine(view, now);
  return (
    <>
      <div class="row" style={{ borderTop: 0, paddingTop: 0 }}>
        <RowLabel
          title={t("settings.cloud.title")}
          desc={cloudConnectedDesc(status, view.name)}
        />
        {status.error === "reconnect" && (
          <button
            class="btn"
            type="button"
            disabled={props.busy}
            onClick={() =>
              props.onCloud({ type: "cloudConnect", provider: view.provider })
            }
          >
            {t("cloud.reconnect")}
          </button>
        )}
        <button
          class="btn"
          type="button"
          disabled={props.busy}
          onClick={() => props.onCloud({ type: "cloudDisconnect" })}
        >
          {t("cloud.disconnect")}
        </button>
      </div>
      <div style={BOX}>
        <div style={BOX_LINE}>
          {error ? (
            <span style={{ fontWeight: 600, color: color.danger }}>
              {error}
            </span>
          ) : (
            <span style={{ fontWeight: 600 }}>{saved}</span>
          )}
          <span>{cloudSizeLine(status)}</span>
        </div>
        {error ? (
          <span style={BOX_NOTE}>{errorNote(status, now)}</span>
        ) : (
          status.lastCheckedAt !== undefined && (
            <span style={BOX_NOTE}>
              {t("settings.cloud.lastChecked", {
                when: relativeTime(status.lastCheckedAt, now),
              })}
            </span>
          )
        )}
      </div>
    </>
  );
}

/** The last row while not connected here: Connect, "on this device too", or Coming later. */
function ConnectRow(props: {
  view: Exclude<CloudView, { kind: "connected" }>;
  syncName: string;
  features: BrowserEnv["features"];
  busy: boolean;
  onCloud: (request: CloudRequest) => void;
}) {
  const { view, syncName } = props;
  if (view.kind === "unavailable")
    return (
      <LaterRow
        title={t("settings.cloud.title")}
        desc={
          props.features.fileSystemAccess
            ? t("settings.cloud.desc", { syncName })
            : t("settings.cloud.descNoFolder", { syncName })
        }
      />
    );
  const too = view.kind === "too";
  return (
    <div class="row">
      <RowLabel
        title={
          too
            ? t("cloud.connectToo", { provider: view.name })
            : t("settings.cloud.title")
        }
        desc={
          too
            ? t("settings.cloud.tooDesc", { provider: view.name })
            : t("settings.cloud.offer", { provider: view.name, syncName })
        }
      />
      <button
        class="btn"
        type="button"
        disabled={props.busy}
        onClick={() =>
          props.onCloud({ type: "cloudConnect", provider: view.provider })
        }
      >
        {too
          ? t("cloud.connect")
          : t("settings.cloud.connectButton", { provider: view.name })}
      </button>
    </div>
  );
}

/** Mock MobileSettingsSync `.box`: the status inside the phone app's cloud card. */
const APP_BOX = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  padding: "12px",
  borderRadius: "10px",
  background: color.surface,
} as const;

/** Mock `.bl`: the line and the size, the size wrapping under it when narrow. */
const APP_BOX_LINE = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: "4px 12px",
  fontSize: "14px",
} as const;

const APP_BOX_NOTE = { fontSize: "13px", lineHeight: 1.45, color: color.muted };

/**
 * The phone app's "Your own cloud storage" card (mock MobileSettingsSync): the offer
 * with Connect, or the account, the status box and Disconnect (Reconnect beside it).
 */
/** What the app's card shows: a provider to offer (the app never says "too") or the connected one. */
type AppCloudView = Exclude<CloudView, { kind: "unavailable" }>;

function AppCloudCard(props: {
  view: AppCloudView;
  now: number;
  busy: boolean;
  onCloud: (request: CloudRequest) => void;
}) {
  const { view, now, busy } = props;
  const connect = () =>
    props.onCloud({ type: "cloudConnect", provider: view.provider });
  if (view.kind !== "connected")
    return (
      <div class="stack">
        <RowLabel
          title={t("settings.cloud.title")}
          desc={t("settings.cloud.offerPhone", { provider: view.name })}
        />
        <button class="btn" type="button" disabled={busy} onClick={connect}>
          {t("settings.cloud.connectButton", { provider: view.name })}
        </button>
      </div>
    );
  const { status } = view;
  const error = cloudErrorLine(status, view.name, true);
  return (
    <div class="stack">
      <RowLabel
        title={t("settings.cloud.title")}
        desc={cloudConnectedDesc(status, view.name)}
      />
      <div style={APP_BOX}>
        <div style={APP_BOX_LINE}>
          <span
            style={{
              fontWeight: 600,
              ...(error && { color: color.danger }),
            }}
          >
            {error ?? savedLine(view, now)}
          </span>
          <span>{cloudSizeLine(status)}</span>
        </div>
        {error ? (
          <span style={APP_BOX_NOTE}>{errorNote(status, now, true)}</span>
        ) : (
          status.lastCheckedAt !== undefined && (
            <span style={APP_BOX_NOTE}>
              {t("settings.cloud.lastChecked", {
                when: relativeTime(status.lastCheckedAt, now),
              })}
            </span>
          )
        )}
      </div>
      <div class="btns">
        {status.error === "reconnect" && (
          <button class="btn" type="button" disabled={busy} onClick={connect}>
            {t("cloud.reconnect")}
          </button>
        )}
        <button
          class="btn"
          type="button"
          disabled={busy}
          onClick={() => props.onCloud({ type: "cloudDisconnect" })}
        >
          {t("cloud.disconnect")}
        </button>
      </div>
    </div>
  );
}

/** Whether the phone app's cloud card shows: a provider to offer or the connected one. */
const appCloudShown = (cloud: CloudView | undefined): cloud is AppCloudView =>
  cloud?.kind === "offer" || cloud?.kind === "connected";

/**
 * "Sync and backup"; only "Backup" where nothing is synced (the phone app) and no
 * cloud storage can be connected either.
 */
export function syncSectionLabel(
  env: Pick<BrowserEnv, "sync">,
  cloud: CloudView | undefined,
): MessageKey {
  return env.sync.kind === "device" && !appCloudShown(cloud)
    ? "settings.section.backup"
    : "settings.section.sync";
}

export function SyncSection(
  props: SectionProps & {
    deps: BackupDeps;
    env: Pick<BrowserEnv, "name" | "sync" | "features">;
    sync: SyncStatus | undefined;
    /** Undefined until the cloud status is known. */
    cloud: CloudView | undefined;
    /** Connects or disconnects; resolves once the background is done. */
    onCloud: (request: CloudRequest) => Promise<unknown>;
    now: number;
    /** An export was downloaded. */
    onExported: () => void;
  },
) {
  const { env, deps, cloud } = props;
  const [lastExport, setLastExport] = useState<number | null>(null);
  const [note, setNote] = useState<BackupNote>(null);
  const [busy, setBusy] = useState(false);
  const refreshLastExport = () =>
    deps
      .send({ type: "lastExport" })
      .then(setLastExport, (error: unknown) => console.warn("Langle:", error));
  useEffect(() => void refreshLastExport(), []);

  function onCloud(request: CloudRequest) {
    setBusy(true);
    void props.onCloud(request).finally(() => setBusy(false));
  }

  const provider =
    cloud && cloud.kind !== "unavailable" ? cloud.name : undefined;
  /**
   * None where nothing is synced (the phone app): no browser-sync rows, and the cloud
   * card only where the app can sign in (`cloudView`'s `app`).
   */
  const syncName =
    env.sync.kind === "browser" ? browserSyncName(env.sync.browser) : undefined;
  const lastExportLine =
    lastExport === null
      ? t("settings.backup.never")
      : t("settings.backup.lastExport", {
          when: relativeTime(lastExport, props.now),
        });
  const backupButtons = (
    <BackupButtons
      deps={deps}
      class="btn"
      onNote={setNote}
      onExported={() => {
        props.onExported();
        void refreshLastExport();
      }}
    />
  );
  if (syncName === undefined) {
    const appCloud = appCloudShown(cloud) ? cloud : undefined;
    return (
      <Section
        id="sync"
        label={syncSectionLabel(env, cloud)}
        lead={
          appCloud
            ? t("settings.sync.leadDeviceCloud", { provider: appCloud.name })
            : t("settings.sync.leadDevice")
        }
      >
        {appCloud && (
          <AppCloudCard
            view={appCloud}
            now={props.now}
            busy={busy}
            onCloud={onCloud}
          />
        )}
        <div class="stack">
          <RowLabel
            title={t("settings.backup.title")}
            desc={`${t("settings.backup.desc")} ${lastExportLine}`}
          >
            <BackupStatus note={note} lineHeight={1.45} />
          </RowLabel>
          <div class="btns">{backupButtons}</div>
        </div>
      </Section>
    );
  }
  return (
    <Section
      id="sync"
      label={syncSectionLabel(env, cloud)}
      lead={
        provider
          ? t("settings.sync.leadCloud", { syncName, provider })
          : t("settings.sync.lead", { syncName })
      }
    >
      {cloud?.kind === "connected" ? (
        <ConnectedRows
          view={cloud}
          now={props.now}
          busy={busy}
          onCloud={onCloud}
        />
      ) : (
        <BrowserSyncRows
          settings={props.settings}
          change={props.change}
          browser={env.name}
          syncName={syncName}
          sync={props.sync}
          now={props.now}
        />
      )}
      <div class="row">
        <RowLabel
          title={t("settings.backup.title")}
          desc={`${t("settings.backup.desc")} ${lastExportLine}`}
        >
          <BackupStatus note={note} lineHeight={1.45} />
        </RowLabel>
        {backupButtons}
      </div>
      {cloud && cloud.kind !== "connected" && (
        <ConnectRow
          view={cloud}
          syncName={syncName}
          features={env.features}
          busy={busy}
          onCloud={onCloud}
        />
      )}
    </Section>
  );
}
