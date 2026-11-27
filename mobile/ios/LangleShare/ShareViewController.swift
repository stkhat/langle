import LangleCore
import SwiftUI
import UIKit
import UniformTypeIdentifiers
import os

/// Share → Langle (docs/specs/mobile-app.md "M8: Share → Langle", "iOS"): keeps the shared item
/// for the app (`SharedInbox`, the app group's `shared.json`), then opens `langle://shared`
/// through the responder chain (the call Chrome and Firefox use; `NSExtensionContext.open` is not
/// for share extensions and always says false, docs/notes/mobile.md "Share extension spike") and
/// ends the request. When the open fails, the sheet says the item is saved (`SavedSheet`); the
/// app opens it the next time it comes to the front.
///
/// Check builds (DEBUG) read `share-mode.txt` in the shared folder (`check.sh share-mode`):
/// `saved` skips the open, so the sheet shows.
final class ShareViewController: UIViewController {
  private static let log = Logger(subsystem: "dev.langle.app", category: "share")
  private static let openURL = URL(string: "langle://shared")!
  private var started = false
  private var ended = false

  override func viewDidLoad() {
    super.viewDidLoad()
    // Nothing shows while the app opens; the sheet draws its own card when it is needed.
    view.backgroundColor = .clear
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !started else { return }
    started = true
    Task { @MainActor in await run() }
  }

  private func run() async {
    let input = await ShareInput.read(extensionContext?.inputItems as? [NSExtensionItem] ?? [])
    guard input.url != nil || input.text != nil else {
      Self.log.error("nothing to keep in the shared item")
      return end()
    }
    let item = SharedItem(url: input.url, text: input.text, sharedAt: Self.stamp())
    do {
      try SharedInbox(directory: AppGroup.folder).put(item)
      Self.log.info("kept \(item.json.json, privacy: .public)")
    } catch {
      Self.log.error("could not keep the shared item: \(String(describing: error), privacy: .public)")
    }
    #if DEBUG
      if Self.checkMode == "saved" { return showSaved(input) }
    #endif
    switch await openApp() {
    case true?: end()
    case false?:
      Self.log.info("the open said false")
      showSaved(input)
    case nil:
      Self.log.info("no UIApplication in the responder chain")
      showSaved(input)
    }
  }

  /// Walks `next` from this controller to the `UIApplication` and opens Langle's own URL. Nil
  /// when the chain has no `UIApplication`.
  private func openApp() async -> Bool? {
    var responder: UIResponder? = self
    while let current = responder {
      if let application = current as? UIApplication {
        return await withCheckedContinuation { done in
          application.open(Self.openURL, options: [:]) { done.resume(returning: $0) }
        }
      }
      responder = current.next
    }
    return nil
  }

  private func showSaved(_ input: ShareInput) {
    let preview = SavedSheet.Preview()
    let sheet = UIHostingController(
      rootView: SavedSheet(
        line: input.line, host: input.hostLine, isText: input.url == nil, strings: Self.strings,
        mark: Self.mark, preview: preview, done: { [weak self] in self?.end() }))
    sheet.view.backgroundColor = .clear
    addChild(sheet)
    sheet.view.frame = view.bounds
    sheet.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(sheet.view)
    sheet.didMove(toParent: self)
    input.preview?.loadPreviewImage(options: nil) { image, _ in
      guard let image = image as? UIImage else { return }
      DispatchQueue.main.async { preview.image = image }
    }
  }

  private func end() {
    guard !ended else { return }
    ended = true
    extensionContext?.completeRequest(returningItems: nil)
  }

  private static func stamp() -> String {
    let format = ISO8601DateFormatter()
    format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return format.string(from: Date())
  }

  /// The app's native strings: the set the app keeps in the app group, else the English built
  /// into the extension (en.json's `app.` keys, scripts/bundle-build.sh).
  private static var strings: NativeStrings {
    let english =
      Bundle.main.url(forResource: "native-strings-en", withExtension: "json")
      .flatMap { try? Data(contentsOf: $0) }
      .map { NativeStrings.english(localeJSON: String(decoding: $0, as: UTF8.self)) } ?? [:]
    return NativeStrings(
      english: english, kept: FilePersistence(directory: AppGroup.folder).load(NativeStrings.name))
  }

  /// Langle's mark (the bundled build's toolbar icon, copied into the extension).
  private static var mark: UIImage? {
    Bundle.main.path(forResource: "LangleMark", ofType: "png").flatMap(UIImage.init(contentsOfFile:))
  }

  #if DEBUG
    private static var checkMode: String? {
      (try? String(contentsOf: AppGroup.folder.appendingPathComponent("share-mode.txt"), encoding: .utf8))?
        .trimmingCharacters(in: .whitespacesAndNewlines)
    }
  #endif
}

/// What the share sheet handed over: the URL attachments (`SharedItem.pickURL` keeps one), the
/// text, and the title the source gave (Safari's page title; for text, the text itself).
struct ShareInput {
  var url: String?
  var text: String?
  var title: String?
  /// The attachment whose preview image the sheet shows, if the source gives one.
  var preview: NSItemProvider?

  private static let log = Logger(subsystem: "dev.langle.app", category: "share")

  static func read(_ items: [NSExtensionItem]) async -> ShareInput {
    var input = ShareInput()
    var urls: [String] = []
    for item in items {
      if input.title == nil, let title = item.attributedContentText?.string { input.title = title }
      for provider in item.attachments ?? [] {
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
          let value = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier)
          if let url = (value as? URL)?.absoluteString ?? (value as? String) {
            urls.append(url)
            if input.preview == nil { input.preview = provider }
          }
        } else if input.text == nil, provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
          let value = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier)
          input.text = (value as? String) ?? (value as? Data).map { String(decoding: $0, as: UTF8.self) }
        }
      }
    }
    #if DEBUG
      log.info("attachments urls=\(urls, privacy: .public) text=\(input.text ?? "none", privacy: .public) title=\(input.title ?? "none", privacy: .public)")
    #endif
    input.url = SharedItem.pickURL(urls)
    return input
  }

  /// The URL's host, as the address has it.
  var host: String? { url.flatMap { URLComponents(string: $0)?.host?.lowercased() } }

  /// The sheet's first line: the item's title, else its host, else the text.
  var line: String {
    let title = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !title.isEmpty, title != url { return title }
    if let host, !host.isEmpty { return host }
    return text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? url ?? ""
  }

  /// The sheet's second line: the host, under a title.
  var hostLine: String? {
    guard let host, !host.isEmpty, host != line else { return nil }
    return host
  }
}
