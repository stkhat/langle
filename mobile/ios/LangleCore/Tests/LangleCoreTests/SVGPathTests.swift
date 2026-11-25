import LangleCore
import XCTest

// The shell's icons are the mock's SVG paths (MobileStart's tab bar, the title bar's ‹).

private func p(_ x: Double, _ y: Double) -> PathPoint { PathPoint(x: x, y: y) }

private func distance(_ a: PathPoint, _ b: PathPoint) -> Double {
  ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)).squareRoot()
}

private func ends(_ elements: [PathElement]) -> [PathPoint] {
  elements.compactMap {
    switch $0 {
    case .move(let to), .line(let to), .curve(_, _, let to): to
    case .close: nil
    }
  }
}

final class SVGPathTests: XCTestCase {
  func test_reads_moves_and_lines_absolute_and_relative_with_repeats_and_close() {
    XCTAssertEqual(
      SVGPath.parse("M4 11l8-7 8 7v9h-5v-6H9v6H4z"),
      [
        .move(p(4, 11)), .line(p(12, 4)), .line(p(20, 11)), .line(p(20, 20)), .line(p(15, 20)),
        .line(p(15, 14)), .line(p(9, 14)), .line(p(9, 20)), .line(p(4, 20)), .close,
      ])
    XCTAssertEqual(
      SVGPath.parse("M9 6.5h11M4.5 12h.5"),
      [.move(p(9, 6.5)), .line(p(20, 6.5)), .move(p(4.5, 12)), .line(p(5, 12))])
    XCTAssertEqual(SVGPath.parse("M15 5l-7 7 7 7"), [.move(p(15, 5)), .line(p(8, 12)), .line(p(15, 19))])
  }

  func test_a_close_goes_back_to_the_start_for_what_follows() {
    XCTAssertEqual(
      SVGPath.parse("M1 1h2zl1 1"), [.move(p(1, 1)), .line(p(3, 1)), .close, .line(p(2, 2))])
  }

  func test_turns_arcs_into_curves_on_their_circle_ending_where_they_should() {
    let circle = SVGPath.parse("M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z")
    let points = ends(circle)
    XCTAssertEqual(points.first, p(12, 9))
    XCTAssertEqual(points.last, p(12, 9))
    XCTAssertTrue(points.contains(p(12, 15)))
    for point in points { XCTAssertEqual(distance(point, p(12, 12)), 3, accuracy: 1e-9) }
    XCTAssertGreaterThanOrEqual(circle.count, 6)
    XCTAssertEqual(circle.last, .close)
  }

  func test_reads_the_gears_small_arcs_and_absolute_arcs() {
    let gear = SVGPath.parse("M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5L14 2.5A7.6 7.6 0 0 0 7 6.5")
    let points = ends(gear)
    XCTAssertEqual(points[0], p(19.4, 13.5))
    XCTAssertTrue(points.contains(p(19.4, 10.5)))
    XCTAssertTrue(points.contains { distance($0, p(21.4, 9)) < 1e-9 })
    XCTAssertEqual(points.last, p(7, 6.5))
  }
}
