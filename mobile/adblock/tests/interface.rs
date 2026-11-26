//! The C interface on small fixed lists (docs/specs/mobile-app.md "M6: ad blocking" › Testing):
//! build, serialize and load, check, cosmetic, the generic class and id rules, webkitRules and
//! the site. Every call goes through the extern "C" functions the shells use.

use std::ffi::{c_char, CStr, CString};
use std::ptr;

use langle_adblock::ffi::*;
use serde_json::Value;

const PLAIN: &str = include_str!("fixtures/plain.txt");
const TRUSTED: &str = include_str!("fixtures/trusted.txt");
const RESOURCES: &str = include_str!("fixtures/resources.json");

fn list(text: &str, trusted: bool) -> LangleAdblockList {
    LangleAdblockList {
        text: text.as_ptr(),
        len: text.len(),
        trusted,
    }
}

fn take(s: *mut c_char) -> String {
    assert!(!s.is_null(), "call failed: {:?}", last_error());
    let out = unsafe { CStr::from_ptr(s) }.to_str().unwrap().to_owned();
    unsafe { langle_adblock_string_free(s) };
    out
}

fn last_error() -> Option<String> {
    let e = unsafe { langle_adblock_last_error() };
    (!e.is_null()).then(|| take(e))
}

fn c(s: &str) -> CString {
    CString::new(s).unwrap()
}

/// Built from both lists, serialized, then loaded with the fixture resources.
struct Fixture(*mut LangleAdblockEngine);

impl Fixture {
    fn new() -> Self {
        let lists = [list(PLAIN, false), list(TRUSTED, true)];
        let mut bytes = LangleAdblockBytes {
            data: ptr::null_mut(),
            len: 0,
        };
        assert!(unsafe { langle_adblock_build(lists.as_ptr(), lists.len(), &mut bytes) });
        assert!(bytes.len > 0);
        let engine = unsafe {
            langle_adblock_load(bytes.data, bytes.len, RESOURCES.as_ptr(), RESOURCES.len())
        };
        unsafe { langle_adblock_bytes_free(bytes) };
        assert!(!engine.is_null(), "load failed: {:?}", last_error());
        Fixture(engine)
    }

    fn check(&self, url: &str, page: &str, kind: &str) -> i32 {
        unsafe { langle_adblock_check(self.0, c(url).as_ptr(), c(page).as_ptr(), c(kind).as_ptr()) }
    }

    fn cosmetic(&self, page: &str) -> Value {
        serde_json::from_str(&take(unsafe {
            langle_adblock_cosmetic(self.0, c(page).as_ptr())
        }))
        .unwrap()
    }

    fn class_id_css(&self, page: &Value) -> String {
        take(unsafe { langle_adblock_hidden_class_id_css(self.0, c(&page.to_string()).as_ptr()) })
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        unsafe { langle_adblock_engine_free(self.0) };
    }
}

#[test]
fn check_blocks_listed_hosts_and_follows_exceptions_and_options() {
    let e = Fixture::new();
    let page = "https://news.example/story";
    assert_eq!(e.check("https://ads.example/banner.js", page, "script"), 1);
    assert_eq!(e.check("https://sub.ads.example/x.png", page, "image"), 1);
    assert_eq!(e.check("https://ads.example/allowed.js", page, "script"), 0);
    assert_eq!(e.check("https://news.example/app.js", page, "script"), 0);
    // $third-party: blocked from another site, not from its own.
    assert_eq!(e.check("https://tracker.example/t.gif", page, "image"), 1);
    assert_eq!(
        e.check(
            "https://tracker.example/t.gif",
            "https://tracker.example/",
            "image"
        ),
        0
    );
    // $image: only images.
    assert_eq!(e.check("https://images.example/a.png", page, "image"), 1);
    assert_eq!(e.check("https://images.example/a.js", page, "script"), 0);
    // An unknown type is "other".
    assert_eq!(e.check("https://ads.example/x", page, "whatever"), 1);
}

#[test]
fn check_reports_bad_input() {
    let e = Fixture::new();
    assert_eq!(e.check("not a url", "https://news.example/", "script"), -1);
    assert!(last_error().unwrap().contains("request"));
    let r = unsafe {
        langle_adblock_check(
            ptr::null(),
            c("https://a.example/").as_ptr(),
            ptr::null(),
            ptr::null(),
        )
    };
    assert_eq!(r, -1);
    assert_eq!(last_error().as_deref(), Some("engine: null"));
    // A later success clears the error.
    assert_eq!(
        e.check(
            "https://ads.example/a.js",
            "https://news.example/",
            "script"
        ),
        1
    );
    assert_eq!(last_error(), None);
}

#[test]
fn cosmetic_gives_the_host_css_and_its_scriptlets() {
    let e = Fixture::new();
    let page = e.cosmetic("https://news.example/story");
    let css = page["css"].as_str().unwrap();
    assert!(css.contains(".banner{display:none!important}"), "{css}");
    // Generic, not a plain class or id: in css on every page.
    assert!(
        css.contains("div[data-ad-slot]{display:none!important}"),
        "{css}"
    );
    // Procedural rules that are only CSS.
    assert!(css.contains(".sponsored{opacity: 0 !important}"), "{css}");
    assert!(css.contains(".promo{display:none!important}"), "{css}");
    assert!(
        !css.contains("Sponsored"),
        "has-text needs code on the page: {css}"
    );
    // Plain class and id rules come from hidden_class_id_css.
    assert!(!css.contains(".generic-ad"), "{css}");
    let script = page["scriptlets"].as_str().unwrap();
    assert!(
        script.contains("function langle_set_constant()"),
        "{script}"
    );
    assert!(
        script.contains(r#"langle_set_constant("ads.enabled", "false")"#),
        "{script}"
    );
    // A plain list cannot run a trusted scriptlet.
    assert!(
        !script.contains("langle_trusted_replace_node_text"),
        "{script}"
    );
    assert_eq!(page["generichide"], false);

    let other = e.cosmetic("https://elsewhere.example/");
    assert!(!other["css"].as_str().unwrap().contains(".banner"));
    assert_eq!(other["scriptlets"], "");
}

#[test]
fn trusted_lists_run_trusted_scriptlets_and_aliases() {
    let e = Fixture::new();
    let page = e.cosmetic("https://video.example/watch");
    let script = page["scriptlets"].as_str().unwrap();
    assert!(
        script.contains(r#"langle_trusted_replace_node_text("script", "trusted", "list")"#),
        "{script}"
    );
    // `set` is set-constant's alias.
    assert!(
        script.contains(r#"langle_set_constant("player.ads", "null")"#),
        "{script}"
    );
    // A rule naming a scriptlet we do not have is skipped, the others still run.
    assert!(!script.contains("no-such-scriptlet"), "{script}");
    assert_eq!(page["generichide"], true);
}

#[test]
fn the_scriptlets_script_runs_inside_a_wrapper_function() {
    // The shells inject `(function(){\n` + scriptlets + `\n})();`: the script must be a
    // function body (definitions and calls, no top-level return or module syntax).
    let e = Fixture::new();
    let script = e.cosmetic("https://video.example/watch")["scriptlets"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(!script.contains("export ") && !script.contains("import "));
    assert!(script.contains("try {") && script.contains("} catch ( e ) { }"));
}

#[test]
fn hidden_class_id_css_follows_the_pages_classes_ids_and_exceptions() {
    let e = Fixture::new();
    let css = e.class_id_css(&serde_json::json!({
        "classes": ["generic-ad", "article"],
        "ids": ["top-ad", "main"],
        "exceptions": []
    }));
    assert!(css.contains(".generic-ad{display:none!important}"), "{css}");
    assert!(css.contains("#top-ad{display:none!important}"), "{css}");
    assert!(!css.contains("article") && !css.contains("main"), "{css}");
    let excepted = e.class_id_css(&serde_json::json!({
        "classes": ["generic-ad"],
        "exceptions": [".generic-ad"]
    }));
    assert_eq!(excepted, "");
    let r = unsafe { langle_adblock_hidden_class_id_css(e.0, c("{not json").as_ptr()) };
    assert!(r.is_null());
    assert!(last_error().unwrap().starts_with("page:"));
}

#[test]
fn load_refuses_bad_bytes_and_bad_resources() {
    let junk = [1u8, 2, 3, 4];
    let r = unsafe { langle_adblock_load(junk.as_ptr(), junk.len(), ptr::null(), 0) };
    assert!(r.is_null());
    assert!(last_error().unwrap().starts_with("engine:"));

    let lists = [list(PLAIN, false)];
    let mut bytes = LangleAdblockBytes {
        data: ptr::null_mut(),
        len: 0,
    };
    assert!(unsafe { langle_adblock_build(lists.as_ptr(), 1, &mut bytes) });
    let bad = "{";
    let r = unsafe { langle_adblock_load(bytes.data, bytes.len, bad.as_ptr(), bad.len()) };
    assert!(r.is_null());
    assert!(last_error().unwrap().starts_with("resources:"));
    // No resources: loads, and scriptlet rules give no script.
    let r = unsafe { langle_adblock_load(bytes.data, bytes.len, ptr::null(), 0) };
    assert!(!r.is_null());
    let page = take(unsafe { langle_adblock_cosmetic(r, c("https://news.example/").as_ptr()) });
    assert!(page.contains(r#""scriptlets":"""#), "{page}");
    unsafe { langle_adblock_engine_free(r) };
    unsafe { langle_adblock_bytes_free(bytes) };
}

#[test]
fn an_engine_answers_from_several_threads() {
    let e = Fixture::new();
    let engine = e.0 as usize;
    let threads: Vec<_> = (0..4)
        .map(|_| {
            std::thread::spawn(move || {
                let engine = engine as *const LangleAdblockEngine;
                (0..200)
                    .map(|i| unsafe {
                        langle_adblock_check(
                            engine,
                            c(&format!("https://ads.example/{i}.js")).as_ptr(),
                            c("https://news.example/").as_ptr(),
                            c("script").as_ptr(),
                        )
                    })
                    .sum::<i32>()
            })
        })
        .collect();
    for t in threads {
        assert_eq!(t.join().unwrap(), 200);
    }
}

#[test]
fn webkit_rules_convert_the_network_rules() {
    let lists = [list(PLAIN, false)];
    let json = take(unsafe { langle_adblock_webkit_rules(lists.as_ptr(), 1) });
    let rules: Vec<Value> = serde_json::from_str(&json).unwrap();
    let blocks: Vec<&Value> = rules
        .iter()
        .filter(|r| r["action"]["type"] == "block")
        .collect();
    assert!(blocks.iter().any(|r| r["trigger"]["url-filter"]
        .as_str()
        .unwrap()
        .contains("ads\\.example")));
    let third = rules
        .iter()
        .find(|r| {
            r["trigger"]["url-filter"]
                .as_str()
                .unwrap()
                .contains("tracker\\.example")
        })
        .unwrap();
    assert_eq!(
        third["trigger"]["load-type"],
        serde_json::json!(["third-party"])
    );
    // The exception comes after the blocks as ignore-previous-rules.
    let last = rules.last().unwrap();
    assert_eq!(last["action"]["type"], "ignore-previous-rules");
    // No cosmetic rules.
    assert!(
        rules
            .iter()
            .all(|r| r["action"]["type"] != "css-display-none"),
        "{json}"
    );
}

#[test]
fn site_is_the_registrable_domain() {
    let site = |url: &str| {
        let r = unsafe { langle_adblock_site(c(url).as_ptr()) };
        (!r.is_null()).then(|| take(r))
    };
    assert_eq!(
        site("https://m.youtube.com/watch?v=x").as_deref(),
        Some("youtube.com")
    );
    assert_eq!(
        site("https://www.bbc.co.uk/news").as_deref(),
        Some("bbc.co.uk")
    );
    assert_eq!(site("https://example.com").as_deref(), Some("example.com"));
    assert_eq!(site("nonsense"), None);
    assert!(last_error().is_some());
}
