// The same request as LLMProbe.swift, run on the Mac's copy of Apple's on-device model (the
// Simulator's generation fails, docs/notes/mobile.md). The macros need Xcode's plugin path:
//   P=$(xcode-select -p)/Platforms/MacOSX.platform/Developer/usr/lib/swift/host/plugins
//   xcrun swiftc -plugin-path "$P" llm-mac.swift -o "$TMPDIR/llm-mac" && "$TMPDIR/llm-mac"
import Foundation
import FoundationModels

@Generable
struct Meaning {
  @Guide(description: "The word's meaning in this sentence, as a short Japanese phrase")
  var meaning: String
  @Guide(description: "Part of speech in English, e.g. verb")
  var partOfSpeech: String
}

let cases = [
  ("She decided to run for mayor after years of community work.", "run"),
  ("The company will run the new system next month.", "run"),
  ("I can't put up with his rudeness any longer.", "put up with"),
  ("That joke went right over my head.", "went right over my head"),
]

let model = SystemLanguageModel.default
print("availability:", model.availability, "ja:", model.supportsLocale(Locale(identifier: "ja_JP")))
for (sentence, word) in cases {
  let prompt = "Sentence: \"\(sentence)\"\nWhat does \"\(word)\" mean in this sentence? Answer in Japanese."
  do {
    var started = Date()
    let text = try await LanguageModelSession(
      instructions: "You help a Japanese learner of English. Answer briefly in Japanese."
    ).respond(to: prompt)
    print(String(format: "text %.1fs", Date().timeIntervalSince(started)), word, "→", text.content.replacingOccurrences(of: "\n", with: " "))
    started = Date()
    let typed = try await LanguageModelSession().respond(to: prompt, generating: Meaning.self)
    print(String(format: "generable %.1fs", Date().timeIntervalSince(started)), word, "→", typed.content.meaning, "/", typed.content.partOfSpeech)
  } catch {
    print("failed", word, error)
  }
}
