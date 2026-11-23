import LangleCore
import SwiftUI

/// The app's one window: a browsing page (tab 1), the extension host, and app pages in a sheet.
/// It does for the router what its actions ask (docs/specs/mobile-app.md "Shim surface").
@MainActor
final class AppModel: ObservableObject {
  /// An app page in the sheet: the Langle sheet (`popup.html`, no tab), or a page opened by
  /// `tabs.create` / `runtime.openOptionsPage` (with its tab).
  final class Sheet: Identifiable {
    let id = UUID()
    let tabId: Int?
    let context: ContextPage
    init(tabId: Int?, context: ContextPage) {
      self.tabId = tabId
      self.context = context
    }
  }

  @Published var address = ""
  @Published var canGoBack = false
  @Published var canGoForward = false
  @Published var sheet: Sheet? {
    didSet { if let sheet { shown = sheet } }
  }
  @Published private(set) var started = false
  /// Why Langle does not run (no build, or one the app refuses); browsing still works.
  @Published var refusal: String?

  private(set) var engine: WebKitEngine!
  private(set) var router: Router!
  private(set) var host: ExtensionHost?
  private(set) var browsing: ContextPage!
  private(set) var browsingTab = 0
  private var injector: ContentInjector?
  private var nextSheet: Sheet?
  /// The sheet on screen, until its dismissal is done.
  private var shown: Sheet?
  private let hostSlot = UIView(frame: .zero)

  /// The view the host's slot sits in (zero size, in the window).
  var hostView: UIView { host?.slot ?? hostSlot }

  static let buildFolder = Bundle.main.resourceURL!.appendingPathComponent("langle-app")
  static let storeFolder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("LangleStore")

  func start(arguments: UserDefaults = .standard) async {
    if arguments.bool(forKey: "reset") {
      try? FileManager.default.removeItem(at: Self.storeFolder)
      await WebKitEngine.removeAppStore()
      Log.app.info("app data reset")
    }
    let handler = AppSchemeHandler(root: Self.buildFolder)
    engine = WebKitEngine(schemeHandler: handler)
    var manifest: Manifest?
    do {
      guard let data = handler.file("/manifest.json") else {
        throw Manifest.Refusal(unsupported: ["no bundled build (scripts/bundle-build.sh)"])
      }
      manifest = try Manifest.read(String(decoding: data, as: UTF8.self))
    } catch {
      refusal = "\(error)"
      Log.app.error("Langle does not run: \(String(describing: error), privacy: .public)")
    }
    router = Router(
      options: .init(origin: AppSchemeHandler.origin, version: manifest?.version ?? "0"),
      persistence: FilePersistence(directory: Self.storeFolder), clock: DispatchClock())
    router.onError = { Log.bridge.error("\($0, privacy: .public)") }
    router.onAction = { [weak self] in self?.perform($0) }

    if let manifest {
      let injector = ContentInjector(manifest: manifest, read: handler.file)
      self.injector = injector
      handler.generated["/host.html"] = injector.hostPage()
      let host = ExtensionHost(engine: engine, router: router, injector: injector)
      host.onRecreated = { [weak self] in self?.reloadPages() }
      self.host = host
      host.start()
    }

    let start = arguments.string(forKey: "url") ?? "about:blank"
    browsingTab = router.openTab(url: start)
    let tabId = browsingTab
    let injector = self.injector
    browsing = ContextPage(
      engine: engine, profile: .browsing, router: router, world: .langle,
      spec: { _ in .content(tabId: tabId) },
      scripts: { injector?.webPageScripts(for: $0) ?? [] })
    browsing.onCommit = { [weak self] url in self?.router.tabs.setURL(tabId, url.absoluteString) }
    browsing.onNavigate = { [weak self] url, _, back, forward in
      guard let self else { return }
      if let url, url.absoluteString != "about:blank" {
        address = url.absoluteString
        router.tabs.setURL(tabId, url.absoluteString)
      }
      canGoBack = back
      canGoForward = forward
    }
    browsing.onProcessGone = { [weak self] in self?.browsing.page.reload() }
    if let url = URL(string: start) { browsing.load(url) }
    started = true
    #if DEBUG
      CheckCommands.shared.start(model: self)
    #endif
  }

  // MARK: the shell

  func go(_ text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    guard !trimmed.isEmpty else { return }
    let url = trimmed.contains("://") ? URL(string: trimmed) : URL(string: "https://\(trimmed)")
    if let url { browsing.load(url) }
  }

  func goBack() { browsing.page.goBack() }
  func goForward() { browsing.page.goForward() }

  /// The Langle button: the popup in the sheet.
  func openPopup() {
    guard injector != nil else { return }
    present(url: "\(AppSchemeHandler.origin)/popup.html", tabId: nil)
  }

  /// The sheet went away (the user swiped it down, or the router closed its tab).
  func sheetDismissed() {
    guard let dismissed = shown else { return }
    shown = nil
    close(dismissed)
    if let next = nextSheet {
      nextSheet = nil
      // After the dismissal: SwiftUI presents one sheet at a time.
      DispatchQueue.main.async { self.sheet = next }
    }
  }

  private func close(_ dismissed: Sheet) {
    dismissed.context.close()
    if let tabId = dismissed.tabId, router.tabs.get(tabId) != nil {
      router.tabs.remove(tabId)
    }
    router.tabs.activate(browsingTab)
  }

  // MARK: router actions

  private func perform(_ action: RouterAction) {
    Log.app.info("router: \(String(describing: action), privacy: .public)")
    switch action {
    case .openTab(let tab):
      if tab.url.hasPrefix("\(AppSchemeHandler.origin)/") {
        present(url: tab.url, tabId: tab.id)
      } else if let url = URL(string: tab.url) {
        // One browsing page: a web page opened in a new tab opens there.
        router.tabs.remove(tab.id)
        router.tabs.activate(browsingTab)
        browsing.load(url)
      }
    case .navigateTab(let tab):
      guard let url = URL(string: tab.url) else { return }
      if tab.id == browsingTab {
        browsing.load(url)
      } else if let sheet, sheet.tabId == tab.id {
        sheet.context.load(url)
      }
    case .activateTab:
      break
    case .closeTab(let tab):
      if let sheet, sheet.tabId == tab.id { self.sheet = nil }
      if nextSheet?.tabId == tab.id { nextSheet = nil }
    case .reloadTab(let id):
      if id == browsingTab {
        browsing.page.reload()
      } else if let sheet, sheet.tabId == id {
        sheet.context.page.reload()
      }
    case .openPopup:
      openPopup()
    case .reloadHost:
      host?.reload()
    }
  }

  private func present(url: String, tabId: Int?) {
    guard let injector, let target = URL(string: url) else { return }
    let context = ContextPage(
      engine: engine, profile: .app, router: router, world: .page,
      spec: { .page(url: $0.absoluteString, tabId: tabId) },
      scripts: { _ in injector.appPageScripts() })
    context.load(target)
    let next = Sheet(tabId: tabId, context: context)
    if sheet == nil {
      sheet = next
    } else {
      // Replaces the open sheet once it is dismissed.
      if let waiting = nextSheet { close(waiting) }
      nextSheet = next
      sheet = nil
    }
  }

  /// After the host came back: the pages reload, as a browser restores crashed tabs.
  private func reloadPages() {
    browsing.page.reload()
    sheet?.context.page.reload()
  }
}

/// Timers on the main queue, while the app runs.
final class DispatchClock: Clock {
  func now() -> Double { Date().timeIntervalSince1970 * 1000 }

  func schedule(after ms: Double, _ run: @escaping () -> Void) -> AnyObject {
    let item = DispatchWorkItem(block: run)
    DispatchQueue.main.asyncAfter(deadline: .now() + ms / 1000, execute: item)
    return item
  }

  func cancel(_ token: AnyObject) { (token as? DispatchWorkItem)?.cancel() }
}
