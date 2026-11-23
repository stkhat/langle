import SwiftUI
import WebKit

/// Prototype browser on WKWebView (docs/notes/mobile.md "Next steps" 2). Driven from the shell:
///   xcrun simctl launch booted dev.langle.probe.wk -url <url> [-ua safari] [-block off]
///   xcrun simctl spawn booted notifyutil -p dev.langle.probe.<variants|captions|captionsJa|state|measure>
/// Results go to the unified log, subsystem dev.langle.probe (see check.sh).
@main
struct LangleProbeApp: App {
  var body: some Scene {
    WindowGroup {
      ProbeWebView().ignoresSafeArea(.container, edges: .bottom)
    }
  }
}

struct ProbeWebView: UIViewRepresentable {
  func makeUIView(context: Context) -> WKWebView { Probe.shared.webView }
  func updateUIView(_ view: WKWebView, context: Context) {}
}
