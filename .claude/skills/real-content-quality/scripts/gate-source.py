"""Gate words by the source that decides them in a built pack.

  python3 -I gate-source.py <pack dir, e.g. packs-A/en-tr> <gate-words.json> <out.json>

Reads index.json and the dict-* shards of the pack dir and the gate word list (a JSON
array). Writes {word: source or null} to <out.json> and prints the count per source.
"""
import collections, json, os, sys
d, gate_file, out_file = sys.argv[1:4]
idx = json.load(open(os.path.join(d, "index.json")))
src = idx["sources"]
dict_ = {}
for sh in [x for x in idx["shards"] if x["file"].startswith("dict")]:
    dict_.update(json.load(open(os.path.join(d, sh["file"]))))
gate = json.load(open(gate_file))
out = {w: (src[dict_[w][1]] if w in dict_ else None) for w in gate}
json.dump(out, open(out_file, "w"), indent=0)
print(collections.Counter(out.values()))
