// The phone app's ad-blocking engine: Brave's adblock-rust (MPL-2.0) behind a small C
// interface (docs/specs/mobile-app.md "M6: ad blocking"). Built by `npm run mobile:adblock`
// into a .so per Android ABI and an iOS XCFramework (module LangleAdblock).
//
// Conventions:
// - Strings in are UTF-8: NUL-terminated (`const char *`) for URLs and small JSON, pointer and
//   length for the lists' texts and the resources file.
// - Strings out (`char *`) are NUL-terminated UTF-8 owned by the crate: free each with
//   langle_adblock_string_free. Bytes out: langle_adblock_bytes_free.
// - On failure a function returns NULL, false or -1, and langle_adblock_last_error() gives the
//   reason (on the same thread; NULL when the last call succeeded). No function panics or
//   throws into the caller.
// - An engine is thread-safe: check, cosmetic and hidden_class_id_css may run on several
//   threads at once. Free it only when no call on it is running.
#ifndef LANGLE_ADBLOCK_H
#define LANGLE_ADBLOCK_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct LangleAdblockEngine LangleAdblockEngine;

// One filter list. `trusted` (filter-lists.json's `trusted`, uBO's own lists) lets its rules
// run the trusted-* scriptlets (permission bit 1); other lists' rules naming them are skipped.
typedef struct {
  const uint8_t *text;
  size_t len;
  bool trusted;
} LangleAdblockList;

typedef struct {
  uint8_t *data;
  size_t len;
} LangleAdblockBytes;

// Builds an engine from the lists and writes it serialized into *out: the bytes the list
// store keeps in the app's files. Slow (seconds): call it off the main thread.
bool langle_adblock_build(const LangleAdblockList *lists, size_t count, LangleAdblockBytes *out);
void langle_adblock_bytes_free(LangleAdblockBytes bytes);

// Loads an engine serialized by langle_adblock_build of the same crate build, with the
// scriptlets: the langle-app build's adblock/resources.json (adblock-rust's Resource array;
// an empty text means none). Bytes of another adblock-rust version fail: build again.
LangleAdblockEngine *langle_adblock_load(const uint8_t *data, size_t len,
                                         const uint8_t *resources_json, size_t resources_len);
void langle_adblock_engine_free(LangleAdblockEngine *engine);

// 1 to block a subresource request, 0 to let it through, -1 on bad input (an URL with no
// host). `page_url` is the top page's URL; `type` is one of document, sub_frame, stylesheet,
// script, image, font, media, object, xmlhttprequest, websocket, ping, other (anything else
// counts as other). Never ask for the main frame: it is never blocked.
int32_t langle_adblock_check(const LangleAdblockEngine *engine, const char *url,
                             const char *page_url, const char *type);

// The page's cosmetic resources, as JSON:
//   {"css": "<stylesheet>", "scriptlets": "<script>", "generichide": bool,
//    "exceptions": ["<selector>", ...]}
// - css: the lists' element-hiding rules for the page's host and the generic rules that are
//   not plain class or id selectors; insert it at document start.
// - scriptlets: empty, or a script of function definitions and calls. Wrap it before
//   injecting it, so its functions stay off the page's globals, and inject it in the page's
//   world at document start: `(function(){\n` + scriptlets + `\n})();`
// - generichide and exceptions: for langle_adblock_hidden_class_id_css.
char *langle_adblock_cosmetic(const LangleAdblockEngine *engine, const char *page_url);

// The generic `##.class` / `###id` rules (most of EasyList's generic hiding) are not in css:
// collect the page's classes and ids (at start and as nodes are added) and pass them with the
// page's exceptions, unless generichide is true:
//   {"classes": ["..."], "ids": ["..."], "exceptions": [...]}
// Returns a stylesheet (possibly empty) for the selectors those classes and ids need.
char *langle_adblock_hidden_class_id_css(const LangleAdblockEngine *engine, const char *page_json);

// The lists' network rules as WebKit content-blocker JSON (a WKContentRuleList array; no
// cosmetic rules: those come from langle_adblock_cosmetic on iOS too). Call it per list and
// split arrays over WebKit's rule limit. Slow (seconds): off the main thread.
char *langle_adblock_webkit_rules(const LangleAdblockList *lists, size_t count);

// The registrable domain of the URL's host (the engine's public-suffix list), e.g.
// "https://m.youtube.com/watch" -> "youtube.com": the site of adBlocking.offSites.
char *langle_adblock_site(const char *url);

// The reason the calling thread's last call failed, or NULL. Free it.
char *langle_adblock_last_error(void);
void langle_adblock_string_free(char *s);

#ifdef __cplusplus
}
#endif

#endif
