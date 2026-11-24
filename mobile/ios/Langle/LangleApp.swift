import SwiftUI

/// The minimal shell of milestone M2 (docs/plans/mobile-app.md): an address field, back and
/// forward, one browsing page, and the Langle button opening `popup.html` in a sheet. No styling
/// beyond the system's; the app's real screens come in M4.
///   xcrun simctl launch booted dev.langle.app [-url <page>] [-reset 1]
@main
struct LangleApp: App {
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
  @StateObject private var model = AppModel()

  var body: some Scene {
    WindowGroup {
      ShellView(model: model)
        .task { await model.start() }
    }
  }
}

struct ShellView: View {
  @ObservedObject var model: AppModel
  @State private var typed = ""
  @FocusState private var editing: Bool

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 12) {
        Button(action: model.goBack) { Image(systemName: "chevron.backward") }
          .disabled(!model.canGoBack)
          .accessibilityLabel("Back")
        Button(action: model.goForward) { Image(systemName: "chevron.forward") }
          .disabled(!model.canGoForward)
          .accessibilityLabel("Forward")
        TextField("Address", text: $typed)
          .textFieldStyle(.roundedBorder)
          .keyboardType(.URL)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .submitLabel(.go)
          .focused($editing)
          .onSubmit { model.go(typed) }
        Button("Langle", action: model.openPopup)
          .disabled(model.refusal != nil)
      }
      .padding(.horizontal)
      .padding(.vertical, 8)
      if let refusal = model.refusal {
        Text(refusal).font(.footnote).foregroundStyle(.secondary).padding(.horizontal)
      }
      if model.started {
        PageContainer(page: model.browsing.page.view, host: model.hostView)
      } else {
        Spacer()
      }
    }
    .onChange(of: model.address) { _, address in
      if !editing { typed = address }
    }
    .sheet(item: $model.sheet, onDismiss: model.sheetDismissed) { sheet in
      PageContainer(page: sheet.context.page.view, host: nil)
        .ignoresSafeArea(edges: .bottom)
        .presentationDragIndicator(.visible)
    }
  }
}

/// A page's view, and the extension host's zero-size slot next to it (in the hierarchy).
struct PageContainer: UIViewRepresentable {
  let page: UIView
  let host: UIView?

  func makeUIView(context: Context) -> UIView {
    let container = UIView()
    update(container)
    return container
  }

  func updateUIView(_ container: UIView, context: Context) { update(container) }

  private func update(_ container: UIView) {
    if page.superview !== container {
      // Another page's view (the container showed another page before): it goes.
      for view in container.subviews where view !== host { view.removeFromSuperview() }
      page.removeFromSuperview()
      page.frame = container.bounds
      page.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      container.insertSubview(page, at: 0)
    }
    if let host, host.superview !== container {
      host.removeFromSuperview()
      host.frame = .zero
      container.addSubview(host)
    }
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
