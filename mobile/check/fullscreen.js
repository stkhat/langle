/**
 * `check.sh fullscreen` in both shells runs this in Langle's world on the browsing page (the
 * script is this function followed by `return fullscreenProbe();`).
 * - The first call puts a test element next to the page's largest video, inside the player, where
 *   Langle's overlay goes. It is created from Langle's world, as Langle's own elements are, and
 *   stays, so a call after the fullscreen button shows where it went.
 * - It reports the page's fullscreen element (and whether the video is in the system's own video
 *   fullscreen), the screen's orientation and size, and whether the test element is inside the
 *   fullscreen element, on screen, and on top at its centre.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- called by the script check.sh builds
function fullscreenProbe() {
  const id = "langle-fullscreen-probe";
  const box = (element) => {
    const r = element.getBoundingClientRect();
    return {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };
  const area = (element) => box(element).width * box(element).height;
  const describe = (element) =>
    element
      ? element.tagName.toLowerCase() +
        (element.id ? `#${element.id}` : "") +
        [...element.classList]
          .slice(0, 3)
          .map((name) => `.${name}`)
          .join("")
      : null;

  const video =
    [...document.querySelectorAll("video")].sort(
      (a, b) => area(b) - area(a),
    )[0] ?? null;
  let probe = document.getElementById(id);
  if (!probe && video?.parentElement) {
    probe = document.createElement("div");
    probe.id = id;
    probe.style.cssText =
      "position:absolute;left:12px;top:12px;width:48px;height:48px;background:#e5484d;" +
      "z-index:2147483647;pointer-events:none";
    video.parentElement.append(probe);
  }

  const fullscreen =
    document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
  let probeReport = null;
  if (probe) {
    const r = box(probe);
    const onScreen =
      r.width > 0 &&
      r.height > 0 &&
      r.x < innerWidth &&
      r.y < innerHeight &&
      r.x + r.width > 0 &&
      r.y + r.height > 0;
    let onTop = false;
    if (onScreen) {
      probe.style.pointerEvents = "auto";
      onTop =
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) ===
        probe;
      probe.style.pointerEvents = "none";
    }
    probeReport = {
      parent: describe(probe.parentElement),
      box: r,
      inFullscreenElement: fullscreen ? fullscreen.contains(probe) : null,
      onScreen,
      onTop,
    };
  }

  return JSON.stringify({
    url: location.href,
    fullscreenElement: describe(fullscreen),
    fullscreenBox: fullscreen ? box(fullscreen) : null,
    videoNativeFullscreen: video?.webkitDisplayingFullscreen ?? null,
    orientation:
      screen.orientation?.type ??
      (matchMedia("(orientation: landscape)").matches
        ? "landscape"
        : "portrait"),
    screen: `${screen.width}x${screen.height}`,
    viewport: `${innerWidth}x${innerHeight}`,
    video: video
      ? { parent: describe(video.parentElement), box: box(video) }
      : null,
    probe: probeReport,
  });
}
