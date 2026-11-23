import SwiftUI

/// The minimal shell of milestone M2 (docs/plans/mobile-app.md): an address field, back and
/// forward, one browsing page, and the Langle button opening `popup.html` in a sheet. No styling
/// beyond the system's; the app's real screens come in M4.
///   xcrun simctl launch booted dev.langle.app [-url <page>] [-reset 1]
@main
struct LangleApp: App {
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
