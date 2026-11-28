"""Tally judge results of an order-packets.py comparison.

  python3 -I order-tally.py <name>

Reads <name>/key.json and <name>/result-*.json; prints per judge the preference counts and
each label's verdict counts.
"""
import collections, glob, json, sys
name = sys.argv[1]
key = json.load(open(f"{name}/key.json"))
for f in sorted(glob.glob(f"{name}/result-*.json")):
    res = json.load(open(f))["items"]
    pref = collections.Counter(); verdict = collections.defaultdict(collections.Counter)
    for it in res:
        k = key[it["id"]]; x = k["X"]
        labels = {"X": x, "Y": [l for l in set(v["X"] for v in key.values()) if l != x][0]}
        pref[labels.get(it["pref"], "same")] += 1
        verdict[labels["X"]][it["X"]] += 1; verdict[labels["Y"]][it["Y"]] += 1
    print(f, dict(pref), {k: dict(v) for k, v in verdict.items()})
