"""Tally baseline judgements (from base-packets.py), re-weighted to the corpus by site and stratum.

  python3 -I base-tally.py <packets dir> --langs tr,zh [--notes]

Reads key-*.json and result-*.json in <packets dir>; prints per language the weighted word
verdicts and phrase fits plus raw counts. --notes lists the first language's bad items.
"""
import argparse, collections, glob, json, os

ap = argparse.ArgumentParser()
ap.add_argument("dir")
ap.add_argument("--langs", required=True, help="comma-separated field names, as given to base-packets.py")
ap.add_argument("--notes", action="store_true")
args = ap.parse_args()
D = args.dir
LANGS = args.langs.split(",")
key = json.load(open(glob.glob(os.path.join(D, "key-*.json"))[0]))
pop = key["meta"]["population"]
res = {}
for f in glob.glob(os.path.join(D, "result-*.json")):
    r = json.load(open(f))
    for w in r.get("words", []):
        res[w["id"]] = ("w", w)
    for p in r.get("phrases", []):
        res[p["id"]] = ("p", p)
VERD = ["good", "acceptable", "wrong", "misleading", "missing"]
FITS = ["yes", "partly", "no"]
for lang in LANGS:
    # words: weighted per site/stratum
    tot = collections.Counter(); wsum = 0
    ptot = collections.Counter(); psum = 0
    raw = collections.Counter(); praw = collections.Counter()
    for site, strata in pop.items():
        for s in ("new", "known"):
            items = [res[i][1] for i, m in key["items"].items() if m["site"] == site and m["stratum"] == s and i in res]
            if not items:
                continue
            w = strata.get(s, 0) / len(items)
            for it in items:
                tot[it[lang]] += w; wsum += w; raw[(s, it[lang])] += 1
        items = [res[i][1] for i, m in key["items"].items() if m["site"] == site and m["stratum"] == "phrase" and i in res]
        if items:
            w = strata.get("phrase", 0) / len(items)
            for it in items:
                ptot[it[lang]] += w; psum += w; praw[it[lang]] += 1
    print(lang, "words", " ".join(f"{v} {100*tot[v]/wsum:.0f}%" for v in VERD),
          "| new raw", {v: raw[("new", v)] for v in VERD}, "known raw", {v: raw[("known", v)] for v in VERD})
    print(lang, "phrases fit", " ".join(f"{v} {100*ptot[v]/psum:.0f}%" for v in FITS), "raw", dict(praw))
lab = collections.Counter(res[i][1].get("label") for i in res if res[i][0] == "p")
print("phrase labels", dict(lab))
if args.notes:
    for i, (k, it) in sorted(res.items()):
        if k == "w" and it.get(LANGS[0]) in ("wrong", "misleading", "missing") or k == "p" and it.get(LANGS[0]) == "no":
            print(i, it.get(LANGS[0]), "|", it.get("note", ""))
