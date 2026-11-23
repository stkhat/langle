import type { Settings } from "../core/settings";
import type { send as Send } from "../messaging/client";
import { THEME_CSS } from "./theme";

/**
 * An extension page (popup, settings, word list) follows the theme setting: the
 * variables go on `<html>`, so the page's own background is themed too. Until the
 * settings answer, the page's `data-langle-theme="system"` (index.html) applies; it
 * stays without `deps`, as before the setup ends (no settings are read then).
 */
export function followTheme(deps?: {
  send: typeof Send;
  watchSettings(listener: (settings: Settings) => void): () => void;
}): void {
  const style = document.createElement("style");
  style.textContent = THEME_CSS;
  document.head.append(style);
  if (!deps) return;
  const apply = (settings: Settings) => {
    document.documentElement.dataset.langleTheme = settings.theme;
  };
  deps.send({ type: "getSettings" }).then(apply, () => {});
  deps.watchSettings(apply);
}
