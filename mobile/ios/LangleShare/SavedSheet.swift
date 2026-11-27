import LangleCore
import SwiftUI

/// The extension's sheet when Langle could not be opened (the mock's `MobileShareSaved`, ui.md
/// "Open in Langle from another app"): the Langle mark and Done, the item's title or host, and
/// "Saved. Open Langle to see it." Mirrored in a right-to-left interface language.
struct SavedSheet: View {
  /// The source's preview image of the item, once it has loaded.
  final class Preview: ObservableObject {
    @Published var image: UIImage?
  }

  let line: String
  let host: String?
  let isText: Bool
  let strings: NativeStrings
  let mark: UIImage?
  @ObservedObject var preview: Preview
  let done: () -> Void

  private static let ink = Color(rgb: 0x14182B)
  private static let muted = Color(rgb: 0x5A6075)
  private static let divider = Color(rgb: 0xE3E5EA)
  private static let green = Color(rgb: 0x0B7F65)
  private static let check = Color(rgb: 0x0B8A6C)
  private static let panel = Color(rgb: 0xF6F7F9)
  private static let backdrop = Color(rgb: 0x14182B).opacity(0.32)
  private static let shadow = Color(rgb: 0x14182B).opacity(0.16)

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)
      VStack(spacing: 0) {
        header
        Rectangle().fill(Self.divider).frame(height: 1)
        item
        status
      }
      .foregroundStyle(Self.ink)
      .background {
        UnevenRoundedRectangle(topLeadingRadius: 16, topTrailingRadius: 16)
          .fill(Color.white)
          .shadow(color: Self.shadow, radius: 15, y: -10)
          .ignoresSafeArea(edges: .bottom)
      }
    }
    .background { Self.backdrop.ignoresSafeArea() }
    .environment(\.layoutDirection, strings.rtl ? .rightToLeft : .leftToRight)
  }

  private var header: some View {
    ZStack {
      HStack(spacing: 8) {
        Group {
          if let mark {
            Image(uiImage: mark).resizable().interpolation(.high)
          } else {
            Text("L").font(.system(size: 17, weight: .bold))
          }
        }
        .frame(width: 24, height: 24)
        .accessibilityHidden(true)
        Text(strings["app.name"]).font(.system(size: 17, weight: .semibold))
      }
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isHeader)
      HStack {
        Spacer()
        Button(action: done) {
          Text(strings["app.done"]).font(.system(size: 17, weight: .semibold)).foregroundStyle(Self.green)
            .padding(.horizontal, 8).frame(minWidth: 56, minHeight: 44)
        }
      }
    }
    .frame(height: 56)
    .padding(.horizontal, 8)
  }

  private var item: some View {
    HStack(spacing: 12) {
      thumbnail
      VStack(alignment: .leading, spacing: 2) {
        Text(line).font(.system(size: 15, weight: .semibold)).lineLimit(1).truncationMode(.tail)
        if let host {
          Text(host).font(.system(size: 13)).foregroundStyle(Self.muted).lineLimit(1)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 16)
  }

  /// The source's preview, else a plain tile with a link (or text) glyph.
  private var thumbnail: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 8).fill(Self.panel)
      if let image = preview.image {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        Image(systemName: isText ? "text.alignleft" : "link")
          .font(.system(size: 18, weight: .medium)).foregroundStyle(Self.muted)
      }
    }
    .frame(width: 48, height: 48)
    .clipShape(RoundedRectangle(cornerRadius: 8))
    .accessibilityHidden(true)
  }

  private var status: some View {
    HStack(spacing: 10) {
      CheckMark()
        .stroke(Self.check, style: StrokeStyle(lineWidth: 2.2 * 20 / 24, lineCap: .round, lineJoin: .round))
        .frame(width: 20, height: 20)
        .accessibilityHidden(true)
      Text(strings["app.shareSaved"]).font(.system(size: 16, weight: .semibold))
        .fixedSize(horizontal: false, vertical: true)
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
    .background(RoundedRectangle(cornerRadius: 12).fill(Self.panel))
    .padding(.horizontal, 20)
    .padding(.bottom, 8)
    .accessibilityElement(children: .combine)
  }
}

/// The mock's check, "M5 12l5 5 9-10" in a 24 × 24 box.
private struct CheckMark: Shape {
  func path(in rect: CGRect) -> Path {
    let scale = min(rect.width, rect.height) / 24
    var path = Path()
    path.move(to: CGPoint(x: rect.minX + 5 * scale, y: rect.minY + 12 * scale))
    path.addLine(to: CGPoint(x: rect.minX + 10 * scale, y: rect.minY + 17 * scale))
    path.addLine(to: CGPoint(x: rect.minX + 19 * scale, y: rect.minY + 7 * scale))
    return path
  }
}

extension Color {
  fileprivate init(rgb: UInt32) {
    self.init(
      red: Double((rgb >> 16) & 0xFF) / 255, green: Double((rgb >> 8) & 0xFF) / 255,
      blue: Double(rgb & 0xFF) / 255)
  }
}
