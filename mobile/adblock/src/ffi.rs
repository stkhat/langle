//! The C interface (include/langle_adblock.h has the contract). Every function catches panics,
//! so a bug in the engine never unwinds into the shells; a failure returns NULL / false / -1
//! and leaves its reason for `langle_adblock_last_error` on the calling thread.

// The safety contract of every function is in include/langle_adblock.h.
#![allow(clippy::missing_safety_doc)]

use std::cell::RefCell;
use std::ffi::{c_char, CStr, CString};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::{ptr, slice};

use adblock::Engine;

use crate::{ClassesAndIds, List};

/// A list's UTF-8 text (not NUL-terminated) and whether it may use the trusted scriptlets.
#[repr(C)]
pub struct LangleAdblockList {
    pub text: *const u8,
    pub len: usize,
    pub trusted: bool,
}

/// Bytes owned by the crate: free with `langle_adblock_bytes_free`.
#[derive(Clone, Copy)]
#[repr(C)]
pub struct LangleAdblockBytes {
    pub data: *mut u8,
    pub len: usize,
}

/// An engine: thread-safe, so `check` may be called from several threads at once.
pub struct LangleAdblockEngine(Engine);

thread_local! {
    static LAST_ERROR: RefCell<Option<String>> = const { RefCell::new(None) };
}

fn set_error(message: String) {
    LAST_ERROR.with(|e| *e.borrow_mut() = Some(message));
}

fn guard<T>(fallback: T, body: impl FnOnce() -> Result<T, String>) -> T {
    LAST_ERROR.with(|e| *e.borrow_mut() = None);
    match catch_unwind(AssertUnwindSafe(body)) {
        Ok(Ok(value)) => value,
        Ok(Err(message)) => {
            set_error(message);
            fallback
        }
        Err(panic) => {
            let message = panic
                .downcast_ref::<&str>()
                .map(|s| (*s).to_owned())
                .or_else(|| panic.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown panic".to_owned());
            set_error(format!("panic: {message}"));
            fallback
        }
    }
}

unsafe fn text<'a>(data: *const u8, len: usize, what: &str) -> Result<&'a str, String> {
    if data.is_null() {
        return if len == 0 {
            Ok("")
        } else {
            Err(format!("{what}: null"))
        };
    }
    std::str::from_utf8(slice::from_raw_parts(data, len)).map_err(|e| format!("{what}: {e}"))
}

unsafe fn c_str<'a>(s: *const c_char, what: &str) -> Result<&'a str, String> {
    if s.is_null() {
        return Err(format!("{what}: null"));
    }
    CStr::from_ptr(s)
        .to_str()
        .map_err(|e| format!("{what}: {e}"))
}

unsafe fn lists<'a>(
    lists: *const LangleAdblockList,
    count: usize,
) -> Result<Vec<List<'a>>, String> {
    if count == 0 {
        return Ok(Vec::new());
    }
    if lists.is_null() {
        return Err("lists: null".to_owned());
    }
    slice::from_raw_parts(lists, count)
        .iter()
        .enumerate()
        .map(|(i, list)| {
            Ok(List {
                text: text(list.text, list.len, &format!("list {i}"))?,
                trusted: list.trusted,
            })
        })
        .collect()
}

fn owned_c_string(s: String) -> Result<*mut c_char, String> {
    CString::new(s)
        .map(CString::into_raw)
        .map_err(|e| format!("string: {e}"))
}

fn json<T: serde::Serialize>(value: &T) -> Result<*mut c_char, String> {
    owned_c_string(serde_json::to_string(value).map_err(|e| format!("json: {e}"))?)
}

unsafe fn engine<'a>(engine: *const LangleAdblockEngine) -> Result<&'a Engine, String> {
    engine
        .as_ref()
        .map(|e| &e.0)
        .ok_or_else(|| "engine: null".to_owned())
}

#[no_mangle]
pub unsafe extern "C" fn langle_adblock_build(
    lists_ptr: *const LangleAdblockList,
    count: usize,
    out: *mut LangleAdblockBytes,
) -> bool {
    guard(false, || {
        if out.is_null() {
            return Err("out: null".to_owned());
        }
        let bytes = crate::build(&lists(lists_ptr, count)?).into_boxed_slice();
        let len = bytes.len();
        let data = Box::into_raw(bytes) as *mut u8;
        *out = LangleAdblockBytes { data, len };
        Ok(true)
    })
}

#[no_mangle]
pub unsafe extern "C" fn langle_adblock_bytes_free(bytes: LangleAdblockBytes) {
    if !bytes.data.is_null() {
        drop(Box::from_raw(ptr::slice_from_raw_parts_mut(
            bytes.data, bytes.len,
        )));
    }
}

#[no_mangle]
pub unsafe extern "C" fn langle_adblock_load(
    data: *const u8,
    len: usize,
    resources_json: *const u8,
    resources_len: usize,
) -> *mut LangleAdblockEngine {
    guard(ptr::null_mut(), || {
        if data.is_null() {
            return Err("engine bytes: null".to_owned());
        }
        let serialized = slice::from_raw_parts(data, len);
        let resources = text(resources_json, resources_len, "resources")?;
        let engine = crate::load(
            serialized,
            if resources.is_empty() {
                "[]"
            } else {
                resources
            },
        )?;
        Ok(Box::into_raw(Box::new(LangleAdblockEngine(engine))))
    })
}

#[no_mangle]
pub unsafe extern "C" fn langle_adblock_engine_free(engine: *mut LangleAdblockEngine) {
    if !engine.is_null() {
        drop(Box::from_raw(engine));
    }
}

#[no_mangle]
pub unsafe extern "C" fn langle_adblock_check(
    engine_ptr: *const LangleAdblockEngine,
    url: *const c_char,
    page_url: *const c_char,
    kind: *const c_char,
) -> i32 {
    guard(-1, || {
        let blocked = crate::check(
            engine(engine_ptr)?,
            c_str(url, "url")?,
            c_str(page_url, "page url")?,
            c_str(kind, "type")?,
        )?;
        Ok(i32::from(blocked))
    })
}

#[no_mangle]
pub unsafe extern "C" fn langle_adblock_cosmetic(
    engine_ptr: *const LangleAdblockEngine,
    page_url: *const c_char,
) -> *mut c_char {
    guard(ptr::null_mut(), || {
        json(&crate::cosmetic(
            engine(engine_ptr)?,
            c_str(page_url, "page url")?,
        ))
    })
}

#[no_mangle]
pub unsafe extern "C" fn langle_adblock_hidden_class_id_css(
    engine_ptr: *const LangleAdblockEngine,
    page_json: *const c_char,
) -> *mut c_char {
    guard(ptr::null_mut(), || {
        let page: ClassesAndIds =
            serde_json::from_str(c_str(page_json, "page")?).map_err(|e| format!("page: {e}"))?;
        owned_c_string(crate::hidden_class_id_css(engine(engine_ptr)?, &page))
    })
}

#[no_mangle]
pub unsafe extern "C" fn langle_adblock_webkit_rules(
    lists_ptr: *const LangleAdblockList,
    count: usize,
) -> *mut c_char {
    guard(ptr::null_mut(), || {
        owned_c_string(crate::webkit_rules(&lists(lists_ptr, count)?)?)
    })
}

#[no_mangle]
pub unsafe extern "C" fn langle_adblock_site(url: *const c_char) -> *mut c_char {
    guard(ptr::null_mut(), || {
        let url = c_str(url, "url")?;
        owned_c_string(crate::site(url).ok_or_else(|| format!("no host in {url}"))?)
    })
}

#[no_mangle]
pub unsafe extern "C" fn langle_adblock_last_error() -> *mut c_char {
    LAST_ERROR.with(|e| match e.borrow().as_ref() {
        Some(message) => CString::new(message.replace('\0', " "))
            .map(CString::into_raw)
            .unwrap_or(ptr::null_mut()),
        None => ptr::null_mut(),
    })
}

#[no_mangle]
pub unsafe extern "C" fn langle_adblock_string_free(s: *mut c_char) {
    if !s.is_null() {
        drop(CString::from_raw(s));
    }
}
