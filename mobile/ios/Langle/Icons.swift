import LangleCore
import SwiftUI

/// The mock's colors for the shell's bars and sheet frame (`MobileStart`, `MobileLangleSheet`).
enum Palette {
  static let ink = Color(rgb: 0x14182B)
  static let muted = Color(rgb: 0x5A6075)
  static let line = Color(rgb: 0xE3E5EA)
  static let green = Color(rgb: 0x0B7F65)
  static let grabber = Color(rgb: 0xD5D8E0)
  static let backdrop = Color(rgb: 0x14182B).opacity(0.32)
  static let shadow = Color(rgb: 0x14182B).opacity(0.16)
}

extension Color {
  init(rgb: UInt32) {
    self.init(
      red: Double((rgb >> 16) & 0xFF) / 255, green: Double((rgb >> 8) & 0xFF) / 255,
      blue: Double(rgb & 0xFF) / 255)
  }
}

/// An icon drawn from the mock's SVG path data, in its 24 × 24 box.
struct SVGIcon: Shape {
  let elements: [PathElement]

  init(_ d: String) { elements = SVGPath.parse(d) }

  func path(in rect: CGRect) -> Path {
    let scale = min(rect.width, rect.height) / 24
    func point(_ p: PathPoint) -> CGPoint {
      CGPoint(x: rect.minX + p.x * scale, y: rect.minY + p.y * scale)
    }
    var path = Path()
    for element in elements {
      switch element {
      case .move(let to): path.move(to: point(to))
      case .line(let to): path.addLine(to: point(to))
      case .curve(let c1, let c2, let to):
        path.addCurve(to: point(to), control1: point(c1), control2: point(c2))
      case .close: path.closeSubpath()
      }
    }
    return path
  }
}

/// The paths of the mock's icons.
enum IconPath {
  static let home = "M4 11l8-7 8 7v9h-5v-6H9v6H4z"
  static let words = "M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.5M4.5 12h.5M4.5 17.5h.5"
  static let settings =
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.5l-2.4-1-2 3.5 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.5z"
  static let back = "M15 5l-7 7 7 7"
}

/// A stroked icon as the mock draws them (round caps and joins).
struct StrokeIcon: View {
  let path: String
  var size: CGFloat = 24
  var width: CGFloat = 1.8

  var body: some View {
    SVGIcon(path)
      .stroke(style: StrokeStyle(lineWidth: width * size / 24, lineCap: .round, lineJoin: .round))
      .frame(width: size, height: size)
  }
}

/// Langle's mark, the bundled build's toolbar icon.
struct LangleMark: View {
  var size: CGFloat = 28

  var body: some View {
    if let mark = AppModel.mark {
      Image(uiImage: mark).resizable().interpolation(.high).frame(width: size, height: size)
    } else {
      Text("L").font(.system(size: size * 0.7, weight: .bold)).frame(width: size, height: size)
    }
  }
}
