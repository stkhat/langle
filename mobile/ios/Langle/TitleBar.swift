import SwiftUI

/// The bar over a page opened from Home (mock `MobileYouTube`, `MobileArticle`): ‹ back to
/// Home, the page's title and site (a tap edits the search or address), L for the Langle sheet
/// and ⋮ for the rest. 56 pt, white, a 1 pt line under it.
struct TitleBar: View {
  @ObservedObject var model: AppModel
  @State private var editing = false
  @State private var typed = ""
  @FocusState private var focused: Bool

  var body: some View {
    HStack(spacing: 0) {
      Button(action: model.goHome) {
        StrokeIcon(path: IconPath.back, width: 2).frame(width: 44, height: 44).contentShape(Rectangle())
      }
      .accessibilityLabel("Home")
      if editing { field } else { titleButton }
      Button(action: model.openLangle) {
        LangleMark().frame(width: 44, height: 44).contentShape(Rectangle())
      }
      .disabled(model.refusal != nil)
      .accessibilityLabel("Langle")
      menu
    }
    .buttonStyle(.plain)
    .foregroundStyle(Palette.ink)
    .padding(.vertical, 6)
    .padding(.horizontal, 4)
    .frame(height: 56)
    .background(Color.white)
    .overlay(alignment: .bottom) { Palette.line.frame(height: 1) }
  }

  private var titleButton: some View {
    Button {
      typed = model.editText
      editing = true
      focused = true
    } label: {
      VStack(alignment: .leading, spacing: 1) {
        Text(model.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Palette.ink)
        Text(model.site).font(.system(size: 12)).foregroundStyle(Palette.muted)
      }
      .lineLimit(1)
      .truncationMode(.tail)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .padding(.horizontal, 4)
      .contentShape(Rectangle())
    }
    .accessibilityLabel("\(model.title), \(model.site)")
    .accessibilityHint("Search or type an address")
  }

  /// The search or address, all of it selected, as Home's search field takes it.
  private var field: some View {
    TextField("Search or type an address", text: $typed)
      .font(.system(size: 15))
      .keyboardType(.webSearch)
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .submitLabel(.go)
      .focused($focused)
      .padding(.horizontal, 12)
      .frame(maxHeight: .infinity)
      .background(Color(rgb: 0xF1F2F5), in: RoundedRectangle(cornerRadius: 10))
      .padding(.horizontal, 4)
      .onSubmit {
        editing = false
        model.submit(typed)
      }
      .onChange(of: focused) { _, now in
        if !now { editing = false }
      }
      .onReceive(NotificationCenter.default.publisher(for: UITextField.textDidBeginEditingNotification)) {
        _ in
        UIApplication.shared.sendAction(#selector(UIResponder.selectAll(_:)), to: nil, from: nil, for: nil)
      }
  }

  private var menu: some View {
    Menu {
      Button("Forward", systemImage: "chevron.forward", action: model.goForward)
        .disabled(!model.canGoForward)
      if let url = model.pageURL {
        ShareLink(item: url) { Label("Share", systemImage: "square.and.arrow.up") }
        Button("Copy link", systemImage: "doc.on.doc") { UIPasteboard.general.url = url }
        Button("Open in another browser", systemImage: "safari") { UIApplication.shared.open(url) }
      }
    } label: {
      Image(systemName: "ellipsis")
        .rotationEffect(.degrees(90))
        .font(.system(size: 18, weight: .bold))
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
    .accessibilityLabel("More")
  }
}
