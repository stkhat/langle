import LangleCore
import UIKit

/// Exports from the app's pages, which have no downloads (docs/specs/mobile-app.md "The shells"):
/// `appHost.shareFile` writes the file under its own name and shows the share sheet, where the
/// user saves it to Files or sends it. The sheet takes the file's type from its name's extension.
@MainActor
enum FileShare {
  /// Only the latest file is kept: the folder is emptied first.
  static let folder = FileManager.default.temporaryDirectory.appendingPathComponent(
    "shared", isDirectory: true)

  /// Answers `done` once the sheet is done: true when the file went to a target (an app, Save to
  /// Files), false when the sheet was dismissed without one (`completionWithItemsHandler`'s
  /// `completed`), or a failure with why it could not show.
  static func present(_ file: SharedFile, done: @escaping (Result<Bool, BridgeError>) -> Void) {
    let url = folder.appendingPathComponent(file.name)
    do {
      try? FileManager.default.removeItem(at: folder)
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      try Data(file.text.utf8).write(to: url)
    } catch {
      Log.app.error("could not write \(file.name, privacy: .public): \(String(describing: error), privacy: .public)")
      return done(.failure(BridgeError(error.localizedDescription)))
    }
    let shown = show(
      [url],
      then: {
        Log.app.info("sharing \(file.name, privacy: .public) (\(file.text.utf8.count) bytes)")
      },
      completed: { completed, activity in
        let target = activity?.rawValue ?? "none"
        Log.app.info("share of \(file.name, privacy: .public): \(completed ? "to \(target)" : "dismissed", privacy: .public)")
        done(.success(completed))
      })
    if !shown { done(.failure(BridgeError("There is no window to show the share sheet in."))) }
  }

  /// ⋮ Share: the page's address in the share sheet.
  static func shareLink(_ url: URL) {
    _ = show([url], then: {}, completed: { _, _ in })
  }

  private static func show(
    _ items: [Any], then: @escaping () -> Void,
    completed: @escaping (Bool, UIActivity.ActivityType?) -> Void
  ) -> Bool {
    guard let presenter = topViewController() else { return false }
    let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
    // Called once the sheet is done; `completed` is false when it was dismissed without a target
    // (or the target's own screen was cancelled).
    sheet.completionWithItemsHandler = { activity, done, _, _ in completed(done, activity) }
    // iPad shows it as a popover: in the middle of the screen, with no arrow.
    if let popover = sheet.popoverPresentationController {
      let view = presenter.view!
      popover.sourceView = view
      popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
      popover.permittedArrowDirections = []
    }
    presenter.present(sheet, animated: true, completion: then)
    return true
  }

  /// The view controller on top of the key window (a sheet shown over the tabs included).
  private static func topViewController() -> UIViewController? {
    let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
    var top = (windows.first(where: \.isKeyWindow) ?? windows.first)?.rootViewController
    while let presented = top?.presentedViewController, !presented.isBeingDismissed {
      top = presented
    }
    return top
  }
}
