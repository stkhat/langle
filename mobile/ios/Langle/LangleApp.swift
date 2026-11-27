import LangleCore
import SwiftUI

/// The app's screens (docs/plans/mobile-app.md M4c): Home, Words and Settings under the tab bar,
/// a page opened from Home under its title bar, the first run full screen, and app pages in the
/// sheet frame over the page. Every page made stays in the window, hidden while another screen
/// shows, so a page left for Home keeps its place.
///   xcrun simctl launch booted dev.langle.app [-url <page>] [-reset 1]
@main
struct LangleApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
  @StateObject private var model = AppModel()
  @Environment(\.scenePhase) private var scenePhase

  var body: some Scene {
    WindowGroup {
      ShellView(model: model)
        .task { await model.start() }
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .background { model.leftScreen() }
      if phase == .active { model.cameOnScreen() }
    }
  }
}

struct ShellView: View {
  @ObservedObject var model: AppModel

  var body: some View {
    ZStack {
      HostSlot(view: model.hostView).frame(width: 0, height: 0)
      TranslatorConsent(translation: model.translation)
      if model.started {
        tabsScreen.shown(isTab)
        pageScreen.shown(model.screen == .page)
        if let firstRun = model.firstRun {
          PageContainer(page: firstRun.page.view)
            .ignoresSafeArea()
            .shown(model.screen == .firstRun)
        }
      } else {
        Color.white.ignoresSafeArea()
      }
      if let sheet = model.sheet {
        SheetFrame(sheet: sheet, closeLabel: model.strings["app.closeSheet"], close: model.closeSheet).zIndex(1)
      }
    }
    .animation(.easeOut(duration: 0.25), value: model.sheet?.id)
    // The app's own fullscreen: the page alone, no status bar or home indicator.
    .statusBarHidden(model.fullscreen)
    .persistentSystemOverlays(model.fullscreen ? .hidden : .automatic)
  }

  private var isTab: Bool {
    if case .tab = model.screen { return true }
    return false
  }

  private var currentTab: AppTab? {
    if case .tab(let tab) = model.screen { return tab }
    return nil
  }

  /// Home, Words or Settings: the app page under the status bar (its background behind it), the
  /// tab bar under it.
  private var tabsScreen: some View {
    VStack(spacing: 0) {
      ZStack {
        ForEach(AppTab.allCases, id: \.self) { tab in
          if let page = model.tabPages[tab] {
            PageContainer(page: page.page.view).shown(currentTab == tab)
          }
        }
      }
      .ignoresSafeArea(edges: .top)
      TabBar(current: currentTab, strings: model.strings, select: model.select)
        .environment(\.layoutDirection, direction)
    }
  }

  private var edgeBack: (() -> Void)? {
    guard model.edgeBackEnabled else { return nil }
    let model = self.model
    return { model.back() }
  }

  /// A page over Home: the title bar (it slides away while the page scrolls down), the page.
  private var pageScreen: some View {
    // Under ⋮: the right edge, the left in Arabic (the page itself is not mirrored).
    ZStack(alignment: model.strings.rtl ? .topLeading : .topTrailing) {
      pageColumn
      // ⋮'s menu: a tap anywhere else closes it (and reaches nothing under it).
      if model.menuOpen, model.barShown, !model.fullscreen {
        Color.white.opacity(0.001).ignoresSafeArea().onTapGesture { model.menuOpen = false }
        MoreMenu(model: model).environment(\.layoutDirection, direction)
          .padding(.top, 58).padding(model.strings.rtl ? .leading : .trailing, 8)
      }
    }
  }

  /// The interface language's direction, for the native bars and the menu only: the pages lay
  /// themselves out. Arabic mirrors them.
  private var direction: LayoutDirection { model.strings.rtl ? .rightToLeft : .leftToRight }

  private var pageColumn: some View {
    VStack(spacing: 0) {
      if let reasons = model.refusal, !model.fullscreen {
        Text(model.strings.format("app.buildRefused", ["reasons": reasons])).font(.footnote).foregroundStyle(Palette.muted).padding(8)
      }
      if model.barShown, !model.fullscreen {
        TitleBar(model: model).environment(\.layoutDirection, direction).transition(.move(edge: .top))
      }
      PageContainer(page: model.browsing.page.view, edgeBack: edgeBack)
      .ignoresSafeArea(edges: model.fullscreen ? .all : .bottom)
    }
    // White under the status bar too, as the bar's own.
    .background { Color.white.ignoresSafeArea() }
    .animation(.easeOut(duration: 0.2), value: model.barShown)
  }
}

extension View {
  /// A screen kept in the window while another one shows.
  func shown(_ on: Bool) -> some View {
    opacity(on ? 1 : 0).allowsHitTesting(on).accessibilityHidden(!on)
  }
}

/// The view the extension host's zero-size slot sits in.
struct HostSlot: UIViewRepresentable {
  let view: UIView
  func makeUIView(context: Context) -> UIView { view }
  func updateUIView(_ view: UIView, context: Context) {}
}

/// A page's view. With `edgeBack`, a swipe from the left edge calls it: on a page's first history
/// entry, where WebKit's own back swipe has nowhere to go (a pan on the container; spike M3e saw
/// UIScreenEdgePanGestureRecognizer never fire on the Simulator).
struct PageContainer: UIViewRepresentable {
  let page: UIView
  var edgeBack: (() -> Void)?

  func makeCoordinator() -> EdgeBack { EdgeBack() }

  func makeUIView(context: Context) -> UIView {
    let container = UIView()
    let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(EdgeBack.pan(_:)))
    pan.delegate = context.coordinator
    container.addGestureRecognizer(pan)
    update(container, context.coordinator)
    return container
  }

  func updateUIView(_ container: UIView, context: Context) { update(container, context.coordinator) }

  private func update(_ container: UIView, _ coordinator: EdgeBack) {
    coordinator.action = edgeBack
    if page.superview !== container {
      container.subviews.forEach { $0.removeFromSuperview() }
      page.removeFromSuperview()
      page.frame = container.bounds
      page.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      container.addSubview(page)
    }
  }

  @MainActor
  final class EdgeBack: NSObject, UIGestureRecognizerDelegate {
    var action: (() -> Void)?

    @objc func pan(_ pan: UIPanGestureRecognizer) {
      guard pan.state == .ended, let view = pan.view else { return }
      let moved = pan.translation(in: view)
      if moved.x >= 80, abs(moved.y) < moved.x { action?() }
    }

    func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
      guard action != nil, let view = recognizer.view else { return false }
      return recognizer.location(in: view).x <= 24
    }

    func gestureRecognizer(
      _ recognizer: UIGestureRecognizer,
      shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool { true }
  }
}

/// The window stays in portrait, and turns to landscape while the browsing page is in fullscreen
/// (docs/specs/mobile-app.md "The WebViews' fullscreen"). Info.plist lists portrait and both
/// landscapes, so that landscape is possible at all; this mask narrows them.
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {
  static var orientations: UIInterfaceOrientationMask = .portrait

  func application(
    _ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?
  ) -> UIInterfaceOrientationMask {
    Self.orientations
  }
}

@MainActor
enum Orientation {
  /// Landscape while a page is in fullscreen, portrait again after; every window of the scene
  /// (WebKit's fullscreen window among them) is told to ask again.
  static func fullscreen(_ on: Bool) {
    AppDelegate.orientations = on ? .landscape : .portrait
    for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
      for window in scene.windows {
        window.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
      }
      scene.requestGeometryUpdate(.iOS(interfaceOrientations: AppDelegate.orientations)) { error in
        Log.app.info("orientation not changed: \(error.localizedDescription, privacy: .public)")
      }
    }
  }

  /// The scene's orientation and size, for `check.sh`.
  static var current: String {
    guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first
    else { return "no scene" }
    let landscape = scene.effectiveGeometry.interfaceOrientation.isLandscape
    let size = scene.effectiveGeometry.coordinateSpace.bounds.size
    return "orientation=\(landscape ? "landscape" : "portrait") window=\(Int(size.width))x\(Int(size.height))"
  }
}

/// Calls `back` when the device is turned to portrait after it was seen in landscape: in
/// fullscreen the window is turned to landscape whatever way the phone is held, so only a turn
/// back after a turn to landscape means "leave".
@MainActor
final class RotationWatch {
  private var sawLandscape = false
  private var observer: NSObjectProtocol?

  init(back: @escaping @MainActor () -> Void) {
    UIDevice.current.beginGeneratingDeviceOrientationNotifications()
    observer = NotificationCenter.default.addObserver(
      forName: UIDevice.orientationDidChangeNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated {
        guard let self else { return }
        let now = UIDevice.current.orientation
        if now.isLandscape {
          self.sawLandscape = true
        } else if now == .portrait, self.sawLandscape {
          self.sawLandscape = false
          back()
        }
      }
    }
  }

  deinit {
    if let observer { NotificationCenter.default.removeObserver(observer) }
    MainActor.assumeIsolated { UIDevice.current.endGeneratingDeviceOrientationNotifications() }
  }
}
