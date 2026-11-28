"""Blind A/B packets for one source-order comparison: gate words whose hover lines differ
between two variant builds, X/Y shuffled.

  python3 -I order-packets.py <name> <lines-P.json> <label-P> <lines-Q.json> <label-Q> [n=60] [--missing-as-none]

Reads two gate-lines.ts outputs. Writes <name>/packet.json, key.json (which label is X) and
diff.json in the current directory. Without --missing-as-none only words with a dictionary
meaning in both builds are compared; with it a word Q gives no dictionary meaning for
counts as "(no meaning)" (a source left out of Q).
"""
import json, os, random, sys
args = [a for a in sys.argv[1:] if a != "--missing-as-none"]
none_ok = "--missing-as-none" in sys.argv
name, pf, pl, qf, ql = args[:5]
n = int(args[5]) if len(args) > 5 else 60
P, Q = json.load(open(pf)), json.load(open(qf))
if none_ok:
    NONE = {"kind": "dict", "lines": ["(no meaning)"]}
    Q = {w: (Q.get(w) if Q.get(w, {}).get("kind") == "dict" else NONE) for w in P}
diff = [w for w in P if P[w].get("kind") == "dict" and Q[w].get("kind") == "dict" and P[w]["lines"] != Q[w]["lines"]]
print(name, len(diff), "gate words differ")
rnd = random.Random(name)
sample = rnd.sample(diff, min(n, len(diff)))
os.makedirs(name, exist_ok=True)
items, key = [], {}
for i, w in enumerate(sample):
    a, b = (P[w], pl), (Q[w], ql)
    if rnd.random() < 0.5: a, b = b, a
    iid = f"{name}-{i}"
    items.append({"id": iid, "word": w, "X": " / ".join(a[0]["lines"]), "Y": " / ".join(b[0]["lines"])})
    key[iid] = {"key": w, "X": a[1]}
json.dump({"items": items}, open(f"{name}/packet.json", "w"), ensure_ascii=False, indent=1)
json.dump(key, open(f"{name}/key.json", "w"), indent=1)
json.dump(diff, open(f"{name}/diff.json", "w"))
