import { appHostOf } from "../../core/app-host";

/**
 * Hands `text` to the user as a file named `fileName` of media type `type`: every export
 * (backup, Anki, CSV) saves through here. In the phone app, whose pages have no downloads,
 * it goes to the phone's share sheet (`appHost.shareFile`); elsewhere it is a download
 * through a Blob URL (needs no permission).
 */
export async function saveFile(
  fileName: string,
  text: string,
  type = "application/json",
  g: object = globalThis,
): Promise<void> {
  const app = appHostOf(g);
  if (app) return app.shareFile({ name: fileName, mime: type, text });
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Firefox reads the URL after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
