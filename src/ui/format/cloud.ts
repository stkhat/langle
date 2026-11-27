import {
  CLOUD_PROVIDER_NAMES,
  type CloudProviderId,
} from "../../core/cloud/provider";
import type { BrowserEnv, SyncPlace } from "../../core/browser-env";
import type { Settings } from "../../core/settings";
import { t } from "../../i18n/t";
import type { CloudStatus } from "../../messaging/protocol";
import { megabytesTenths } from "./format";

/**
 * How the user's own cloud storage stands on this device (mock CloudSync):
 * - `unavailable`: this build can connect to no provider (production for now), so the
 *   row says "Coming later"
 * - `offer`: no device chose a provider; Settings offers "Connect <provider>"
 * - `too`: the synced `cloudProvider` names one this device is not connected to:
 *   "Connect <provider> on this device too"
 * - `connected`: this device syncs through it (`status.error` says what stopped it)
 */
export type CloudView =
  | { kind: "unavailable" }
  | { kind: "offer" | "too"; provider: CloudProviderId; name: string }
  | {
      kind: "connected";
      provider: CloudProviderId;
      name: string;
      status: CloudStatus;
    };

/**
 * The phone app (`SyncPlace` `device`), and whether its shell signs in to Google
 * (`BrowserEnv.features.appGoogleAuth`).
 */
export interface AppCloud {
  googleAuth: boolean;
}

/** `app` for `cloudView`: set only where nothing is synced (the phone app). */
export function appCloud(env: {
  sync: SyncPlace;
  features: Pick<BrowserEnv["features"], "appGoogleAuth">;
}): AppCloud | undefined {
  return env.sync.kind === "device"
    ? { googleAuth: env.features.appGoogleAuth }
    : undefined;
}

/**
 * Undefined until both the status and the settings are known. In the phone app
 * (`app`), a provider can be connected only where its shell signs in
 * (`appHost.googleAuth`), and "on this device too" never shows: no browser sync
 * brings another device's choice there (mobile-app.md "M7").
 */
export function cloudView(
  status: CloudStatus | undefined,
  settings: Pick<Settings, "cloudProvider"> | undefined,
  app?: AppCloud,
): CloudView | undefined {
  if (!status || !settings) return undefined;
  const named = (provider: CloudProviderId) => ({
    provider,
    name: CLOUD_PROVIDER_NAMES[provider],
  });
  if (app && !app.googleAuth) return { kind: "unavailable" };
  if (status.provider)
    return { kind: "connected", ...named(status.provider), status };
  const chosen = settings.cloudProvider;
  if (!app && chosen !== "none" && status.available.includes(chosen))
    return { kind: "too", ...named(chosen) };
  const first = status.available[0];
  return first ? { kind: "offer", ...named(first) } : { kind: "unavailable" };
}

/**
 * What Settings says under "Your own cloud storage" while connected: the provider and
 * the account ("Google Drive (alex.kim@gmail.com). Everything is saved there, …"), the
 * provider alone until the account is known.
 */
export function cloudConnectedDesc(
  status: Pick<CloudStatus, "account">,
  name: string,
): string {
  return status.account === undefined
    ? t("settings.cloud.connected", { provider: name })
    : t("settings.cloud.connectedAccount", {
        provider: name,
        account: status.account,
      });
}

/** "1.4 MB · 3 devices"; nothing before the first list or write. */
export function cloudSizeLine(
  status: Pick<CloudStatus, "bytes" | "devices">,
): string {
  if (status.devices === 0) return "";
  return t("cloud.size", {
    size: megabytesTenths(status.bytes),
    devices:
      status.devices === 1
        ? t("cloud.oneDevice")
        : t("cloud.devices", { count: status.devices }),
  });
}

/**
 * The red line for what stopped saving or reading ("Reconnect needed", storage full,
 * update needed); none while it works. A retry is not shown: it goes on by itself.
 * `phone`: the phone app, which says "this phone" for "this device".
 */
export function cloudErrorLine(
  status: Pick<CloudStatus, "error">,
  name: string,
  phone = false,
): string | undefined {
  switch (status.error) {
    case "reconnect":
      return t("cloud.error.reconnect");
    case "full":
      return t("cloud.error.full", { provider: name });
    case "update":
      return t(phone ? "cloud.error.updatePhone" : "cloud.error.update");
    default:
      return undefined;
  }
}
