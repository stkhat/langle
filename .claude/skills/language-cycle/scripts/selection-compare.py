#!/usr/bin/env python3
"""Two cycles' selection checks -> what moved, per pair.

  python3 -I .claude/skills/language-cycle/scripts/selection-compare.py \
      --before <prev cycle>/selection --after <cycle>/selection [--out compare.md]

Compares what both have, selection by selection (the items' ids), so items added since
are left out of the numbers:
- offline (selection-check.ts, deterministic): WORSE when a kind has fewer recovered or
  more wrong, or when a shown phrase's meaning falls back (dictionary -> English
  definition -> the words' machine translation);
- judged samples (selection-packets.py tally): CHECK when the share of wrong meanings
  or wrong phrases rose by 5 points or more (one judge per item: smaller is noise);
- on-device AI (selection-nano.ts score, when both ran): CHECK when the shipped prompt's
  precision fell by 10 points or more, or it corrected 10% fewer selections or more.
Exit code 2 when any WORSE flag is raised, so a caller can stop on it.
"""
import argparse
import collections
import json
import os
import sys

MEANING_RANK = {"literal": 0, "definition": 1, "dictionary": 2}


def load(*parts):
    path = os.path.join(*parts)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def rows(folder, pair):
    path = os.path.join(folder, "offline", f"rows-{pair}.jsonl")
    with open(path, encoding="utf-8") as f:
        return {r["id"]: r for r in map(json.loads, f)}


def share(counts, name):
    total = sum(counts.values())
    return 100 * counts.get(name, 0) / total if total else 0


p = argparse.ArgumentParser()
p.add_argument("--before", required=True)
p.add_argument("--after", required=True)
p.add_argument("--out")
p.add_argument("--samples", type=int, default=5)
a = p.parse_args()

before = load(a.before, "offline", "summary.json")
after = load(a.after, "offline", "summary.json")
if not before or not after:
    sys.exit("Both folders need offline/summary.json (selection-check.ts)")

worse = False
lines = [
    "# Selection compared",
    "",
    f"{before['meta']['sha']} -> {after['meta']['sha']}",
    "",
    "| pair | common items | recovered | wrong | changed | meaning fell back | flags |",
    "|---|---|---|---|---|---|---|",
]
detail = []
for pair in after["pairs"]:
    if pair not in before["pairs"]:
        lines.append(f"| {pair} | new pair | | | | | |")
        continue
    old, new = rows(a.before, pair), rows(a.after, pair)
    common = sorted(old.keys() & new.keys())
    count = [collections.Counter(), collections.Counter()]
    changed, fell = [], []
    for i in common:
        x, y = old[i], new[i]
        for side, r in enumerate((x, y)):
            count[side][(r["kind"], r["outcome"])] += 1
        if (x["outcome"], x.get("shown"), x["meaning"]) != (y["outcome"], y.get("shown"), y["meaning"]):
            changed.append((x, y))
        if x.get("shown") and y.get("shown"):
            if MEANING_RANK[y["meaningKind"]] < MEANING_RANK[x["meaningKind"]]:
                fell.append((x, y))
    flags = []
    for kind in sorted({k for side in count for k, _ in side}):
        for outcome, sign in (("recovered", -1), ("wrong", 1)):
            move = count[1][(kind, outcome)] - count[0][(kind, outcome)]
            if move * sign > 0:
                flags.append(f"WORSE {kind} {outcome} {move:+d}")
    if fell:
        flags.append("WORSE meaning fell back")
    worse = worse or bool(flags)

    def moved(outcome):
        totals = [sum(n for (_, o), n in side.items() if o == outcome) for side in count]
        return f"{totals[0]} -> {totals[1]}"

    lines.append(
        f"| {pair} | {len(common)} | {moved('recovered')} | {moved('wrong')} |"
        f" {len(changed)} | {len(fell)} | {'; '.join(flags)} |"
    )
    for x, y in changed[: a.samples]:
        detail.append(
            f"- {pair} {y['kind']} [{y['selected']}]: {x['outcome']} {x.get('shown', '-')}"
            f" {x['meaning'][:1]} -> {y['outcome']} {y.get('shown', '-')} {y['meaning'][:1]}"
        )

checks = []
old_judged = load(a.before, "judged-offline.json") or {}
new_judged = load(a.after, "judged-offline.json") or {}
for run, pairs in new_judged.items():
    for pair, now in pairs.items():
        then = old_judged.get(run, {}).get(pair)
        if not then:
            continue
        for what in ("meaning", "phrase"):
            x, y = share(then[what], "wrong"), share(now[what], "wrong")
            flag = " CHECK" if y - x >= 5 else ""
            checks.append(f"- judged {pair}, wrong {what}: {x:.0f}% -> {y:.0f}%{flag}")

old_ai = load(a.before, "nano", "scores-shipped-test.json")
new_ai = load(a.after, "nano", "scores-shipped-test.json")
if old_ai and new_ai:
    for pair, now in new_ai["pairs"].items():
        then = old_ai["pairs"].get(pair)
        if not then:
            continue
        x, y = then["total"], now["total"]
        precision = [
            100 * t["correct"] / (t["correct"] + t["wrong"]) if t["correct"] + t["wrong"] else None
            for t in (x, y)
        ]
        check = y["correct"] < x["correct"] * 0.9
        if None not in precision:
            check = check or precision[0] - precision[1] >= 10
        checks.append(
            f"- AI {pair}: corrected {x['correct']} -> {y['correct']},"
            f" wrong proposals {x['wrong']} -> {y['wrong']}{' CHECK' if check else ''}"
        )
else:
    checks.append("- AI: not compared (no run of the shipped prompt on one side)")

text = "\n".join([*lines, "", *checks, "", *detail]) + "\n"
if a.out:
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(text)
print("\n".join([*lines, "", *checks]))
sys.exit(2 if worse else 0)
