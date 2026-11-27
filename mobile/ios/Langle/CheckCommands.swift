#if DEBUG
  import Foundation
  import LangleCore

  /// Debug builds only: commands from `check.sh` as Darwin notifications (`notifyutil -p
  /// dev.langle.app.<name>`), with results in the unified log (subsystem dev.langle.app, category
  /// check), as the prototypes did.
  /// - `errors`, `clear-errors`: the check build's error log (`checkErrorLog` in `storage.local`),
  ///   read and cleared through the extension host's `browser.storage`;
  /// - `eval`: runs `Documents/eval.json` (`{ "target": "host" | "page" | "langle" | "sheet" |
  ///   "first" | "tab", "source": "<function body>" }`) and logs what it returns; `first` is the
  ///   first run's page, `tab` the shown tab's page;
  /// - `state`: the screen, the title bar's text, whether it shows, the tabs, the sheet and whether
  ///   the host said hello, and whether the page is in fullscreen, the orientation and the window
  ///   size;
  /// - `translate-state`: whether the translation engine runs and for which pairs, whether it is
  ///   off after failures, and the pages' translation calls since the launch by kind (`translate`,
  ///   `translate-list` for `start: false`, `translatorStatus`, `prepareTranslator`);
  /// - `adblock`: whether the ad-blocking engine is loaded, when the lists were last all current,
  ///   whether some are due, the switches, the WebKit rule lists in use, whether the page gets
  ///   blocking and its document-start scripts (world:length);
  /// - `adblock-update`: fetches every list now (conditional requests), whether due or not;
  /// - `home`, `words`, `settings`, `back-home` (‹), `edge-back` (the edge swipe), `langle` (L),
  ///   `close-sheet`, `more` (⋮, opens or closes its menu), `more-ads` (the menu's "Block ads on
  ///   this site"): the shell's native controls, for checks without taps.
  @MainActor
  final class CheckCommands {
    static let shared = CheckCommands()
    private weak var model: AppModel?
    private static let names = [
      "errors", "clear-errors", "eval", "state", "translate-state", "home", "words", "settings",
      "back-home", "edge-back", "langle", "close-sheet", "more", "more-ads", "adblock",
      "adblock-update",
    ]

    func start(model: AppModel) {
      self.model = model
      let center = CFNotificationCenterGetDarwinNotifyCenter()
      for name in Self.names {
        CFNotificationCenterAddObserver(
          center, nil,
          { _, _, name, _, _ in
            guard let name = name?.rawValue as String? else { return }
            let command = String(name.dropFirst("dev.langle.app.".count))
            DispatchQueue.main.async {
              MainActor.assumeIsolated { CheckCommands.shared.run(command) }
            }
          }, "dev.langle.app.\(name)" as CFString, nil, .deliverImmediately)
      }
      say("ready")
    }

    private func say(_ text: String) {
      Log.check.info("\(text, privacy: .public)")
    }

    func run(_ command: String) {
      guard let model else { return }
      Task {
        switch command {
        case "errors":
          let log = await model.host?.evaluate(
            #"return JSON.stringify((await browser.storage.local.get("checkErrorLog")).checkErrorLog ?? [])"#)
          say("errors \(log ?? "no host")")
        case "clear-errors":
          let done = await model.host?.evaluate(
            #"await browser.storage.local.remove("checkErrorLog"); return "cleared""#)
          say("clear-errors \(done ?? "no host")")
        case "eval":
          say("eval \(await evaluateFile(model))")
        case "state":
          let tabs = model.router.tabs.all.map { "\($0.id)\($0.active ? "*" : "") \($0.url)" }
          say(
            "state screen=\(model.screen) title=\"\(model.title)\" site=\"\(model.site)\" bar=\(model.barShown) back=\(model.canGoBack) host=\(model.host?.isReady ?? false) tabs=[\(tabs.joined(separator: ", "))] sheet=\(model.sheet?.context.page.url?.absoluteString ?? "none") page=\(model.browsing.page.url?.absoluteString ?? "none") fullscreen=\(model.fullscreen) held=\(model.shell.heldShare ?? "none") \(Orientation.current)"
          )
        case "translate-state":
          say("translate-state \(model.translationState)")
        // The shell's native controls, for checks without taps.
        case "home", "words", "settings":
          model.select(AppTab(rawValue: command)!)
          say("\(command) done")
        case "back-home":
          model.goHome()
          say("back-home done")
        case "edge-back":
          model.back()
          say("edge-back done")
        case "langle":
          model.openLangle()
          say("langle \(model.sheet != nil)")
        case "close-sheet":
          model.closeSheet()
          say("close-sheet done")
        case "more":
          if model.pageURL != nil { model.menuOpen.toggle() }
          say("more open=\(model.menuOpen) ads=\(model.adSwitch.map { "\($0.site):\($0.blocking)" } ?? "none")")
        case "more-ads":
          guard let ads = model.adSwitch else { return say("more-ads none") }
          model.menuOpen = false
          model.setSiteBlocking(!ads.blocking)
          say("more-ads \(ads.site) blocking=\(!ads.blocking)")
        case "adblock":
          guard let blocker = model.adBlocker else { return say("adblock none") }
          let page = model.browsing.page.url
          let scripts = page.map { blocker.documentScripts($0).map { "\($0.world):\($0.source.count)" } } ?? []
          say(
            "adblock engine=\(blocker.store.engine != nil) updatedAt=\(blocker.store.updatedAt().map { String(Int64($0)) } ?? "none") due=\(blocker.store.isDue()) switches=\(blocker.switches.value.json) ruleLists=\(blocker.rules.all.count) pageBlocks=\(page.map(blocker.blocks) ?? false) scripts=[\(scripts.joined(separator: ", "))]"
          )
        case "adblock-update":
          guard let blocker = model.adBlocker else { return say("adblock-update none") }
          blocker.store.update(force: true)
          say("adblock-update started")
        default:
          say("unknown command \(command)")
        }
      }
    }

    private func evaluateFile(_ model: AppModel) async -> String {
      let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("eval.json")
      guard let text = try? String(contentsOf: file, encoding: .utf8),
        let request = try? JSONValue.parse(text), let source = request["source"]?.string
      else { return "no Documents/eval.json" }
      switch request["target"]?.string {
      case "host": return await model.host?.evaluate(source) ?? "no host"
      case "page": return await model.browsing.page.evaluate(world: .page, source: source)
      case "langle": return await model.browsing.page.evaluate(world: .langle, source: source)
      case "first":
        return await model.firstRun?.page.evaluate(world: .page, source: source) ?? "no first run"
      case "tab":
        guard case .tab(let tab) = model.screen else { return "no tab screen" }
        return await model.tabPages[tab]?.page.evaluate(world: .page, source: source) ?? "no tab page"
      case "sheet":
        return await model.sheet?.context.page.evaluate(world: .page, source: source) ?? "no sheet"
      default: return "unknown target"
      }
    }
  }
#endif
