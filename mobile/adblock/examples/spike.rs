//! M6a's spike (docs/notes/mobile.md "adblock-rust (M6a)"): times the C interface on the real
//! lists, on whichever device runs it (`adb shell` on the emulator, `simctl spawn` on the
//! Simulator, or the Mac).
//!
//! spike <out-dir> <resources.json> <requests.jsonl> <list.txt[:trusted]>...
//!
//! - build + serialize from the lists (3 runs), the engine's size, load (5 runs);
//! - check on every request of <requests.jsonl> (JSON lines {url, page, type}): a first pass
//!   on a fresh engine, as a page load would see it, and a second, warm one;
//! - cosmetic for each page;
//! - webkitRules per list: its rule count and time; the JSON goes to <out-dir>/webkit-<n>.json.

use std::ffi::{CStr, CString};
use std::time::{Duration, Instant};
use std::{env, fs, ptr};

use langle_adblock::ffi::*;
use serde_json::Value;

fn ms(d: Duration) -> f64 {
    d.as_secs_f64() * 1000.0
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    let i = ((sorted.len() as f64 - 1.0) * p).round() as usize;
    sorted[i]
}

fn summary(label: &str, mut times: Vec<f64>) {
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let total: f64 = times.iter().sum();
    println!(
        "{label}: n={} median={:.4}ms p99={:.4}ms max={:.4}ms total={:.1}ms",
        times.len(),
        percentile(&times, 0.5),
        percentile(&times, 0.99),
        times.last().unwrap(),
        total
    );
}

fn take(s: *mut std::ffi::c_char) -> String {
    assert!(!s.is_null());
    let out = unsafe { CStr::from_ptr(s) }.to_string_lossy().into_owned();
    unsafe { langle_adblock_string_free(s) };
    out
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 5 {
        eprintln!("spike <out-dir> <resources.json> <requests.jsonl> <list.txt[:trusted]>...");
        std::process::exit(2);
    }
    let out_dir = &args[1];
    let resources = fs::read_to_string(&args[2]).expect("resources");
    let requests: Vec<Value> = fs::read_to_string(&args[3])
        .expect("requests")
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    let texts: Vec<(String, bool)> = args[4..]
        .iter()
        .map(|a| match a.strip_suffix(":trusted") {
            Some(path) => (fs::read_to_string(path).expect(path), true),
            None => (fs::read_to_string(a).expect(a), false),
        })
        .collect();
    let lists: Vec<LangleAdblockList> = texts
        .iter()
        .map(|(t, trusted)| LangleAdblockList {
            text: t.as_ptr(),
            len: t.len(),
            trusted: *trusted,
        })
        .collect();
    println!(
        "lists: {} ({} bytes, {} lines)",
        lists.len(),
        texts.iter().map(|t| t.0.len()).sum::<usize>(),
        texts.iter().map(|t| t.0.lines().count()).sum::<usize>()
    );

    let mut builds = vec![];
    let mut bytes = LangleAdblockBytes {
        data: ptr::null_mut(),
        len: 0,
    };
    for i in 0..3 {
        if i > 0 {
            unsafe { langle_adblock_bytes_free(bytes) };
        }
        let t = Instant::now();
        assert!(unsafe { langle_adblock_build(lists.as_ptr(), lists.len(), &mut bytes) });
        builds.push(ms(t.elapsed()));
    }
    println!(
        "build+serialize: runs={builds:.0?}ms engine={} bytes",
        bytes.len
    );
    let serialized = unsafe { std::slice::from_raw_parts(bytes.data, bytes.len) }.to_vec();
    fs::write(format!("{out_dir}/engine.dat"), &serialized).unwrap();

    let mut loads = vec![];
    let mut engine = ptr::null_mut();
    for i in 0..5 {
        if i > 0 {
            unsafe { langle_adblock_engine_free(engine) };
        }
        let t = Instant::now();
        engine = unsafe {
            langle_adblock_load(
                serialized.as_ptr(),
                serialized.len(),
                resources.as_ptr(),
                resources.len(),
            )
        };
        loads.push(ms(t.elapsed()));
        assert!(!engine.is_null());
    }
    println!("load: runs={loads:.1?}ms");

    let cstrings: Vec<(CString, CString, CString)> = requests
        .iter()
        .map(|r| {
            let s = |k: &str| CString::new(r[k].as_str().unwrap()).unwrap();
            (s("url"), s("page"), s("type"))
        })
        .collect();
    for pass in ["check (fresh engine)", "check (warm)"] {
        let mut times = Vec::with_capacity(cstrings.len());
        let mut blocked = 0;
        let mut errors = 0;
        for (url, page, kind) in &cstrings {
            let t = Instant::now();
            let r =
                unsafe { langle_adblock_check(engine, url.as_ptr(), page.as_ptr(), kind.as_ptr()) };
            times.push(ms(t.elapsed()));
            match r {
                1 => blocked += 1,
                -1 => errors += 1,
                _ => {}
            }
        }
        let mut slowest: Vec<(f64, usize)> = times.iter().copied().zip(0..).collect();
        slowest.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        summary(&format!("{pass} blocked={blocked} errors={errors}"), times);
        for (t, i) in slowest.iter().take(3) {
            let url = requests[*i]["url"].as_str().unwrap();
            println!("  slowest #{i} {t:.2}ms {}", &url[..url.len().min(90)]);
        }
    }

    let mut pages: Vec<&str> = requests
        .iter()
        .map(|r| r["page"].as_str().unwrap())
        .collect();
    pages.dedup();
    for page in pages {
        let c = CString::new(page).unwrap();
        let t = Instant::now();
        let json = take(unsafe { langle_adblock_cosmetic(engine, c.as_ptr()) });
        let took = ms(t.elapsed());
        let v: Value = serde_json::from_str(&json).unwrap();
        println!(
            "cosmetic {page}: {took:.2}ms css={} bytes scriptlets={} bytes generichide={}",
            v["css"].as_str().unwrap().len(),
            v["scriptlets"].as_str().unwrap().len(),
            v["generichide"]
        );
    }
    unsafe { langle_adblock_engine_free(engine) };
    unsafe { langle_adblock_bytes_free(bytes) };

    let mut total = 0;
    for (i, (arg, list)) in args[4..].iter().zip(&lists).enumerate() {
        let t = Instant::now();
        let json = take(unsafe { langle_adblock_webkit_rules(list, 1) });
        let took = ms(t.elapsed());
        let rules: Vec<Value> = serde_json::from_str(&json).unwrap();
        total += rules.len();
        println!("webkitRules {arg}: {} rules in {took:.0}ms", rules.len());
        fs::write(format!("{out_dir}/webkit-{i}.json"), json).unwrap();
    }
    println!("webkitRules total: {total}");
}
