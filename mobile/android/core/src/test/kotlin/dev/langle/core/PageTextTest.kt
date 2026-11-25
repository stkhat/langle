package dev.langle.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

private const val SEARCH = "https://m.youtube.com/results?search_query="

class PageTextTest {
  // Ports of src/entrypoints/home/address.test.ts: the title bar's editing parses as Home does.
  @Nested
  inner class PageForSearch {
    @Test
    fun `opens an http(s) address as typed`() {
      assertEquals("https://example.com/a?b=1", PageText.pageForSearch("https://example.com/a?b=1"))
      assertEquals("http://example.com/", PageText.pageForSearch("  http://example.com  "))
      assertEquals("https://example.com/Path", PageText.pageForSearch("HTTPS://Example.com/Path"))
    }

    @Test
    fun `adds https to text with a dot and no space`() {
      assertEquals("https://example.com/", PageText.pageForSearch("example.com"))
      assertEquals("https://news.example.co.uk/story/1", PageText.pageForSearch("news.example.co.uk/story/1"))
      assertEquals("https://m.youtube.com/watch?v=abc", PageText.pageForSearch("m.youtube.com/watch?v=abc"))
    }

    @Test
    fun `searches YouTube for anything else`() {
      assertEquals("${SEARCH}sourdough%20bread", PageText.pageForSearch("sourdough bread"))
      assertEquals("${SEARCH}bread", PageText.pageForSearch("bread"))
      assertEquals("${SEARCH}how%20to%20bake.%20fast", PageText.pageForSearch("how to bake. fast"))
      assertEquals("${SEARCH}javascript%3Aalert(1)", PageText.pageForSearch("javascript:alert(1)"))
      assertEquals("${SEARCH}C%2B%2B%20%26%20Rust%3F", PageText.pageForSearch("C++ & Rust?"))
      assertEquals("${SEARCH}%E3%83%91%E3%83%B3", PageText.pageForSearch("パン"))
    }

    @Test
    fun `gives nothing for blank text`() {
      assertNull(PageText.pageForSearch(""))
      assertNull(PageText.pageForSearch("   "))
    }
  }

  @Nested
  inner class SiteName {
    @Test
    fun `is the page's og site_name when it has one`() {
      assertEquals("The Weekend Table", PageText.siteName("https://www.weekendtable.example/bread", "  The Weekend Table "))
      assertEquals("YouTube", PageText.siteName("https://m.youtube.com/watch?v=iG9CE55wbtY", "YouTube"))
    }

    @Test
    fun `is the host without www or m otherwise`() {
      assertEquals("example.com", PageText.siteName("https://www.example.com/a", null))
      assertEquals("youtube.com", PageText.siteName("https://m.youtube.com/watch?v=x", "  "))
      assertEquals("news.example.co.uk", PageText.siteName("https://news.example.co.uk/story", null))
      assertEquals("localhost", PageText.siteName("http://localhost:4719/article-en.html", null))
      assertEquals("", PageText.siteName("about:blank", null))
      assertEquals("", PageText.siteName("not a url", null))
    }
  }

  @Nested
  inner class ShownTitle {
    @Test
    fun `leaves out the site's name at the end of the title`() {
      val ted = "Do schools kill creativity? | Sir Ken Robinson | TED"
      assertEquals(ted, PageText.shownTitle("$ted - YouTube", "YouTube", "https://m.youtube.com/watch?v=iG9CE55wbtY"))
      assertEquals("Bread", PageText.shownTitle("Bread | the weekend table", "The Weekend Table", "https://example.com/"))
      assertEquals("Bread", PageText.shownTitle("Bread · The Weekend Table", "The Weekend Table", "https://example.com/"))
      assertEquals("Bread - and more", PageText.shownTitle("Bread - and more", "YouTube", "https://example.com/"))
    }

    @Test
    fun `is the title itself when nothing would be left, and the address when there is none`() {
      assertEquals("YouTube", PageText.shownTitle("YouTube", "YouTube", "https://m.youtube.com/"))
      assertEquals("https://example.com/a", PageText.shownTitle("  ", "example.com", "https://example.com/a"))
      assertEquals("https://example.com/a", PageText.shownTitle(null, "example.com", "https://example.com/a"))
    }
  }

  @Nested
  inner class SamePage {
    @Test
    fun `is the same address, the fragment aside`() {
      assertTrue(PageText.samePage("https://example.com/a#top", "https://example.com/a"))
      assertTrue(PageText.samePage("https://m.youtube.com/watch?v=x", "https://m.youtube.com/watch?v=x"))
      assertFalse(PageText.samePage("https://m.youtube.com/watch?v=x", "https://m.youtube.com/watch?v=y"))
      assertFalse(PageText.samePage(null, "https://example.com/"))
    }
  }
}
