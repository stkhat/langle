"""Judged verdicts by where the hover came from (pack source / translated), raw counts.

  python3 -I by-source.py <packets dir> <run dir> <pack dir> [verdict field, e.g. tr]

Reads key-*.json and result-*.json in <packets dir> (base-packets.py), rows.jsonl of the
run and index.json plus shards of the pack dir. Prints verdict counts per origin for
sampled words and phrases, then the origin shares of all corpus tokens.
"""
import collections, glob, json, os, sys
D, run, pk = sys.argv[1:4]
L = sys.argv[4] if len(sys.argv) > 4 else "hi"
idx = json.load(open(os.path.join(pk, "index.json")))
src = {}
for sh in idx["shards"]:
    cap = sh["file"].startswith("capital")
    for k, v in json.load(open(os.path.join(pk, sh["file"]))).items():
        src[("C" if cap else "") + k] = idx["sources"][v[1]]
rows = [json.loads(l) for l in open(os.path.join(run, "rows.jsonl"))]
key = json.load(open(glob.glob(os.path.join(D, "key-*.json"))[0]))
def origin(r):
    if r["kind"] == "word" and r["verdict"] in ("name", "unknown"): return r["verdict"]
    if r["hoverKind"] != "dict": return r["hoverKind"]
    if r.get("from") is None or "capital" in (r.get("from") or "") or r.get("written") == "capital":
        return "capital:" + src.get("C" + r["surface"], src.get(r["key"], "?"))
    return src.get(r["key"], r.get("from"))
tab = collections.defaultdict(collections.Counter)
for f in glob.glob(os.path.join(D, "result-*.json")):
    res = json.load(open(f))
    for it in res.get("words", []) + res.get("phrases", []):
        m = key["items"][it["id"]]
        r = rows[m["row"]]
        tab[(m["stratum"] == "phrase", origin(r))][it.get(L)] += 1
for k in sorted(tab):
    print(("phrase " if k[0] else "word   ") + k[1], dict(tab[k]))
# corpus token shares
share = collections.Counter(("phrase" if r["kind"] == "phrase" else "word", origin(r)) for r in rows)
for k, v in share.most_common(): print("tokens", k, v)
