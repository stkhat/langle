import LangleCore
import SwiftUI
import Translation

/// The iOS translation engine (docs/specs/mobile-translation.md "The iOS host"): Apple
/// Translation with `highFidelity` (Apple Intelligence's models, the traditional ones on phones
/// without it). One `TranslationSession(installedSource:target:)` per pair, made without a view;
/// releasing drops them. A download needs Apple's consent sheet, which only a view with
/// `translationTask` can show: `TranslatorConsent`, in the window, shows it for `consent`.
@MainActor
final class AppleTranslation: ObservableObject {
  private static let strategy = TranslationSession.Strategy.highFidelity

  /// The pair whose consent sheet is to show now (one at a time: `TranslationHost` asks so).
  @Published private(set) var consent: TranslationSession.Configuration?
  private var consentClosed: (() -> Void)?
  private var sessions: [TranslationPair: TranslationSession] = [:]

  /// Langle's language codes as Apple's languages ("zh" is Simplified Chinese).
  private static func language(_ code: String) -> Locale.Language {
    Locale.Language(identifier: code == "zh" ? "zh-Hans" : code)
  }

  /// The consent view's task: the sheet for `configuration`, then the host goes on.
  func showConsent(_ session: TranslationSession) async {
    do {
      try await session.prepareTranslation()
    } catch {
      // Declined, or the download failed: the status after the sheet says which.
      Log.app.info("translator consent: \(String(describing: error), privacy: .public)")
    }
    consent = nil
    let closed = consentClosed
    consentClosed = nil
    closed?()
  }

  private static func failure(_ error: Error) -> EngineFailure {
    if TranslationError.notInstalled ~= error || TranslationError.unsupportedLanguagePairing ~= error
      || TranslationError.unsupportedSourceLanguage ~= error
      || TranslationError.unsupportedTargetLanguage ~= error
    {
      return .notInstalled
    }
    if TranslationError.nothingToTranslate ~= error || TranslationError.unableToIdentifyLanguage ~= error
      || TranslationError.alreadyCancelled ~= error || error is CancellationError
    {
      return .text
    }
    Log.app.error("translation failed: \(String(describing: error), privacy: .public)")
    return .engine
  }
}

extension AppleTranslation: @preconcurrency TranslationEngine {
  func status(_ pair: TranslationPair, _ done: @escaping (TranslatorStatus) -> Void) {
    let from = Self.language(pair.from)
    let to = Self.language(pair.to)
    Task {
      let status = await LanguageAvailability(preferredStrategy: Self.strategy).status(from: from, to: to)
      switch status {
      case .installed: done(.ready)
      case .supported: done(.download)
      default: done(.unavailable)
      }
    }
  }

  func prepare(_ pair: TranslationPair, _ done: @escaping () -> Void) {
    consentClosed = done
    consent = TranslationSession.Configuration(
      source: Self.language(pair.from), target: Self.language(pair.to), preferredStrategy: Self.strategy)
  }

  func load(_ pair: TranslationPair, _ done: @escaping (Result<Void, EngineFailure>) -> Void) {
    // The models load with the first sentence (inside its 10-second limit).
    sessions[pair] = TranslationSession(
      installedSource: Self.language(pair.from), target: Self.language(pair.to),
      preferredStrategy: Self.strategy)
    done(.success(()))
  }

  func translate(
    _ pair: TranslationPair, _ text: String, _ done: @escaping (Result<String, EngineFailure>) -> Void
  ) {
    guard let session = sessions[pair] else { return done(.failure(.notInstalled)) }
    Task {
      do {
        done(.success(try await session.translate(text).targetText))
      } catch {
        done(.failure(Self.failure(error)))
      }
    }
  }

  func release() {
    for session in sessions.values { session.cancel() }
    sessions = [:]
  }
}

/// The zero-size view that shows Apple's consent sheet for `translation.consent`.
struct TranslatorConsent: View {
  @ObservedObject var translation: AppleTranslation

  var body: some View {
    Color.clear
      .frame(width: 1, height: 1)
      .allowsHitTesting(false)
      .accessibilityHidden(true)
      .translationTask(translation.consent) { session in
        await translation.showConsent(session)
      }
  }
}
