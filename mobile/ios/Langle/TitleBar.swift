import SwiftUI

/// The bar over a page opened from Home (mock `MobileYouTube`, `MobileArticle`): ‹ back to
/// Home, the page's title and site (a tap edits the search or address), L for the Langle sheet
/// and ⋮ for the rest. 56 pt, white, a 1 pt line under it. In the interface language; Arabic
/// mirrors it (the screen sets the direction).
struct TitleBar: View {
  @ObservedObject var model: AppModel
  @State private var editing = false
  @State private var typed = ""
  @FocusState private var focused: Bool

  var body: some View {
    HStack(spacing: 0) {
      Button(action: model.goHome) {
        StrokeIcon(path: IconPath.back, width: 2).flipsForRightToLeftLayoutDirection(true)
          .frame(width: 44, height: 44).contentShape(Rectangle())
      }
      .accessibilityLabel(model.strings["app.home"])
      if editing { field } else { titleButton }
      Button(action: model.openLangle) {
        LangleMark().frame(width: 44, height: 44).contentShape(Rectangle())
      }
      .disabled(model.refusal != nil)
      .accessibilityLabel(model.strings["app.name"])
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
    .accessibilityHint(model.strings["app.editAddress"])
  }

  /// The search or address, all of it selected, as Home's search field takes it.
  private var field: some View {
    TextField(model.strings["app.editAddress"], text: $typed)
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

  /// ⋮ opens `MoreMenu` (drawn over the page by the page screen).
  private var menu: some View {
    Button {
      model.menuOpen.toggle()
    } label: {
      Image(systemName: "ellipsis")
        .rotationEffect(.degrees(90))
        .font(.system(size: 18, weight: .bold))
        .frame(width: 44, height: 44)
        .contentShape(Rectangle())
    }
    .disabled(model.pageURL == nil)
    .accessibilityLabel(model.strings["app.more"])
  }
}

/// The title bar's ⋮ menu (mock `MobileArticleMenu`): Forward, Share, Copy link, Open in another
/// browser, then under a divider the switch "Block ads on this site" with the site's registrable
/// domain under it, while ad blocking is on. 272 pt wide, 2 pt under the bar, 8 pt from the
/// trailing edge (the left in Arabic); each choice closes it.
struct MoreMenu: View {
  @ObservedObject var model: AppModel

  var body: some View {
    let url = model.pageURL
    let strings = model.strings
    VStack(alignment: .leading, spacing: 0) {
      item(strings["app.forward"], enabled: model.canGoForward, action: model.goForward)
      item(strings["app.share"], enabled: url != nil) { if let url { FileShare.shareLink(url) } }
      item(strings["app.copyLink"], enabled: url != nil) { UIPasteboard.general.url = url }
      item(strings["app.openElsewhere"], enabled: url != nil) { if let url { UIApplication.shared.open(url) } }
      if let ads = model.adSwitch {
        Palette.line.frame(height: 1).padding(.vertical, 6).padding(.horizontal, 4)
        adSwitch(site: ads.site, blocking: ads.blocking)
      }
    }
    .padding(6)
    .frame(width: 272)
    .background(Color.white, in: RoundedRectangle(cornerRadius: 12))
    .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.line, lineWidth: 1) }
    .shadow(color: Palette.ink.opacity(0.18), radius: 15, y: 10)
  }

  private func item(_ label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
    Button {
      model.menuOpen = false
      action()
    } label: {
      Text(label)
        .font(.system(size: 15))
        .foregroundStyle(Palette.ink)
        .lineLimit(1)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, minHeight: 44, maxHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
    }
    .buttonStyle(MenuRowStyle())
    .disabled(!enabled)
    .opacity(enabled ? 1 : 0.38)
  }

  private func adSwitch(site: String, blocking: Bool) -> some View {
    Button {
      model.menuOpen = false
      model.setSiteBlocking(!blocking)
    } label: {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          Text(model.strings["app.blockAdsSite"]).font(.system(size: 15)).foregroundStyle(Palette.ink)
          Text(site).font(.system(size: 13)).foregroundStyle(Palette.muted).lineLimit(1)
            .truncationMode(.tail)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        SwitchTrack(on: blocking)
      }
      .padding(.leading, 12)
      .padding(.trailing, 8)
      .padding(.vertical, 6)
      .frame(minHeight: 56)
      .contentShape(Rectangle())
    }
    .buttonStyle(MenuRowStyle())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(model.strings.format("app.blockAdsSiteLabel", ["site": site]))
    .accessibilityValue(model.strings[blocking ? "app.on" : "app.off"])
    .accessibilityAddTraits(.isToggle)
  }
}

/// The mock's switch: 52 × 32, green on, grey off, a white knob.
private struct SwitchTrack: View {
  let on: Bool

  var body: some View {
    Capsule()
      .fill(on ? Color(rgb: 0x0B8A6C) : Color(rgb: 0xC9CDD6))
      .frame(width: 52, height: 32)
      .overlay(alignment: on ? .trailing : .leading) {
        Circle().fill(Color.white).frame(width: 26, height: 26)
          .shadow(color: Palette.ink.opacity(0.25), radius: 1.5, y: 1)
          .padding(3)
      }
  }
}

/// A menu row's pressed state: the mock's hover grey.
private struct MenuRowStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(
        configuration.isPressed ? Color(rgb: 0xF1F2F5) : .clear, in: RoundedRectangle(cornerRadius: 8))
  }
}
