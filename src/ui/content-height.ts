import { appHostOf, type AppHost } from "../core/app-host";

/**
 * In the phone app: tells the shell how tall the page's content is
 * (`appHost.contentHeight`, CSS px), now and on every change, once a frame at most. The
 * sheet frame an app page shows in (the Langle sheet) takes that height, as the mock
 * `MobileLangleSheet` sizes the sheet to its content; other frames ignore it. Nothing
 * outside the app. Returns a stop.
 */
export function reportContentHeight(
  body: HTMLElement = document.body,
  host: AppHost | undefined = appHostOf(),
): () => void {
  const tell = host?.contentHeight;
  if (!tell) return () => {};
  let told = -1;
  let frame: number | undefined;
  const measure = () => {
    frame = undefined;
    const { marginTop, marginBottom } = getComputedStyle(body);
    const height = Math.ceil(
      body.getBoundingClientRect().height +
        (parseFloat(marginTop) || 0) +
        (parseFloat(marginBottom) || 0),
    );
    if (height === told) return;
    told = height;
    tell(height).catch(() => {});
  };
  const observer = new ResizeObserver(() => {
    frame ??= requestAnimationFrame(measure);
  });
  observer.observe(body);
  return () => {
    observer.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
  };
}
