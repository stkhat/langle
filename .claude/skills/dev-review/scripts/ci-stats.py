"""GitHub Actions use for the dev review (.claude/skills/dev-review/SKILL.md).

  python3 -I .claude/skills/dev-review/scripts/ci-stats.py --since YYYY-MM-DD --out DIR

Needs `gh` signed in; run it with the sandbox off (gh's TLS check fails inside it).
Writes DIR/ci-stats.json and prints per-workflow runs, failures, durations, billable
minutes (macOS x10, Windows x2 already applied by GitHub), the steps that failed, and PR
open -> merge times. Read-only.
"""

import collections
import json
import os
import statistics
import subprocess
import sys
from datetime import datetime


def gh(*args):
    return json.loads(subprocess.run(["gh", *args], capture_output=True, text=True, check=True).stdout or "null")


def t(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def main(argv):
    since = argv[argv.index("--since") + 1]
    out = argv[argv.index("--out") + 1]
    os.makedirs(out, exist_ok=True)
    repo = gh("repo", "view", "--json", "nameWithOwner")["nameWithOwner"]
    runs = gh("run", "list", "--limit", "300", "--created", f">={since}",
              "--json", "databaseId,workflowName,conclusion,status,createdAt,updatedAt,event,headBranch,attempt")
    per = collections.defaultdict(lambda: {"runs": 0, "skipped": 0, "failed": 0, "cancelled": 0, "reruns": 0, "minutes": [], "billable_min": 0.0})
    failed_steps = collections.Counter()
    for r in runs:
        w = per[r["workflowName"]]
        if r["conclusion"] == "skipped":  # draft pull requests: the job's `if` skips it, nothing runs
            w["skipped"] += 1
            continue
        w["runs"] += 1
        w["failed"] += r["conclusion"] == "failure"
        w["cancelled"] += r["conclusion"] == "cancelled"
        w["reruns"] += (r.get("attempt") or 1) > 1
        if r["status"] == "completed":
            w["minutes"].append((t(r["updatedAt"]) - t(r["createdAt"])).total_seconds() / 60)
            timing = gh("api", f"repos/{repo}/actions/runs/{r['databaseId']}/timing")
            w["billable_min"] += sum(v.get("total_ms", 0) for v in (timing.get("billable") or {}).values()) / 60000
        if r["conclusion"] == "failure":
            for job in gh("run", "view", str(r["databaseId"]), "--json", "jobs")["jobs"]:
                for s in job.get("steps", []):
                    if s.get("conclusion") == "failure":
                        failed_steps[f"{r['workflowName']}: {s['name']}"] += 1
    prs = gh("pr", "list", "--state", "merged", "--limit", "200", "--search", f"merged:>={since}", "--json", "number,createdAt,mergedAt,isDraft")
    hours = [(t(p["mergedAt"]) - t(p["createdAt"])).total_seconds() / 3600 for p in prs]
    report = {
        "since": since, "repo": repo,
        "workflows": {k: {**v, "median_min": round(statistics.median(v["minutes"]), 1) if v["minutes"] else None,
                          "total_min": round(sum(v["minutes"]), 1), "billable_min": round(v["billable_min"], 1), "minutes": None}
                      for k, v in per.items()},
        "failed_steps": failed_steps.most_common(),
        "merged_prs": len(prs), "pr_open_to_merge_hours_median": round(statistics.median(hours), 1) if hours else None,
    }
    json.dump(report, open(os.path.join(out, "ci-stats.json"), "w"), indent=1)
    print(f"{len(runs)} runs since {since}; {len(prs)} merged PRs, median open -> merge {report['pr_open_to_merge_hours_median']} h")
    print("workflow: runs (skipped drafts not counted), skipped, failed, cancelled, reruns, median min, total min, billable min")
    for k, v in sorted(report["workflows"].items(), key=lambda kv: -kv[1]["total_min"]):
        print(f"  {k:12} {v['runs']:4d} {v['skipped']:4d} {v['failed']:3d} {v['cancelled']:3d} {v['reruns']:3d} {v['median_min'] or 0:6.1f} {v['total_min']:7.1f} {v['billable_min']:7.1f}")
    ci = report["workflows"].get("CI")
    if ci and prs:
        print(f"CI runs per merged PR: {ci['runs'] / len(prs):.2f}")
    for s, n in failed_steps.most_common(8):
        print(f"  failed {n:3d}x {s}")
    print(f"full report: {os.path.join(out, 'ci-stats.json')}")


if __name__ == "__main__":
    main(sys.argv[1:])
