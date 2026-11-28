"""Changed terms between two built pack dirs, weighted by corpus tokens of a measure.ts run.

  python3 -I pack-diff.py <old pack dir> <new pack dir> <run dir> [n]

Reads index.json and the shards of both pack dirs (e.g. packs-A/en-tr) and rows.jsonl of
the run. Prints the changed / added / removed counts and the n (default 40) most frequent
changed terms as old => new first-sense words and source.
"""
import collections, json, os, sys
a, b, run = sys.argv[1:4]
n = int(sys.argv[4]) if len(sys.argv) > 4 else 40
def load(d):
    idx = json.load(open(os.path.join(d, "index.json")))
    out = {}
    for sh in idx["shards"]:
        for k, v in json.load(open(os.path.join(d, sh["file"]))).items():
            out[("C:" if sh["file"].startswith("capital") else "") + k] = (v[0], idx["sources"][v[1]] if isinstance(v[1], int) else v[1])
    return out
A, B = load(a), load(b)
tok = collections.Counter()
for l in open(os.path.join(run, "rows.jsonl")):
    r = json.loads(l); tok[r["key"]] += 1
ch = [k for k in set(A) | set(B) if A.get(k) != B.get(k)]
print("changed", len(ch), "added", sum(k not in A for k in ch), "removed", sum(k not in B for k in ch), "tokens", sum(tok[k] for k in ch))
fmt = lambda e: "-" if e is None else " / ".join(s[1] for s in e[0])[:70] + " [" + e[1][-2:] + "]"
for k in sorted(ch, key=lambda k: -tok[k])[:n]:
    print(tok[k], k, "|", fmt(A.get(k)), "=>", fmt(B.get(k)))
