import type { Settings } from "../core/settings";
import type { SetupStage } from "../core/setup";
import { serial } from "../core/util";

/** The toolbar icon's sizes, as `public/icon/` and `public/icon-off/` hold them. */
const SIZES = [16, 32, 48, 128] as const;

/**
 * The toolbar icon's files: the colored mark (the manifest's icons) while Langle is on, the
 * gray one from `public/icon-off/` while it is switched off or not set up.
 */
export function toolbarIconPaths(enabled: boolean): Record<number, string> {
  const dir = enabled ? "icon" : "icon-off";
  return Object.fromEntries(SIZES.map((size) => [size, `/${dir}/${size}.png`]));
}

/** What following the setting needs; the background passes the browser's. */
export interface ToolbarIconDeps {
  /** `action.setIcon({ path })`. */
  setIcon(path: Record<number, string>): Promise<void>;
  getSettings(): Promise<Settings>;
  getSetupStage(): Promise<SetupStage>;
  watchSetupStage(listener: (stage: SetupStage) => void): () => void;
  watchSettings(
    listener: (settings: Settings, previous: Settings) => void,
  ): () => void;
  /** `runtime.onStartup`: the browser resets the icon to the manifest's on a restart. */
  onStartup: { addListener(listener: () => void): void };
}

/**
 * Keeps the toolbar icon gray while Langle is switched off or not set up (the settings
 * are then not read): set from what is stored now and at each browser start, and again
 * whenever the setup or `enabled` changes (on any device). Registers its listeners
 * synchronously, so a change that wakes the worker is heard. Returns an unwatch.
 */
export function followToolbarIcon(deps: ToolbarIconDeps): () => void {
  // One after another, so the last change is the icon's last state.
  const applies = serial();
  const applyStored = () => {
    applies
      .run(async () => {
        const on =
          (await deps.getSetupStage()) === "ready" &&
          (await deps.getSettings()).enabled;
        await deps.setIcon(toolbarIconPaths(on));
      })
      .catch((error: unknown) => console.error(error));
  };
  deps.onStartup.addListener(applyStored);
  const unwatchSetup = deps.watchSetupStage(applyStored);
  const unwatchSettings = deps.watchSettings((settings, previous) => {
    if (settings.enabled !== previous.enabled) applyStored();
  });
  applyStored();
  return () => {
    unwatchSetup();
    unwatchSettings();
  };
}
