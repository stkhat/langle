"""Baseline judge packets for a native language: sampled tokens and phrase highlights as
the native and a reference native (default zh, caseless like most targets) see them.

  python3 -I base-packets.py --lang <native> <native run> <ref run> <out dir> [--ref-lang zh] [--seed 11]

Reads rows.jsonl of both measure.ts runs (same units). Per site 2 packets: words (New or
name in either native: 26; known: 12) and 22 phrase highlights. Writes
packet-base-<site>-<n>.json and key-base.json (row per item, kinds, population counts for
re-weighting) into <out dir>. --lang / --ref-lang are the field names the judge sees and
base-tally.py reads back (e.g. "tr", "zh"; "idn" for Indonesian in the r4-id study).
"""
import argparse, collections, json, os, random

ap = argparse.ArgumentParser()
ap.add_argument("native_run")
ap.add_argument("ref_run")
ap.add_argument("out")
ap.add_argument("--lang", required=True)
ap.add_argument("--ref-lang", default="zh")
ap.add_argument("--seed", type=int, default=11)
args = ap.parse_args()
OUT, SEED = args.out, args.seed
R = random.Random(SEED)
LANGS = [args.lang, args.ref_lang]
L0 = args.lang
SITES = ["youtube", "netflix", "article"]
PER_PACKET = {"new": 26, "known": 12, "phrase": 22}


def rows(path):
    with open(os.path.join(path, "rows.jsonl"), encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


data = {L0: rows(args.native_run)}
pos = lambda r: (r["doc"], r["unit"], r["start"], r["end"], r["kind"])
ref = {pos(r): r for r in rows(args.ref_run)}
MISSING = {"kind": "phrase", "verdict": "none", "hoverKind": "none", "hover": [], "key": "", "absent": True}
data[args.ref_lang] = [ref.get(pos(r), MISSING) for r in data[L0]]
n = len(data[L0])


def display(r):
    if r["kind"] == "word" and r["verdict"] == "name":
        return "(name)"
    if r["kind"] == "word" and r["verdict"] == "unknown":
        return "(no meaning)"
    k = r["hoverKind"]
    if r.get("absent"):
        return "(not highlighted)"
    if k == "none" or not r.get("hover"):
        return "(no meaning)"
    if k == "literal":
        return "(the phrase itself, machine-translated)"
    text = " / ".join(r["hover"])
    if k == "translated":
        text = f"[English definition, machine-translated when shown] {text}"
    if r.get("note"):
        text += f"  {{note: {r['note']}}}"
    return text


def stratum(i):
    r = [data[l][i] for l in LANGS]
    if r[0]["kind"] == "phrase":
        return "phrase"
    v = {x["verdict"] for x in r}
    if v == {"unknown"}:
        return None
    if "new" in v or "name" in v:
        return "new"
    return "known"


pools = collections.defaultdict(lambda: collections.defaultdict(list))
population = collections.defaultdict(collections.Counter)
for i in range(n):
    s = stratum(i)
    if s is None:
        continue
    r = data[L0][i]
    if s == "phrase" and len(r["sentence"]) > 400:
        continue
    pools[r["site"]][s].append(i)
    population[r["site"]][s] += 1

os.makedirs(OUT, exist_ok=True)
key = {"meta": {"population": {s: dict(c) for s, c in population.items()}, "seed": SEED}, "items": {}}
for site in SITES:
    for s in pools[site]:
        R.shuffle(pools[site][s])
    for p in range(2):
        name = f"base-{site}-{p}"
        packet = {"words": [], "phrases": []}
        for s, k in PER_PACKET.items():
            for j, i in enumerate(pools[site][s][p * k:(p + 1) * k]):
                r = data[L0][i]
                iid = f"{name}-{s[0]}{j}"
                disp = {l: display(data[l][i]) for l in LANGS}
                if s == "phrase":
                    packet["phrases"].append({"id": iid, "phrase": f"{r['surface']} [{r['key']}]", "sentence": r["sentence"], **disp})
                else:
                    packet["words"].append({"id": iid, "word": r["surface"], "sentence": r["sentence"],
                                            **{l: (data[l][i]["key"] + " — " if not disp[l].startswith("(") else "") + disp[l] for l in LANGS}})
                key["items"][iid] = {"site": site, "stratum": s, "row": i,
                                     "kinds": {l: (data[l][i]["verdict"] if data[l][i]["verdict"] in ("name", "unknown") else data[l][i]["hoverKind"]) for l in LANGS}}
        R.shuffle(packet["words"])
        R.shuffle(packet["phrases"])
        with open(os.path.join(OUT, f"packet-{name}.json"), "w", encoding="utf-8") as f:
            json.dump(packet, f, ensure_ascii=False, indent=1)
        print(name, len(packet["words"]), "words", len(packet["phrases"]), "phrases")
with open(os.path.join(OUT, "key-base.json"), "w", encoding="utf-8") as f:
    json.dump(key, f, ensure_ascii=False, indent=1)
print(json.dumps(key["meta"]["population"]))
