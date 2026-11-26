//! Android's JNI layer over the same functions as the C interface (the Kotlin side is
//! mobile/android/app/…/AdblockNative.kt). Strings cross as Java strings (UTF-16, so no
//! modified UTF-8), the lists and the serialized engine as byte arrays. Every function runs in
//! the C interface's `guard`: a failure returns null, 0 or -1 and leaves its reason for
//! `lastError` on the calling thread; nothing panics or throws into the JVM.

#![allow(non_snake_case, clippy::missing_safety_doc)]

use std::ptr;

use jni_sys::{
    jboolean, jbooleanArray, jbyte, jbyteArray, jint, jlong, jobject, jobjectArray, jsize, jstring,
    JNIEnv,
};

use crate::ffi::{guard, last_error, LangleAdblockEngine};
use crate::{ClassesAndIds, List};

macro_rules! jni {
    ($env:expr, $f:ident $(, $arg:expr)*) => {
        ((**$env).v1_2.$f)($env $(, $arg)*)
    };
}

unsafe fn string(env: *mut JNIEnv, s: jstring, what: &str) -> Result<String, String> {
    if s.is_null() {
        return Err(format!("{what}: null"));
    }
    let len = jni!(env, GetStringLength, s);
    let mut units = vec![0u16; len as usize];
    jni!(env, GetStringRegion, s, 0, len, units.as_mut_ptr());
    Ok(String::from_utf16_lossy(&units))
}

unsafe fn new_string(env: *mut JNIEnv, s: &str) -> Result<jstring, String> {
    let units: Vec<u16> = s.encode_utf16().collect();
    let out = jni!(env, NewString, units.as_ptr(), units.len() as jsize);
    if out.is_null() {
        Err("out of memory for a string".to_owned())
    } else {
        Ok(out)
    }
}

unsafe fn bytes(env: *mut JNIEnv, array: jbyteArray, what: &str) -> Result<Vec<u8>, String> {
    if array.is_null() {
        return Err(format!("{what}: null"));
    }
    let len = jni!(env, GetArrayLength, array);
    let mut out = vec![0u8; len as usize];
    jni!(
        env,
        GetByteArrayRegion,
        array,
        0,
        len,
        out.as_mut_ptr() as *mut jbyte
    );
    Ok(out)
}

unsafe fn new_bytes(env: *mut JNIEnv, data: &[u8]) -> Result<jbyteArray, String> {
    let out = jni!(env, NewByteArray, data.len() as jsize);
    if out.is_null() {
        return Err("out of memory for the engine's bytes".to_owned());
    }
    jni!(
        env,
        SetByteArrayRegion,
        out,
        0,
        data.len() as jsize,
        data.as_ptr() as *const jbyte
    );
    Ok(out)
}

unsafe fn engine<'a>(handle: jlong) -> Result<&'a adblock::Engine, String> {
    (handle as *const LangleAdblockEngine)
        .as_ref()
        .map(|e| &e.0)
        .ok_or_else(|| "engine: null".to_owned())
}

/// `build(texts: Array<ByteArray>, trusted: BooleanArray): ByteArray?`: the serialized engine.
#[no_mangle]
pub unsafe extern "system" fn Java_dev_langle_app_AdblockNative_build(
    env: *mut JNIEnv,
    _this: jobject,
    texts: jobjectArray,
    trusted: jbooleanArray,
) -> jbyteArray {
    guard(ptr::null_mut(), || {
        if texts.is_null() || trusted.is_null() {
            return Err("lists: null".to_owned());
        }
        let count = jni!(env, GetArrayLength, texts);
        if jni!(env, GetArrayLength, trusted) != count {
            return Err("lists: as many trusted flags as texts".to_owned());
        }
        let mut flags = vec![false as jboolean; count as usize];
        jni!(
            env,
            GetBooleanArrayRegion,
            trusted,
            0,
            count,
            flags.as_mut_ptr()
        );
        let mut owned = Vec::with_capacity(count as usize);
        for i in 0..count {
            let item = jni!(env, GetObjectArrayElement, texts, i);
            let data = bytes(env, item, &format!("list {i}"));
            jni!(env, DeleteLocalRef, item);
            owned.push(String::from_utf8(data?).map_err(|e| format!("list {i}: {e}"))?);
        }
        let lists: Vec<List> = owned
            .iter()
            .zip(&flags)
            .map(|(text, &t)| List { text, trusted: t })
            .collect();
        new_bytes(env, &crate::build(&lists))
    })
}

/// `load(engine: ByteArray, resources: ByteArray): Long`: a handle, or 0.
#[no_mangle]
pub unsafe extern "system" fn Java_dev_langle_app_AdblockNative_load(
    env: *mut JNIEnv,
    _this: jobject,
    data: jbyteArray,
    resources: jbyteArray,
) -> jlong {
    guard(0, || {
        let serialized = bytes(env, data, "engine bytes")?;
        let resources = String::from_utf8(bytes(env, resources, "resources")?)
            .map_err(|e| format!("resources: {e}"))?;
        let engine = crate::load(
            &serialized,
            if resources.is_empty() {
                "[]"
            } else {
                &resources
            },
        )?;
        Ok(Box::into_raw(Box::new(LangleAdblockEngine(engine))) as jlong)
    })
}

/// `free(engine: Long)`: only once no call on it is running.
#[no_mangle]
pub unsafe extern "system" fn Java_dev_langle_app_AdblockNative_free(
    _env: *mut JNIEnv,
    _this: jobject,
    handle: jlong,
) {
    let engine = handle as *mut LangleAdblockEngine;
    if !engine.is_null() {
        drop(Box::from_raw(engine));
    }
}

/// `check(engine, url, pageUrl, type): Int`: 1 block, 0 allow, -1 bad input.
#[no_mangle]
pub unsafe extern "system" fn Java_dev_langle_app_AdblockNative_check(
    env: *mut JNIEnv,
    _this: jobject,
    handle: jlong,
    url: jstring,
    page_url: jstring,
    kind: jstring,
) -> jint {
    guard(-1, || {
        let blocked = crate::check(
            engine(handle)?,
            &string(env, url, "url")?,
            &string(env, page_url, "page url")?,
            &string(env, kind, "type")?,
        )?;
        Ok(jint::from(blocked))
    })
}

/// `cosmetic(engine, pageUrl): String?`: the JSON of langle_adblock_cosmetic.
#[no_mangle]
pub unsafe extern "system" fn Java_dev_langle_app_AdblockNative_cosmetic(
    env: *mut JNIEnv,
    _this: jobject,
    handle: jlong,
    page_url: jstring,
) -> jstring {
    guard(ptr::null_mut(), || {
        let cosmetic = crate::cosmetic(engine(handle)?, &string(env, page_url, "page url")?);
        new_string(
            env,
            &serde_json::to_string(&cosmetic).map_err(|e| format!("json: {e}"))?,
        )
    })
}

/// `hiddenClassIdCss(engine, pageJson): String?`: as langle_adblock_hidden_class_id_css.
#[no_mangle]
pub unsafe extern "system" fn Java_dev_langle_app_AdblockNative_hiddenClassIdCss(
    env: *mut JNIEnv,
    _this: jobject,
    handle: jlong,
    page_json: jstring,
) -> jstring {
    guard(ptr::null_mut(), || {
        let page: ClassesAndIds = serde_json::from_str(&string(env, page_json, "page")?)
            .map_err(|e| format!("page: {e}"))?;
        new_string(env, &crate::hidden_class_id_css(engine(handle)?, &page))
    })
}

/// `site(url): String?`: the registrable domain of the URL's host.
#[no_mangle]
pub unsafe extern "system" fn Java_dev_langle_app_AdblockNative_site(
    env: *mut JNIEnv,
    _this: jobject,
    url: jstring,
) -> jstring {
    guard(ptr::null_mut(), || {
        let url = string(env, url, "url")?;
        let site = crate::site(&url).ok_or_else(|| format!("no host in {url}"))?;
        new_string(env, &site)
    })
}

/// `lastError(): String?`: why the calling thread's last call failed.
#[no_mangle]
pub unsafe extern "system" fn Java_dev_langle_app_AdblockNative_lastError(
    env: *mut JNIEnv,
    _this: jobject,
) -> jstring {
    match last_error() {
        Some(message) => new_string(env, &message).unwrap_or(ptr::null_mut()),
        None => ptr::null_mut(),
    }
}
