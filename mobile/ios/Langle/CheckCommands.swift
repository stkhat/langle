#if DEBUG
  import Foundation
  import LangleCore

  /// Debug builds only: commands from `check.sh` as Darwin notifications (`notifyutil -p
  /// dev.langle.app.<name>`), with results in the unified log (subsystem dev.langle.app, category
  /// check), as the prototypes did.
  /// - `errors`, `clear-errors`: the check build's error log (`checkErrorLog` in `storage.local`),
  ///   read and cleared through the extension host's `browser.storage`;
  /// - `eval`: runs `Documents/eval.json` (`{ "target": "host" | "page" | "langle" | "sheet",
  ///   "source": "<function body>" }`) and logs what it returns;
  /// - `state`: the tabs, the sheet and whether the host said hello.
  @MainActor
  final class CheckCommands {
    static let shared = CheckCommands()
    private weak var model: AppModel?
    private static let names = ["errors", "clear-errors", "eval", "state"]

    func start(model: AppModel) {
      self.model = model
      let center = CFNotificationCenterGetDarwinNotifyCenter()
      for name in Self.names {
        CFNotificationCenterAddObserver(
          center, nil,
          { _, _, name, _, _ in
            guard let name = name?.rawValue as String? else { return }
            let command = String(name.dropFirst("dev.langle.app.".count))
            DispatchQueue.main.async {
              MainActor.assumeIsolated { CheckCommands.shared.run(command) }
            }
          }, "dev.langle.app.\(name)" as CFString, nil, .deliverImmediately)
      }
      say("ready")
    }

    private func say(_ text: String) {
      Log.check.info("\(text, privacy: .public)")
    }

    func run(_ command: String) {
      guard let model else { return }
      Task {
        switch command {
        case "errors":
          let log = await model.host?.evaluate(
            #"return JSON.stringify((await browser.storage.local.get("checkErrorLog")).checkErrorLog ?? [])"#)
          say("errors \(log ?? "no host")")
        case "clear-errors":
          let done = await model.host?.evaluate(
            #"await browser.storage.local.remove("checkErrorLog"); return "cleared""#)
          say("clear-errors \(done ?? "no host")")
        case "eval":
          say("eval \(await evaluateFile(model))")
        case "state":
          let tabs = model.router.tabs.all.map { "\($0.id)\($0.active ? "*" : "") \($0.url)" }
          say(
            "state host=\(model.host?.isReady ?? false) tabs=[\(tabs.joined(separator: ", "))] sheet=\(model.sheet?.context.page.url?.absoluteString ?? "none") page=\(model.browsing.page.url?.absoluteString ?? "none")"
          )
        default:
          say("unknown command \(command)")
        }
      }
    }

    private func evaluateFile(_ model: AppModel) async -> String {
      let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("eval.json")
      guard let text = try? String(contentsOf: file, encoding: .utf8),
        let request = try? JSONValue.parse(text), let source = request["source"]?.string
      else { return "no Documents/eval.json" }
      switch request["target"]?.string {
      case "host": return await model.host?.evaluate(source) ?? "no host"
      case "page": return await model.browsing.page.evaluate(world: .page, source: source)
      case "langle": return await model.browsing.page.evaluate(world: .langle, source: source)
      case "sheet":
        return await model.sheet?.context.page.evaluate(world: .page, source: source) ?? "no sheet"
      default: return "unknown target"
      }
    }
  }
#endif
