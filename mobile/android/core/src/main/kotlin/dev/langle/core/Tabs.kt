package dev.langle.core

import kotlinx.serialization.json.JsonObject

/**
 * A tab as `browser.tabs` sees it (docs/specs/mobile-app.md "Shim surface"): the app's pages, the
 * active one being the page on screen. One window.
 */
data class Tab(val id: Int, val url: String, val active: Boolean) {
  val value: JsonObject
    get() = jsonObject("id" to id, "url" to url, "active" to active, "windowId" to 1, "incognito" to false)
}

/** Tab ids, the active tab, and app pages opened by `tabs.create`. */
class Tabs {
  private val tabs = linkedMapOf<Int, Tab>()
  private var nextId = 1

  val all: List<Tab>
    get() = tabs.values.toList()

  val active: Tab?
    get() = tabs.values.firstOrNull { it.active }

  fun open(url: String, active: Boolean = true): Tab {
    val tab = Tab(nextId++, url, false)
    tabs[tab.id] = tab
    if (active) activate(tab.id)
    return tabs.getValue(tab.id)
  }

  fun get(id: Int): Tab? = tabs[id]

  fun activate(id: Int) {
    for ((key, tab) in tabs) tabs[key] = tab.copy(active = key == id)
  }

  fun setUrl(id: Int, url: String) {
    tabs[id]?.let { tabs[id] = it.copy(url = url) }
  }

  fun remove(id: Int): Tab? = tabs.remove(id)

  /** `tabs.query`: only `active` and an exact `url` narrow it, as in the reference. */
  fun query(active: Boolean?, url: String?) =
    all.filter { (active == null || it.active == active) && (url == null || it.url == url) }
}
