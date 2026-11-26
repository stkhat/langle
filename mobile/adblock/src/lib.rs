//! The phone app's ad-blocking engine (docs/specs/mobile-app.md "M6: ad blocking"): Brave's
//! adblock-rust behind the small C interface in `include/langle_adblock.h`, which both shells
//! call (JNI on Android, Swift on iOS). This module is the safe Rust side; `ffi` is the C side.

use std::collections::HashSet;

use adblock::lists::{FilterSet, ParseOptions};
use adblock::request::Request;
use adblock::resources::{PermissionMask, Resource};
use adblock::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub mod ffi;

/// The permission bit of uBO's trusted scriptlets (scripts/adblock-resources.ts
/// `TRUSTED_PERMISSION`): only lists marked `trusted` in mobile/protocol/filter-lists.json are
/// parsed with it, so only they can run the `trusted-*` scriptlets.
pub const TRUSTED_PERMISSION: u8 = 1;

/// One filter list's text and whether it may use the trusted scriptlets.
pub struct List<'a> {
    pub text: &'a str,
    pub trusted: bool,
}

fn filter_set(lists: &[List], debug: bool) -> FilterSet {
    let mut set = FilterSet::new(debug);
    for list in lists {
        let permissions = if list.trusted {
            PermissionMask::from_bits(TRUSTED_PERMISSION)
        } else {
            PermissionMask::default()
        };
        set.add_filter_list(
            list.text.to_owned(),
            ParseOptions {
                permissions,
                ..ParseOptions::default()
            },
        );
    }
    set
}

/// Builds an engine from the lists and serializes it: the bytes the list store keeps in the
/// app's files and hands to [`load`].
pub fn build(lists: &[List]) -> Vec<u8> {
    Engine::new_with_filter_set(filter_set(lists, false)).serialize()
}

/// Loads an engine serialized by [`build`] of this crate version, with the scriptlets of the
/// langle-app build's `adblock/resources.json` (adblock-rust's `Resource` array).
pub fn load(serialized: &[u8], resources_json: &str) -> Result<Engine, String> {
    let resources: Vec<Resource> =
        serde_json::from_str(resources_json).map_err(|e| format!("resources: {e}"))?;
    let mut engine = Engine::default();
    engine
        .deserialize(serialized)
        .map_err(|e| format!("engine: {e:?}"))?;
    engine.use_resources(resources);
    Ok(engine)
}

/// Whether the engine blocks a subresource of `page_url`. `kind` is the resource type in
/// adblock-rust's names (`script`, `image`, `stylesheet`, `xmlhttprequest`, `sub_frame`,
/// `font`, `media`, `websocket`, `ping`, `other` …).
pub fn check(engine: &Engine, url: &str, page_url: &str, kind: &str) -> Result<bool, String> {
    let request =
        Request::new(url, page_url, kind, "GET").map_err(|e| format!("request: {e:?}"))?;
    Ok(engine.check_network_request(&request).should_block())
}

/// What a page gets at document start.
#[derive(Serialize, Debug, PartialEq)]
pub struct Cosmetic {
    /// A stylesheet hiding the page's elements: the lists' rules for its host and the generic
    /// ones that are not plain class or id selectors, plus the procedural rules that are only a
    /// CSS selector with no action, `:remove()` (hidden) or `:style(…)`.
    pub css: String,
    /// The scriptlets' script (empty when none): one function per scriptlet and a call per
    /// rule. Run it inside a function of your own, never as is, so the functions stay off the
    /// page's globals: `(function(){ <scriptlets> })();` in the page's world.
    pub scriptlets: String,
    /// True when a `$generichide` exception covers the page: do not ask for generic class and
    /// id rules.
    pub generichide: bool,
    /// Class and id selectors excepted on the page, to pass back to [`hidden_class_id_css`].
    pub exceptions: Vec<String>,
}

const HIDE: &str = "{display:none!important}";

/// The page's stylesheet and scriptlets.
pub fn cosmetic(engine: &Engine, page_url: &str) -> Cosmetic {
    let resources = engine.url_cosmetic_resources(page_url);
    let mut selectors: Vec<String> = resources.hide_selectors.into_iter().collect();
    selectors.sort();
    let mut css: String = selectors.iter().map(|s| format!("{s}{HIDE}\n")).collect();
    let mut procedural: Vec<String> = resources
        .procedural_actions
        .iter()
        .filter_map(|json| procedural_css(json))
        .collect();
    procedural.sort();
    for rule in procedural {
        css.push_str(&rule);
        css.push('\n');
    }
    let mut exceptions: Vec<String> = resources.exceptions.into_iter().collect();
    exceptions.sort();
    Cosmetic {
        css,
        scriptlets: resources.injected_script,
        generichide: resources.generichide,
        exceptions,
    }
}

/// A procedural rule as CSS when it is one CSS selector with no action, `remove` or `style`.
/// Rules that need code on the page (`:has-text`, `:upward`, `:remove-attr` …) are skipped.
fn procedural_css(json: &str) -> Option<String> {
    let rule: Value = serde_json::from_str(json).ok()?;
    let parts = rule.get("selector")?.as_array()?;
    let [part] = parts.as_slice() else {
        return None;
    };
    if part.get("type")?.as_str()? != "css-selector" {
        return None;
    }
    let selector = part.get("arg")?.as_str()?;
    match rule.get("action") {
        None | Some(Value::Null) => Some(format!("{selector}{HIDE}")),
        Some(action) => match action.get("type")?.as_str()? {
            "remove" => Some(format!("{selector}{HIDE}")),
            "style" => Some(format!("{selector}{{{}}}", action.get("arg")?.as_str()?)),
            _ => None,
        },
    }
}

/// The page's classes and ids, as the shells' document-start script collects them.
#[derive(Deserialize, Debug, Default)]
pub struct ClassesAndIds {
    #[serde(default)]
    pub classes: Vec<String>,
    #[serde(default)]
    pub ids: Vec<String>,
    /// [`Cosmetic::exceptions`] of the same page.
    #[serde(default)]
    pub exceptions: Vec<String>,
}

/// A stylesheet of the generic `##.class` and `###id` rules the page's classes and ids need
/// (EasyList's generic rules are mostly these; they are not in [`Cosmetic::css`]).
pub fn hidden_class_id_css(engine: &Engine, page: &ClassesAndIds) -> String {
    let exceptions: HashSet<String> = page.exceptions.iter().cloned().collect();
    let mut selectors = engine.hidden_class_id_selectors(&page.classes, &page.ids, &exceptions);
    selectors.sort();
    selectors.iter().map(|s| format!("{s}{HIDE}\n")).collect()
}

/// The lists' network rules as WebKit content-blocker rules (`WKContentRuleList`'s JSON
/// array). Cosmetic rules are left out: the shells inject [`cosmetic`] on every engine.
pub fn webkit_rules(lists: &[List]) -> Result<String, String> {
    let mut set = FilterSet::new(true);
    for list in lists {
        set.add_filter_list(
            list.text.to_owned(),
            ParseOptions {
                rule_types: adblock::lists::RuleTypes::NetworkOnly,
                ..ParseOptions::default()
            },
        );
    }
    let (rules, _) = set
        .into_content_blocking()
        .map_err(|_| "content blocking: the filter set is not in debug mode".to_owned())?;
    serde_json::to_string(&rules).map_err(|e| format!("webkit rules: {e}"))
}

/// The registrable domain of a URL's host (adblock-rust's public-suffix list): the "site" of
/// `adBlocking.offSites`. None when the URL has no host.
pub fn site(url: &str) -> Option<String> {
    let parsed = adblock::url_parser::parse_url(url)?;
    let domain = parsed.domain();
    if domain.is_empty() {
        None
    } else {
        Some(domain.to_owned())
    }
}
