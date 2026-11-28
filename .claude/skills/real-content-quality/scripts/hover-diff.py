"""Hover changes between two measure.ts runs on the same units, by tokens.

  python3 -I hover-diff.py <before run> <after run> [n] [--phrases]

Reads rows.jsonl of both runs; prints the changed-token count and the n (default 60) most
frequent changes as surface | old hover => new hover ("[MT]" marks a machine translation).
"""
import collections, json, os, sys

A, B = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3].isdigit() else 60
kind = "phrase" if "--phrases" in sys.argv else "word"


def load(p):
    out = {}
    for l in open(os.path.join(p, "rows.jsonl")):
        r = json.loads(l)
        if r["kind"] == kind:
            out[(r["doc"], r["unit"], r["start"], r["end"])] = r
    return out


def show(r):
    if r is None:
        return "(absent)"
    if r["kind"] == "word" and r["verdict"] not in ("new", "known"):
        return f"({r['verdict']})"
    t = " / ".join(r.get("hover") or []) or "(none)"
    return ("[MT] " if r.get("hoverKind") == "translated" else "") + t


a, b = load(A), load(B)
c = collections.Counter()
tokens = 0
for k in set(a) | set(b):
    x, y = show(a.get(k)), show(b.get(k))
    if x != y:
        tokens += 1
        r = a.get(k) or b.get(k)
        c[(r["surface"].lower(), x[:70], y[:70])] += 1
print("changed tokens", tokens, "of", len(a), f"({100 * tokens / len(a):.2f}%)", "distinct", len(c))
for (s, x, y), v in c.most_common(n):
    print(v, s, "|", x, "=>", y)
