import UIKit
import UniformTypeIdentifiers

/// The share extension. Mode (mode.txt in the group container, written by check.sh):
///   both        NSExtensionContext.open, then the responder-chain open, then end (default)
///   ctx         NSExtensionContext.open only, then end
///   chain       the responder-chain open, end in its completion
///   chain-late  end first, the responder-chain open in completeRequest's completion
///   none        no open: show "Saved", end after 2 s
final class ShareViewController: UIViewController {
  private let label = UILabel()
  private var started = false
  private var ended = false

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    label.numberOfLines = 0
    label.textAlignment = .center
    label.translatesAutoresizingMaskIntoConstraints = false
    label.text = "Share Spike…"
    view.addSubview(label)
    NSLayoutConstraint.activate([
      label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
      label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
    ])
    Spike.log("ext", "viewDidLoad container=\(Spike.container?.path ?? "nil")")
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard !started else { return }
    started = true
    Task { @MainActor in await run() }
  }

  private func run() async {
    let mode = Spike.container
      .flatMap { try? String(contentsOf: $0.appendingPathComponent("mode.txt"), encoding: .utf8) }?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? "both"
    Spike.log("ext", "mode=\(mode)")

    // 1. Keep the item first.
    let item = await readItem()
    var payload: [String: String] = ["sharedAt": Spike.stamp()]
    payload["url"] = item.url
    payload["text"] = item.text
    if let file = Spike.sharedFile {
      do {
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        try data.write(to: file, options: .atomic)
        Spike.log("ext", "wrote shared.json \(String(decoding: data, as: UTF8.self))")
      } catch {
        Spike.log("ext", "write failed \(error)")
      }
    } else {
      Spike.log("ext", "no App Group container")
    }

    // 2. The public call.
    if mode == "both" || mode == "ctx" {
      let ok = await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
        guard let context = extensionContext else { return done.resume(returning: false) }
        context.open(Spike.openURL) { done.resume(returning: $0) }
      }
      Spike.log("ext", "NSExtensionContext.open completion=\(ok)")
    }

    // 3. The responder chain, and the end of the request.
    switch mode {
    case "both", "chain":
      openThroughChain(label: "chain") { self.end("after chain") }
      DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.end("3 s timeout") }
    case "chain-late":
      end("before chain") { self.openThroughChain(label: "chain-late") { _ = 0 } }
    case "none":
      label.text = "Saved. Open the app to see it."
      DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.end("none") }
    default:
      end("ctx")
    }
  }

  /// Walks `next` from this view controller to the UIApplication and calls the three-argument open.
  private func openThroughChain(label: String, then: @escaping () -> Void) {
    var responder: UIResponder? = self
    var path: [String] = []
    let started = Date()
    while let current = responder {
      path.append(String(describing: type(of: current)))
      if let application = current as? UIApplication {
        Spike.log("ext", "\(label): found UIApplication via \(path.joined(separator: " > "))")
        application.open(Spike.openURL, options: [:]) { ok in
          let ms = Int(Date().timeIntervalSince(started) * 1000)
          Spike.log("ext", "\(label): UIApplication.open completion=\(ok) after \(ms) ms")
          then()
        }
        return
      }
      responder = current.next
    }
    Spike.log("ext", "\(label): no UIApplication in chain \(path.joined(separator: " > "))")
    then()
  }

  private func end(_ why: String, then: (() -> Void)? = nil) {
    guard !ended else { return }
    ended = true
    Spike.log("ext", "completeRequest (\(why))")
    extensionContext?.completeRequest(returningItems: nil) { expired in
      Spike.log("ext", "completeRequest done expired=\(expired)")
      DispatchQueue.main.async { then?() }
    }
  }

  private func readItem() async -> (url: String?, text: String?) {
    var url: String?
    var text: String?
    for item in extensionContext?.inputItems as? [NSExtensionItem] ?? [] {
      if let title = item.attributedContentText?.string { Spike.log("ext", "contentText=\(title)") }
      for provider in item.attachments ?? [] {
        Spike.log("ext", "attachment types=\(provider.registeredTypeIdentifiers)")
        if url == nil, provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
          let value = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier)
          url = (value as? URL)?.absoluteString ?? (value as? String)
        } else if text == nil, provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
          let value = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier)
          text = (value as? String) ?? (value as? Data).map { String(decoding: $0, as: UTF8.self) }
        }
      }
    }
    return (url, text)
  }
}
