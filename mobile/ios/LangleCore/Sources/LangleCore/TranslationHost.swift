import Foundation

/// A translation direction, by language code ("en" → "ja").
public struct TranslationPair: Hashable, Sendable {
  public let from: String
  public let to: String

  public init(from: String, to: String) {
    self.from = from
    self.to = to
  }

  /// The pair in a call's argument (`{ from, to, … }`), or nil when it has none.
  public init?(_ value: JSONValue?) {
    guard let from = value?["from"]?.string, let to = value?["to"]?.string, !from.isEmpty, !to.isEmpty
    else { return nil }
    self.init(from: from, to: to)
  }
}

/// `appHost.translatorStatus`'s answer (`TranslatorStatus` in src/core/app-host.ts).
public enum TranslatorStatus: String, Sendable {
  /// Can translate now.
  case ready
  /// The models are to be downloaded, which needs the consent sheet (iOS).
  case download
  /// The model packs are not on the phone yet (Android).
  case packs
  case unavailable
}

/// Why the engine gave no translation.
public enum EngineFailure: Error, Equatable, Sendable {
  /// This text only (nothing to translate, a language not identified): the engine is fine.
  case text
  /// The pair's models are not on the phone (Apple's `notInstalled`).
  case notInstalled
  /// The engine itself failed: it is released and started again once.
  case engine
}

/// The platform's translator, which the host starts, uses and releases (iOS: Apple Translation,
/// one session per pair). Calls back on the thread the host runs on.
public protocol TranslationEngine: AnyObject {
  func status(_ pair: TranslationPair, _ done: @escaping (TranslatorStatus) -> Void)
  /// Shows the consent sheet to download the pair's models; calls back once it closed.
  func prepare(_ pair: TranslationPair, _ done: @escaping () -> Void)
  /// Starts the engine for the pair.
  func load(_ pair: TranslationPair, _ done: @escaping (Result<Void, EngineFailure>) -> Void)
  /// Translates with a pair `load` started.
  func translate(
    _ pair: TranslationPair, _ text: String, _ done: @escaping (Result<String, EngineFailure>) -> Void)
  /// Gives the memory back: every pair is to be loaded again; answers still on their way are
  /// not wanted.
  func release()
}

/// The app's translation host (docs/specs/mobile-translation.md "Starting and releasing the
/// engine", "Failures", "M5: the hosts"): answers the calls in `translationApis` for the router.
/// - one sentence at a time, in the order asked; a page not on screen gets null at once;
/// - `start` false (the lists) neither starts the engine nor counts as a use;
/// - the engine is released `releaseMs` after the last use, and at once when the app leaves the
///   screen; requests waiting then get null;
/// - an engine failure gives that request null and releases the engine; the next request starts
///   it again, and if that one fails too translation stays off until a page is opened again;
/// - loading gives up after `loadMs` (as an engine failure), a sentence after `sentenceMs` (null,
///   the engine kept);
/// - consent sheets show one after another, and each is answered even if the page that asked has
///   gone.
/// Not thread-safe: the app calls it on the main thread, as the router.
public final class TranslationHost {
  public struct Limits: Sendable {
    public var releaseMs = 60_000.0
    public var loadMs = 30_000.0
    public var sentenceMs = 10_000.0
    public init() {}
  }

  public typealias Done = (Result<JSONValue?, BridgeError>) -> Void

  private struct Job {
    let pair: TranslationPair
    let text: String
    let start: Bool
    let done: Done
  }

  private struct SheetAsk {
    let pair: TranslationPair
    let done: Done
  }

  private let engine: TranslationEngine
  private let clock: Clock
  private let limits: Limits
  private let onScreen: (ContextSpec) -> Bool

  private var queue: [Job] = []
  /// The job the engine works on; `run` tells its answers from older ones.
  private var current: Job?
  private var run = 0
  private var timeout: AnyObject?
  private var loaded: Set<TranslationPair> = []
  private var releaseTimer: AnyObject?
  /// The engine failed once since a page was opened, and is started again.
  private var restarted = false
  /// It failed after that: off until a page is opened again.
  private var off = false
  private var sheets: [SheetAsk] = []
  private var sheetShowing = false

  /// The error of a translation call without its pair or text.
  public static let badRequest = "appHost.translate needs from, to and text."
  public static let badPair = "The translator needs from and to."

  public init(
    engine: TranslationEngine, clock: Clock, limits: Limits = Limits(),
    onScreen: @escaping (ContextSpec) -> Bool
  ) {
    self.engine = engine
    self.clock = clock
    self.limits = limits
    self.onScreen = onScreen
  }

  /// Whether the engine runs for the pair now.
  public func running(_ pair: TranslationPair) -> Bool { loaded.contains(pair) }

  /// `Router.onTranslation`.
  public func handle(_ from: ContextSpec, _ api: String, _ request: JSONValue?, _ done: @escaping Done) {
    switch api {
    case "appHost.translate":
      guard let pair = TranslationPair(request), let text = request?["text"]?.string else {
        return done(.failure(BridgeError(Self.badRequest)))
      }
      guard onScreen(from) else { return done(.success(.null)) }
      queue.append(Job(pair: pair, text: text, start: request?["start"]?.bool ?? true, done: done))
      next()
    case "appHost.translatorStatus":
      guard let pair = TranslationPair(request) else { return done(.failure(BridgeError(Self.badPair))) }
      engine.status(pair) { done(.success(.string($0.rawValue))) }
    case "appHost.prepareTranslator":
      guard let pair = TranslationPair(request) else { return done(.failure(BridgeError(Self.badPair))) }
      sheets.append(SheetAsk(pair: pair, done: done))
      nextSheet()
    case "appHost.models.remove":
      // This app's models are the system's: there are no pack files to delete.
      done(.success(nil))
    default:
      done(.failure(BridgeError(notAvailable(api))))
    }
  }

  /// The app left the screen: the engine goes at once.
  public func leftScreen() { release() }

  /// A page or video was opened again: translation turned off by failures is back.
  public func pageOpened() {
    restarted = false
    off = false
  }

  // MARK: translations

  private func next() {
    while current == nil, !queue.isEmpty {
      let job = queue.removeFirst()
      if off || (!loaded.contains(job.pair) && !job.start) {
        job.done(.success(.null))
        continue
      }
      current = job
      run += 1
      let run = self.run
      if loaded.contains(job.pair) {
        translate(job, run)
      } else {
        timeout = clock.schedule(after: limits.loadMs) { [weak self] in
          self?.finish(run, nil, failure: .engine)
        }
        engine.load(job.pair) { [weak self] result in
          guard let self, run == self.run, current != nil else { return }
          switch result {
          case .success:
            loaded.insert(job.pair)
            cancelTimeout()
            translate(job, run)
          case .failure(let failure):
            finish(run, nil, failure: failure)
          }
        }
      }
    }
  }

  private func translate(_ job: Job, _ run: Int) {
    timeout = clock.schedule(after: limits.sentenceMs) { [weak self] in
      self?.finish(run, nil, failure: nil)
    }
    engine.translate(job.pair, job.text) { [weak self] result in
      switch result {
      case .success(let text): self?.finish(run, text, failure: nil)
      case .failure(let failure): self?.finish(run, nil, failure: failure)
      }
    }
  }

  /// Ends the current job with `text` (nil: no translation).
  private func finish(_ run: Int, _ text: String?, failure: EngineFailure?) {
    guard run == self.run, let job = current else { return }
    current = nil
    cancelTimeout()
    switch failure {
    case .engine:
      // A failure of the engine started again turns it off.
      if restarted { off = true } else { restarted = true }
      dropEngine()
    case .notInstalled:
      loaded.remove(job.pair)
    case .text, nil:
      break
    }
    if job.start, !loaded.isEmpty { armRelease() }
    job.done(.success(text.map(JSONValue.string) ?? .null))
    next()
  }

  private func cancelTimeout() {
    if let timeout { clock.cancel(timeout) }
    timeout = nil
  }

  private func armRelease() {
    if let releaseTimer { clock.cancel(releaseTimer) }
    releaseTimer = clock.schedule(after: limits.releaseMs) { [weak self] in
      self?.releaseTimer = nil
      self?.release()
    }
  }

  private func dropEngine() {
    if let releaseTimer { clock.cancel(releaseTimer) }
    releaseTimer = nil
    loaded.removeAll()
    engine.release()
  }

  /// Releases the engine; the job it works on and those waiting get null.
  private func release() {
    let waiting = (current.map { [$0] } ?? []) + queue
    current = nil
    queue = []
    run += 1
    cancelTimeout()
    dropEngine()
    for job in waiting { job.done(.success(.null)) }
  }

  // MARK: consent sheets

  private func nextSheet() {
    guard !sheetShowing, !sheets.isEmpty else { return }
    let ask = sheets.removeFirst()
    sheetShowing = true
    let answer: (TranslatorStatus) -> Void = { [weak self] status in
      ask.done(.success(.string(status.rawValue)))
      self?.sheetShowing = false
      self?.nextSheet()
    }
    engine.status(ask.pair) { [weak self] status in
      guard let self, status == .download else { return answer(status) }
      engine.prepare(ask.pair) { [weak self] in
        guard let self else { return }
        engine.status(ask.pair, answer)
      }
    }
  }
}
