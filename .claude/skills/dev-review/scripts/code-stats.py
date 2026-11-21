"""Code and test hot spots for the dev review (.claude/skills/dev-review/SKILL.md).

  python3 -I .claude/skills/dev-review/scripts/code-stats.py --since YYYY-MM-DD --out DIR [--tests]

Writes DIR/code-stats.json and prints a short summary. Read-only on the repo. --tests also
runs the unit and browser (Chromium) suites once with Vitest's JSON reporter to get
per-file durations: it is heavy, so check the machine first (signals.md "Machine load").
"""

import collections
import json
import os
import re
import subprocess
import sys

CODE = re.compile(r"^(src|scripts|e2e|\.claude/skills)/.*\.(ts|tsx|py)$")
TEST = re.compile(r"\.(test|spec)\.tsx?$")


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def lines(path):
    try:
        with open(path, encoding="utf-8") as f:
            return sum(1 for _ in f)
    except (OSError, UnicodeDecodeError):
        return 0


def churn(since):
    """Lines changed and commits per file since a date, from non-merge commits."""
    ch, commits, fixes = collections.Counter(), collections.Counter(), collections.Counter()
    subject = ""
    for line in git("log", f"--since={since}", "--no-merges", "--numstat", "--format=@@%s").splitlines():
        if line.startswith("@@"):
            subject = line[2:]
            continue
        parts = line.split("\t")
        if len(parts) != 3 or parts[0] == "-" or not CODE.match(parts[2]):
            continue
        ch[parts[2]] += int(parts[0]) + int(parts[1])
        commits[parts[2]] += 1
        if re.search(r"\bfix", subject, re.I):
            fixes[parts[2]] += 1
    return ch, commits, fixes


def vitest_durations(out):
    rows = []
    for project, env in (("unit", {}), ("browser", {"VITEST_BROWSERS": "chromium"})):
        path = os.path.join(out, f"vitest-{project}.json")
        subprocess.run(["npx", "vitest", "run", "--project", project, "--reporter=json", f"--outputFile={path}"],
                       env={**os.environ, **env}, capture_output=True, text=True)
        if not os.path.exists(path):
            continue
        data = json.load(open(path))
        for f in data.get("testResults", []):
            rows.append({"project": project, "file": os.path.relpath(f["name"]), "ms": round(f["endTime"] - f["startTime"]),
                         "tests": len(f.get("assertionResults", [])), "failed": sum(a["status"] == "failed" for a in f.get("assertionResults", []))})
    return sorted(rows, key=lambda r: -r["ms"])


def main(argv):
    since = argv[argv.index("--since") + 1]
    out = argv[argv.index("--out") + 1]
    os.makedirs(out, exist_ok=True)
    files = [f for f in git("ls-files").splitlines() if CODE.match(f)]
    size = {f: lines(f) for f in files}
    ch, commits, fixes = churn(since)
    src = [f for f in files if f.startswith("src/") and not TEST.search(f)]
    tested = {re.sub(r"(\.[a-z]+)*\.(test|spec)\.tsx?$", "", f) for f in files if TEST.search(f)}
    untested = sorted((f for f in src if re.sub(r"\.tsx?$", "", f) not in tested and size[f] > 80), key=lambda f: -size[f])
    hot = sorted(ch, key=lambda f: -(ch[f] * max(1, size.get(f, 0)) ** 0.5))
    report = {
        "since": since,
        "hot": [{"file": f, "churn": ch[f], "commits": commits[f], "fix_commits": fixes[f], "lines": size.get(f, 0)} for f in hot[:25]],
        "largest": [{"file": f, "lines": size[f]} for f in sorted(files, key=lambda f: -size[f])[:20]],
        "untested_src_over_80_lines": [{"file": f, "lines": size[f]} for f in untested[:30]],
        "totals": {"files": len(files), "src_files": len(src), "test_files": sum(1 for f in files if TEST.search(f)),
                   "lines": sum(size.values()), "churn": sum(ch.values())},
    }
    if "--tests" in argv:
        report["test_durations"] = vitest_durations(out)
    json.dump(report, open(os.path.join(out, "code-stats.json"), "w"), indent=1)
    t = report["totals"]
    print(f"{t['files']} code files ({t['src_files']} src, {t['test_files']} tests), {t['lines']} lines; churn since {since}: {t['churn']}")
    print("hot spots (churn x sqrt(size)): churn, commits, fix commits, lines, file")
    for r in report["hot"][:10]:
        print(f"  {r['churn']:6d} {r['commits']:3d} {r['fix_commits']:3d} {r['lines']:5d} {r['file']}")
    print("largest:", ", ".join(f"{r['file']} ({r['lines']})" for r in report["largest"][:6]))
    print(f"src files over 80 lines with no test file of the same name: {len(untested)} (e.g. {', '.join(untested[:4])})")
    for r in report.get("test_durations", [])[:15]:
        print(f"  {r['ms']:7d} ms {r['project']:7} {r['tests']:4d} tests {r['file']}")
    print(f"full report: {os.path.join(out, 'code-stats.json')}")


if __name__ == "__main__":
    main(sys.argv[1:])
