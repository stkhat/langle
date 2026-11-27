import SwiftUI

/// The containing app: reads shared.json at launch, on langlespike:// and each time the scene
/// becomes active, logs what it read and deletes it.
@main
struct ShareSpikeApp: App {
  @Environment(\.scenePhase) private var phase
  @State private var last = "Nothing shared yet"

  init() {
    Spike.log("app", "launch container=\(Spike.container?.path ?? "nil")")
    if let read = Self.takeShared("launch") { _last = State(initialValue: read) }
  }

  var body: some Scene {
    WindowGroup {
      VStack(spacing: 16) {
        Text("Share Spike").font(.title.bold())
        Text(last).font(.footnote.monospaced()).multilineTextAlignment(.center)
      }
      .padding()
      .onOpenURL { url in
        Spike.log("app", "onOpenURL \(url.absoluteString)")
        if let read = Self.takeShared("openURL") { last = read }
      }
    }
    .onChange(of: phase) { _, now in
      Spike.log("app", "scenePhase \(now)")
      if now == .active, let read = Self.takeShared("active") { last = read }
    }
  }

  /// Reads shared.json once and deletes it; nil when there is none.
  static func takeShared(_ why: String) -> String? {
    guard let file = Spike.sharedFile else {
      Spike.log("app", "\(why): no App Group container")
      return nil
    }
    guard let data = try? Data(contentsOf: file) else {
      Spike.log("app", "\(why): no shared.json")
      return nil
    }
    do {
      try FileManager.default.removeItem(at: file)
    } catch {
      Spike.log("app", "\(why): delete failed \(error)")
    }
    let text = String(decoding: data, as: UTF8.self)
    Spike.log("app", "\(why): read \(text)")
    return "\(why): \(text)"
  }
}
