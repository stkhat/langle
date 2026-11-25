import Foundation

public struct PathPoint: Equatable, Sendable {
  public var x: Double
  public var y: Double
  public init(x: Double, y: Double) {
    self.x = x
    self.y = y
  }
}

/// A path in absolute coordinates: moves, lines, cubic curves (arcs become curves) and closes.
public enum PathElement: Equatable, Sendable {
  case move(PathPoint)
  case line(PathPoint)
  case curve(PathPoint, PathPoint, to: PathPoint)
  case close
}

/// SVG path data as the mock's icons use it (`M L H V A Z`, absolute and relative, repeated
/// arguments), so the shell draws the same icons as the mock's boards.
public enum SVGPath {
  public static func parse(_ d: String) -> [PathElement] {
    var reader = Reader(d)
    var out: [PathElement] = []
    var current = PathPoint(x: 0, y: 0)
    var start = current
    var command: Character?
    while let next = reader.command() ?? command {
      command = next
      let relative = next.isLowercase
      func point(_ x: Double, _ y: Double) -> PathPoint {
        relative ? PathPoint(x: current.x + x, y: current.y + y) : PathPoint(x: x, y: y)
      }
      switch next.uppercased() {
      case "M":
        guard let x = reader.number(), let y = reader.number() else { return out }
        current = point(x, y)
        start = current
        out.append(.move(current))
        // Pairs after a move are lines.
        command = relative ? "l" : "L"
      case "L":
        guard let x = reader.number(), let y = reader.number() else { return out }
        current = point(x, y)
        out.append(.line(current))
      case "H":
        guard let x = reader.number() else { return out }
        current = PathPoint(x: relative ? current.x + x : x, y: current.y)
        out.append(.line(current))
      case "V":
        guard let y = reader.number() else { return out }
        current = PathPoint(x: current.x, y: relative ? current.y + y : y)
        out.append(.line(current))
      case "A":
        guard let rx = reader.number(), let ry = reader.number(), let angle = reader.number(),
          let large = reader.number(), let sweep = reader.number(), let x = reader.number(),
          let y = reader.number()
        else { return out }
        let end = point(x, y)
        out += arc(from: current, rx: rx, ry: ry, degrees: angle, large: large != 0, sweep: sweep != 0, to: end)
        current = end
      case "Z":
        out.append(.close)
        current = start
        command = nil
      default:
        return out
      }
    }
    return out
  }

  /// An elliptical arc as cubic curves of at most a quarter turn each (SVG 1.1, F.6.5).
  static func arc(
    from p1: PathPoint, rx: Double, ry: Double, degrees: Double, large: Bool, sweep: Bool,
    to p2: PathPoint
  ) -> [PathElement] {
    if p1 == p2 { return [] }
    var rx = abs(rx)
    var ry = abs(ry)
    if rx == 0 || ry == 0 { return [.line(p2)] }
    let phi = degrees * .pi / 180
    let (cosPhi, sinPhi) = (cos(phi), sin(phi))
    let dx = (p1.x - p2.x) / 2
    let dy = (p1.y - p2.y) / 2
    let x1 = cosPhi * dx + sinPhi * dy
    let y1 = -sinPhi * dx + cosPhi * dy
    let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
    if lambda > 1 {
      rx *= lambda.squareRoot()
      ry *= lambda.squareRoot()
    }
    let numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
    let denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1
    let coefficient = (large != sweep ? 1.0 : -1.0) * max(0, numerator / denominator).squareRoot()
    let cxp = coefficient * rx * y1 / ry
    let cyp = -coefficient * ry * x1 / rx
    let cx = cosPhi * cxp - sinPhi * cyp + (p1.x + p2.x) / 2
    let cy = sinPhi * cxp + cosPhi * cyp + (p1.y + p2.y) / 2
    func angle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
      atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    }
    let ux = (x1 - cxp) / rx
    let uy = (y1 - cyp) / ry
    let start = angle(1, 0, ux, uy)
    var turn = angle(ux, uy, (-x1 - cxp) / rx, (-y1 - cyp) / ry)
    if !sweep && turn > 0 { turn -= 2 * .pi }
    if sweep && turn < 0 { turn += 2 * .pi }
    let count = max(1, Int((abs(turn) / (.pi / 2)).rounded(.up)))
    let step = turn / Double(count)
    let t = 4.0 / 3.0 * tan(step / 4)
    func at(_ a: Double) -> PathPoint {
      PathPoint(
        x: cx + rx * cos(a) * cosPhi - ry * sin(a) * sinPhi,
        y: cy + rx * cos(a) * sinPhi + ry * sin(a) * cosPhi)
    }
    func slope(_ a: Double) -> PathPoint {
      PathPoint(
        x: -rx * sin(a) * cosPhi - ry * cos(a) * sinPhi,
        y: -rx * sin(a) * sinPhi + ry * cos(a) * cosPhi)
    }
    var out: [PathElement] = []
    for i in 0..<count {
      let a1 = start + Double(i) * step
      let a2 = a1 + step
      let e1 = at(a1)
      let e2 = i == count - 1 ? p2 : at(a2)
      let d1 = slope(a1)
      let d2 = slope(a2)
      out.append(
        .curve(
          PathPoint(x: e1.x + t * d1.x, y: e1.y + t * d1.y),
          PathPoint(x: e2.x - t * d2.x, y: e2.y - t * d2.y), to: e2))
    }
    return out
  }

  /// Commands and numbers, as SVG writes them ("-7", ".5", "0-6").
  private struct Reader {
    private let chars: [Character]
    private var index = 0

    init(_ text: String) { chars = Array(text) }

    private mutating func skip() {
      while index < chars.count, chars[index].isWhitespace || chars[index] == "," { index += 1 }
    }

    /// The next command letter, if one comes next.
    mutating func command() -> Character? {
      skip()
      guard index < chars.count, chars[index].isLetter, chars[index] != "e", chars[index] != "E"
      else { return nil }
      defer { index += 1 }
      return chars[index]
    }

    mutating func number() -> Double? {
      skip()
      let begin = index
      if index < chars.count, chars[index] == "-" || chars[index] == "+" { index += 1 }
      var dot = false
      var digits = false
      while index < chars.count {
        let c = chars[index]
        if c.isNumber {
          digits = true
        } else if c == ".", !dot {
          dot = true
        } else {
          break
        }
        index += 1
      }
      if digits, index < chars.count, chars[index] == "e" || chars[index] == "E" {
        index += 1
        if index < chars.count, chars[index] == "-" || chars[index] == "+" { index += 1 }
        while index < chars.count, chars[index].isNumber { index += 1 }
      }
      guard digits else {
        index = begin
        return nil
      }
      return Double(String(chars[begin..<index]))
    }
  }
}
