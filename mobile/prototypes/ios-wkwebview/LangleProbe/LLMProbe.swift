import Foundation

#if canImport(FoundationModels)
  import FoundationModels
#endif

/// Whether Apple's on-device model (Foundation Models framework) answers a Langle-style
/// "meaning in context" request (docs/notes/mobile.md "On-device LLM"). Run with `check.sh cmd llm`.
enum LLMProbe {
  static let sentence = "She decided to run for mayor after years of community work."
  static let word = "run"

  static func run() {
    #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        Task { await probe() }
        return
      }
    #endif
    log.info("llm unavailable: no FoundationModels (iOS 26+)")
  }

  #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    @Generable
    struct Meaning {
      @Guide(description: "The word's meaning in this sentence, as a short Japanese phrase")
      var meaning: String
      @Guide(description: "Part of speech in English, e.g. verb")
      var partOfSpeech: String
    }

    @available(iOS 26.0, *)
    static func probe() async {
      let model = SystemLanguageModel.default
      let ja = model.supportsLocale(Locale(identifier: "ja_JP"))
      log.info("llm availability=\(String(describing: model.availability), privacy: .public) ja=\(ja, privacy: .public) languages=\(model.supportedLanguages.count, privacy: .public)")
      guard case .available = model.availability else { return }
      let prompt = "Sentence: \"\(sentence)\"\nWhat does \"\(word)\" mean in this sentence? Answer in Japanese."
      do {
        var started = Date()
        let text = try await LanguageModelSession(
          instructions: "You help a Japanese learner of English. Answer briefly in Japanese."
        ).respond(to: prompt)
        log.info("llm text \(String(format: "%.1f", Date().timeIntervalSince(started)), privacy: .public)s \(text.content, privacy: .public)")
        started = Date()
        let typed = try await LanguageModelSession().respond(to: prompt, generating: Meaning.self)
        log.info("llm generable \(String(format: "%.1f", Date().timeIntervalSince(started)), privacy: .public)s meaning=\(typed.content.meaning, privacy: .public) pos=\(typed.content.partOfSpeech, privacy: .public)")
      } catch {
        log.error("llm failed \(String(describing: error), privacy: .public)")
      }
    }
  #endif
}
