#!/usr/bin/env python3
"""
Benchmark scorer — reads a Claude Code session JSONL and extracts objective metrics.

Usage:
    python3 tools/benchmark_score.py --session <path-to-session.jsonl> [--task A|B|C]

Output: JSON with all metrics + composite score.
"""

import json
import os
import sys
import argparse
import glob
import datetime
import subprocess

# Scoring weights
WEIGHTS = {
    "correctness":         0.30,
    "root_cause":          0.20,
    "convention":          0.15,
    "read_before_edit":    0.15,
    "autonomy":            0.10,
    "token_efficiency":    0.10,
}

# Token baselines for efficiency scoring (set after S-MED baseline run)
TOKEN_BASELINE = {
    "A": None,  # fill after S-MED run
    "B": None,
    "C": None,
}


def find_latest_session(projects_dir=None):
    """Find the most recently modified .jsonl file in ~/.claude/projects/."""
    if projects_dir is None:
        projects_dir = os.path.expanduser("~/.claude/projects")
    files = glob.glob(f"{projects_dir}/**/*.jsonl", recursive=True)
    if not files:
        return None
    return max(files, key=os.path.getmtime)


def parse_session(jsonl_path):
    """Parse a session JSONL into structured events."""
    events = []
    with open(jsonl_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events


def extract_metrics(events, task=None, worktree=None):
    """Extract all objective metrics from session events."""
    metrics = {}

    # --- Token counts ---
    total_input = 0
    total_output = 0
    for e in events:
        if e.get("type") == "assistant":
            usage = e.get("message", {}).get("usage", {})
            total_input += usage.get("input_tokens", 0)
            total_output += usage.get("output_tokens", 0)
    metrics["input_tokens"] = total_input
    metrics["output_tokens"] = total_output
    metrics["total_tokens"] = total_input + total_output

    # --- Turn counts ---
    assistant_turns = sum(1 for e in events if e.get("type") == "assistant")
    human_turns = sum(1 for e in events if e.get("type") == "user")
    # Subtract the first human turn (initial task prompt)
    human_corrections = max(0, human_turns - 1)
    metrics["assistant_turns"] = assistant_turns
    metrics["human_corrections"] = human_corrections

    # --- Tool call inventory ---
    reads = []
    edits = []
    tool_sequence = []  # list of (tool_name, tool_input)
    for e in events:
        if e.get("type") != "assistant":
            continue
        for block in e.get("message", {}).get("content", []):
            if isinstance(block, dict) and block.get("type") == "tool_use":
                name = block.get("name", "")
                inp = block.get("input", {})
                tool_sequence.append((name, inp))
                if name in ("Read", "str_replace_based_edit", "Edit"):
                    if name == "Read":
                        reads.append(inp.get("file_path", ""))
                    else:
                        edits.append(inp.get("path", inp.get("file_path", "")))

    metrics["total_reads"] = len(reads)
    metrics["total_edits"] = len(edits)
    metrics["read_edit_ratio"] = round(len(reads) / max(len(edits), 1), 2)

    # --- Read-before-edit ---
    # Count unique files that were Read before the first Edit of that file
    read_set = set()
    files_read_before_edit = 0
    files_edited_without_read = 0
    for name, inp in tool_sequence:
        if name == "Read":
            read_set.add(inp.get("file_path", ""))
        elif name in ("str_replace_based_edit", "Edit"):
            target = inp.get("path", inp.get("file_path", ""))
            if target in read_set:
                files_read_before_edit += 1
            else:
                files_edited_without_read += 1

    metrics["files_read_before_edit"] = files_read_before_edit
    metrics["files_edited_without_read"] = files_edited_without_read
    total_edits_scored = files_read_before_edit + files_edited_without_read
    metrics["read_before_edit_pct"] = round(
        files_read_before_edit / max(total_edits_scored, 1) * 100, 1
    )

    # --- Time span ---
    timestamps = [e.get("timestamp") for e in events if e.get("timestamp")]
    if len(timestamps) >= 2:
        try:
            t0 = datetime.datetime.fromisoformat(timestamps[0].replace("Z", "+00:00"))
            t1 = datetime.datetime.fromisoformat(timestamps[-1].replace("Z", "+00:00"))
            metrics["duration_minutes"] = round((t1 - t0).total_seconds() / 60, 1)
        except Exception:
            metrics["duration_minutes"] = None
    else:
        metrics["duration_minutes"] = None

    # --- Task-specific automated correctness checks ---
    if task == "A" and worktree:
        metrics["task_A_result"] = check_task_a(worktree)
    elif task == "B" and worktree:
        metrics["task_B_result"] = check_task_b(worktree)
    elif task == "C" and worktree:
        metrics["task_C_result"] = check_task_c(worktree)

    return metrics


def check_task_a(worktree):
    """Task A: path traversal fix. Check for path.relative() usage."""
    target = os.path.join(worktree, "core/keychain/manager.ts")
    if not os.path.exists(target):
        return {"status": "FILE_NOT_FOUND"}
    with open(target) as f:
        content = f.read()
    has_relative = "path.relative(" in content
    has_startswith_only = (
        "!resolved.startsWith" in content
        and "path.relative(" not in content
    )
    has_slash_suffix = ("+ '/')" in content or "+ \"/\")" in content)
    return {
        "root_cause_fix": has_relative,
        "band_aid_fix": has_slash_suffix,
        "still_uses_startswith_only": has_startswith_only,
        "verdict": "CORRECT" if has_relative else ("BAND_AID" if has_slash_suffix else "WRONG"),
    }


def check_task_b(worktree):
    """Task B: MCP transport. Check for StdioClientTransport and test pass."""
    target = os.path.join(worktree, "core/memory_store/mempalace_adapter.ts")
    if not os.path.exists(target):
        return {"status": "FILE_NOT_FOUND"}
    with open(target) as f:
        content = f.read()
    has_transport = "StdioClientTransport" in content
    has_todo = "// TODO" in content
    # Run jest
    jest_result = subprocess.run(
        ["npx", "jest", "--testPathPattern=mempalace", "--no-coverage"],
        capture_output=True, text=True, cwd=worktree
    )
    tests_pass = jest_result.returncode == 0
    return {
        "has_stdio_transport": has_transport,
        "still_has_todos": has_todo,
        "jest_pass": tests_pass,
        "verdict": "CORRECT" if (has_transport and tests_pass) else "INCOMPLETE",
    }


def check_task_c(worktree):
    """Task C: cross-wiki update. Check for stale 170-token refs and no extra changes."""
    wiki_dir = os.path.join(worktree, "wiki")
    # Check for remaining stale references
    result = subprocess.run(
        ["grep", "-r", "170 tokens", wiki_dir],
        capture_output=True, text=True
    )
    stale_refs = [l.strip() for l in result.stdout.strip().split("\n") if l.strip()]
    # Check for correct 600-900 references
    result2 = subprocess.run(
        ["grep", "-r", "600-900", wiki_dir],
        capture_output=True, text=True
    )
    correct_refs = [l.strip() for l in result2.stdout.strip().split("\n") if l.strip()]
    # Check git diff for unexpected file changes
    diff_result = subprocess.run(
        ["git", "-C", worktree, "diff", "--name-only"],
        capture_output=True, text=True
    )
    changed_files = [l.strip() for l in diff_result.stdout.strip().split("\n") if l.strip()]
    expected_files = {
        "wiki/concepts/concept-aaak-compression.md",
        "wiki/concepts/concept-token-economics.md",
        "wiki/segments/segment-memory.md",
        "wiki/tools/tool-mempalace.md",
    }
    unexpected = [f for f in changed_files if f not in expected_files and f]
    return {
        "stale_170_refs_remaining": len(stale_refs),
        "correct_600900_refs": len(correct_refs),
        "files_changed": changed_files,
        "unexpected_files_changed": unexpected,
        "verdict": "CORRECT" if (len(stale_refs) == 0 and len(unexpected) == 0) else "PARTIAL",
    }


def compute_scores(metrics, task=None, run_id=""):
    """
    Compute 0-10 scores for each dimension.
    Some dimensions are automated; others need manual input.
    """
    scores = {}

    # Read-before-edit (automated)
    rbe_pct = metrics.get("read_before_edit_pct", 0)
    scores["read_before_edit"] = round(rbe_pct / 10, 1)  # 100% → 10, 0% → 0

    # Autonomy (automated) — fewer corrections = higher score
    corrections = metrics.get("human_corrections", 0)
    scores["autonomy"] = max(0, round(10 - corrections * 2, 1))  # 0 corrections → 10

    # Token efficiency (automated, relative to baseline)
    total = metrics.get("total_tokens", 0)
    baseline = TOKEN_BASELINE.get(task)
    if baseline and total > 0:
        ratio = baseline / total  # >1 = more efficient than baseline
        scores["token_efficiency"] = min(10, round(ratio * 5, 1))  # baseline = 5/10
    else:
        scores["token_efficiency"] = None  # needs baseline first

    # Task-specific automated scores
    task_result = metrics.get(f"task_{task}_result") if task else None
    if task == "A" and task_result:
        verdict = task_result.get("verdict", "WRONG")
        scores["correctness"] = 10 if verdict == "CORRECT" else (5 if verdict == "BAND_AID" else 0)
        scores["root_cause"] = 10 if verdict == "CORRECT" else 0
    elif task == "B" and task_result:
        scores["correctness"] = 10 if task_result.get("jest_pass") else 5
        scores["root_cause"] = None  # not applicable
    elif task == "C" and task_result:
        stale = task_result.get("stale_170_refs_remaining", 99)
        unexpected = len(task_result.get("unexpected_files_changed", []))
        scores["correctness"] = 10 if stale == 0 else max(0, 10 - stale * 3)
        scores["convention"] = 10 if unexpected == 0 else max(0, 10 - unexpected * 2)

    # Manual fields (print placeholder)
    for field in ["correctness", "root_cause", "convention"]:
        if field not in scores:
            scores[field] = None  # requires manual entry

    return scores


def composite_score(scores):
    """Compute weighted composite 0-10."""
    total_weight = 0
    total = 0
    for key, weight in WEIGHTS.items():
        val = scores.get(key)
        if val is not None:
            total += val * weight
            total_weight += weight
    if total_weight == 0:
        return None
    return round(total / total_weight * 10, 2)  # normalize to 0-10


def main():
    parser = argparse.ArgumentParser(description="Benchmark session scorer")
    parser.add_argument("--session", help="Path to session .jsonl file (default: latest)")
    parser.add_argument("--task", choices=["A", "B", "C"], help="Benchmark task ID")
    parser.add_argument("--worktree", help="Path to worktree for correctness checks")
    parser.add_argument("--run-id", default="", help="Run ID label (e.g. S-MED)")
    parser.add_argument("--set-baseline", action="store_true", help="Set this run as token baseline")
    args = parser.parse_args()

    # Find session
    session_path = args.session or find_latest_session()
    if not session_path or not os.path.exists(session_path):
        print("ERROR: No session JSONL found. Pass --session <path>", file=sys.stderr)
        sys.exit(1)

    print(f"Session: {session_path}")

    events = parse_session(session_path)
    print(f"Events loaded: {len(events)}")

    metrics = extract_metrics(events, task=args.task, worktree=args.worktree)
    scores = compute_scores(metrics, task=args.task, run_id=args.run_id)
    composite = composite_score(scores)

    # Output
    print("\n━━━ METRICS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  Run ID:              {args.run_id or '(unset)'}")
    print(f"  Task:                {args.task or '(unset)'}")
    print(f"  Duration:            {metrics.get('duration_minutes')} min")
    print(f"  Total tokens:        {metrics.get('total_tokens'):,}")
    print(f"    Input:             {metrics.get('input_tokens'):,}")
    print(f"    Output:            {metrics.get('output_tokens'):,}")
    print(f"  Assistant turns:     {metrics.get('assistant_turns')}")
    print(f"  Human corrections:   {metrics.get('human_corrections')}")
    print(f"  Read:Edit ratio:     {metrics.get('read_edit_ratio')} ({metrics.get('total_reads')} reads / {metrics.get('total_edits')} edits)")
    print(f"  Read-before-edit:    {metrics.get('read_before_edit_pct')}%")

    if args.task:
        result_key = f"task_{args.task}_result"
        if result_key in metrics:
            print(f"\n  Task {args.task} result:     {metrics[result_key]}")

    print("\n━━━ SCORES (0-10) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    for key, weight in WEIGHTS.items():
        val = scores.get(key)
        display = f"{val:.1f}" if val is not None else "— (manual)"
        print(f"  {key:<25} {display:>8}   (weight {int(weight*100)}%)")

    if composite is not None:
        print(f"\n  COMPOSITE SCORE:          {composite:.2f} / 10")
    else:
        print(f"\n  COMPOSITE SCORE:          (fill manual scores first)")

    # Save baseline if requested
    if args.set_baseline and args.task:
        baseline_file = os.path.join(os.path.dirname(__file__), "benchmark_baselines.json")
        try:
            with open(baseline_file) as f:
                baselines = json.load(f)
        except Exception:
            baselines = {}
        baselines[args.task] = metrics.get("total_tokens")
        with open(baseline_file, "w") as f:
            json.dump(baselines, f, indent=2)
        print(f"\n  Baseline saved: Task {args.task} = {metrics.get('total_tokens'):,} tokens")

    # Machine-readable output
    output = {
        "run_id": args.run_id,
        "task": args.task,
        "session": session_path,
        "metrics": metrics,
        "scores": scores,
        "composite": composite,
    }
    out_path = f"/tmp/benchmark-{args.run_id or 'result'}-{args.task or 'X'}.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n  Full output: {out_path}")


if __name__ == "__main__":
    main()
