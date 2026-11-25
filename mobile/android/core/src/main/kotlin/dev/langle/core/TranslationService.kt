package dev.langle.core

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/**
 * Android's answers to the calls in [TRANSLATION_APIS] (`Router.onTranslation`;
 * docs/specs/mobile-translation.md "The bridge"): translations from the [host], statuses and
 * downloads from the [store], progress to the extension host as `appHost.models.onProgress`.
 * There is no consent sheet on Android, so `prepareTranslator` answers the status.
 */
class TranslationService(
  private val host: TranslationHost,
  private val store: ModelStore,
  /** Whether the context that asked is on screen (the host serves only that page). */
  private val onScreen: (ContextSpec) -> Boolean,
  private val postToHost: (api: String, args: List<JsonElement>) -> Unit,
) {
  fun handle(from: ContextSpec, api: String, request: JsonElement?, done: (Answer) -> Unit) {
    val o = request.obj
    when (api) {
      "appHost.translate" -> {
        val source = o?.get("from").string
        val target = o?.get("to").string
        val text = o?.get("text").string
        if (source == null || target == null || text == null) return done(Answer.Failure("$api needs from, to and text."))
        val start = o?.get("start").bool ?: true
        host.translate(source, target, text, start, onScreen(from)) { done(Answer.Value(it?.let(::JsonPrimitive) ?: JsonNull)) }
      }
      "appHost.translatorStatus", "appHost.prepareTranslator" -> {
        val source = o?.get("from").string
        val target = o?.get("to").string
        if (source == null || target == null) return done(Answer.Failure("$api needs from and to."))
        done(Answer.Value(JsonPrimitive(store.status(source, target))))
      }
      "appHost.models.ensure" -> {
        val model = ModelRequest.from(request) ?: return done(Answer.Failure(ModelRequest.ERROR))
        store.ensure(
          model,
          { received, total -> postToHost("appHost.models.onProgress", listOf(modelProgress(model.pack, received, total))) },
        ) { error -> done(if (error == null) Answer.Value(null) else Answer.Failure(error)) }
      }
      "appHost.models.remove" -> {
        val pack = o?.get("pack").string?.takeIf(::isSafeName) ?: return done(Answer.Failure("$api needs a pack."))
        host.packRemoved(pack)
        store.remove(pack)
        done(Answer.Value(null))
      }
      else -> done(Answer.Failure(notAvailable(api)))
    }
  }
}
