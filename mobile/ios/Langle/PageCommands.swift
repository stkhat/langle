/// The named commands the shell runs in a browsing page, in Langle's world (it shares the DOM
/// with the page, not its globals); `page.evaluate` takes them as async function bodies.
enum PageCommands {
  /// The page's `og:site_name` ("" without one): the title bar's site.
  static let siteName = #"""
    const meta = document.querySelector('meta[property="og:site_name"]');
    return meta?.getAttribute("content") ?? "";
    """#

  /// The page's `rel=canonical` address ("" without one): Continue may name the page by it.
  static let canonical = #"""
    return document.querySelector('link[rel="canonical"]')?.href ?? "";
    """#

  /// Leaving the page for Home: its videos and sounds stop playing.
  static let pauseMedia = #"""
    let paused = 0;
    for (const media of document.querySelectorAll("video, audio")) {
      if (!media.paused) {
        media.pause();
        paused += 1;
      }
    }
    return paused;
    """#
}
