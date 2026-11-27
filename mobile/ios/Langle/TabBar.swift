import LangleCore
import SwiftUI

/// Home · Words · Settings at the bottom of the tab screens (mock `MobileStart`): white, a 1 pt
/// line on top, 52 pt items with a 24 pt icon over an 11 pt label, the current one green. In the
/// interface language; Arabic mirrors the order (the screen sets the direction).
struct TabBar: View {
  let current: AppTab?
  let strings: NativeStrings
  let select: (AppTab) -> Void

  private static let items: [(AppTab, String, String)] = [
    (.home, "app.home", IconPath.home),
    (.words, "app.words", IconPath.words),
    (.settings, "app.settings", IconPath.settings),
  ]

  var body: some View {
    HStack(spacing: 0) {
      ForEach(Self.items, id: \.0) { tab, key, icon in
        let on = tab == current
        Button {
          select(tab)
        } label: {
          VStack(spacing: 2) {
            StrokeIcon(path: icon)
            Text(strings[key]).font(.system(size: 11, weight: on ? .semibold : .regular))
          }
          .frame(maxWidth: .infinity, minHeight: 52)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(on ? Palette.green : Palette.muted)
        .accessibilityAddTraits(on ? .isSelected : [])
      }
    }
    .padding(.top, 4)
    .padding(.horizontal, 8)
    .background(Color.white.ignoresSafeArea(edges: .bottom))
    .overlay(alignment: .top) { Palette.line.frame(height: 1) }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(strings["app.tabs"])
  }
}
