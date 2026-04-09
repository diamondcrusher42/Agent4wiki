"""Tests for tools/benchmark_score.py — Forge benchmark scorer."""

import sys
import json
import os
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))
from benchmark_score import (
    parse_session,
    extract_metrics,
    compute_scores,
    composite_score,
    find_latest_session,
    check_task_a,
    WEIGHTS,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_event(type_="assistant", tokens_in=100, tokens_out=50, tools=None, ts=None):
    event = {"type": type_}
    if type_ == "assistant":
        content = []
        if tools:
            for name, inp in tools:
                content.append({"type": "tool_use", "name": name, "input": inp})
        event["message"] = {
            "content": content,
            "usage": {"input_tokens": tokens_in, "output_tokens": tokens_out},
        }
    if ts:
        event["timestamp"] = ts
    return event


def write_jsonl(path, events):
    with open(path, "w") as f:
        for e in events:
            f.write(json.dumps(e) + "\n")


# ---------------------------------------------------------------------------
# parse_session()
# ---------------------------------------------------------------------------

def test_parse_session_valid_jsonl(tmp_path):
    events = [make_event("assistant"), make_event("user")]
    p = tmp_path / "session.jsonl"
    write_jsonl(p, events)
    result = parse_session(str(p))
    assert len(result) == 2
    assert result[0]["type"] == "assistant"


def test_parse_session_skips_invalid_lines(tmp_path):
    p = tmp_path / "session.jsonl"
    with open(p, "w") as f:
        f.write(json.dumps({"type": "assistant"}) + "\n")
        f.write("this is not json\n")
        f.write(json.dumps({"type": "user"}) + "\n")
    result = parse_session(str(p))
    assert len(result) == 2


def test_parse_session_empty_file(tmp_path):
    p = tmp_path / "empty.jsonl"
    p.write_text("")
    result = parse_session(str(p))
    assert result == []


# ---------------------------------------------------------------------------
# extract_metrics() — token counts
# ---------------------------------------------------------------------------

def test_extract_metrics_sums_tokens():
    events = [
        make_event("assistant", tokens_in=200, tokens_out=80),
        make_event("assistant", tokens_in=150, tokens_out=60),
    ]
    m = extract_metrics(events)
    assert m["input_tokens"] == 350
    assert m["output_tokens"] == 140
    assert m["total_tokens"] == 490


def test_extract_metrics_zero_tokens_on_empty():
    m = extract_metrics([])
    assert m["total_tokens"] == 0
    assert m["assistant_turns"] == 0
    assert m["human_corrections"] == 0


# ---------------------------------------------------------------------------
# extract_metrics() — read/edit tracking
# ---------------------------------------------------------------------------

def test_extract_metrics_read_before_edit_100_pct():
    events = [
        make_event("assistant", tools=[
            ("Read", {"file_path": "src/auth.py"}),
            ("Edit", {"file_path": "src/auth.py"}),
        ]),
    ]
    m = extract_metrics(events)
    assert m["files_read_before_edit"] == 1
    assert m["files_edited_without_read"] == 0
    assert m["read_before_edit_pct"] == 100.0


def test_extract_metrics_edit_without_read():
    events = [
        make_event("assistant", tools=[
            ("Edit", {"file_path": "src/auth.py"}),  # no prior Read
        ]),
    ]
    m = extract_metrics(events)
    assert m["files_edited_without_read"] == 1
    assert m["files_read_before_edit"] == 0
    assert m["read_before_edit_pct"] == 0.0


def test_extract_metrics_mixed_read_edit():
    events = [
        make_event("assistant", tools=[
            ("Read", {"file_path": "src/a.py"}),
            ("Edit", {"file_path": "src/a.py"}),   # read first — good
            ("Edit", {"file_path": "src/b.py"}),   # no read — bad
        ]),
    ]
    m = extract_metrics(events)
    assert m["files_read_before_edit"] == 1
    assert m["files_edited_without_read"] == 1
    assert m["read_before_edit_pct"] == 50.0


# ---------------------------------------------------------------------------
# extract_metrics() — human corrections
# ---------------------------------------------------------------------------

def test_extract_metrics_counts_human_corrections():
    events = [
        make_event("user"),    # initial prompt (not a correction)
        make_event("assistant"),
        make_event("user"),    # correction 1
        make_event("assistant"),
        make_event("user"),    # correction 2
    ]
    m = extract_metrics(events)
    assert m["human_corrections"] == 2


# ---------------------------------------------------------------------------
# extract_metrics() — duration
# ---------------------------------------------------------------------------

def test_extract_metrics_duration():
    events = [
        make_event("assistant", ts="2026-04-09T10:00:00Z"),
        make_event("user", ts="2026-04-09T10:03:30Z"),
    ]
    m = extract_metrics(events)
    assert m["duration_minutes"] == 3.5


# ---------------------------------------------------------------------------
# compute_scores()
# ---------------------------------------------------------------------------

def test_compute_scores_read_before_edit():
    m = {"read_before_edit_pct": 100.0, "human_corrections": 0, "total_tokens": 0}
    scores = compute_scores(m)
    assert scores["read_before_edit"] == 10.0


def test_compute_scores_autonomy_no_corrections():
    m = {"read_before_edit_pct": 0, "human_corrections": 0, "total_tokens": 0}
    scores = compute_scores(m)
    assert scores["autonomy"] == 10.0


def test_compute_scores_autonomy_with_corrections():
    m = {"read_before_edit_pct": 0, "human_corrections": 3, "total_tokens": 0}
    scores = compute_scores(m)
    assert scores["autonomy"] == max(0, 10 - 3 * 2)


def test_compute_scores_token_efficiency_no_baseline():
    m = {"read_before_edit_pct": 0, "human_corrections": 0, "total_tokens": 5000}
    scores = compute_scores(m, task="A")
    assert scores["token_efficiency"] is None  # no baseline set


# ---------------------------------------------------------------------------
# composite_score()
# ---------------------------------------------------------------------------

def test_composite_score_all_tens():
    """All dimensions at max (10) → composite at max (100)."""
    scores = {k: 10.0 for k in WEIGHTS}
    assert composite_score(scores) == 100.0


def test_composite_score_all_zeros():
    scores = {k: 0.0 for k in WEIGHTS}
    assert composite_score(scores) == 0.0


def test_composite_score_partial_none():
    """None scores are excluded from weighted average — remaining all-10 still gives 100."""
    scores = {k: None for k in WEIGHTS}
    scores["read_before_edit"] = 10.0
    scores["autonomy"] = 10.0
    result = composite_score(scores)
    assert result == 100.0


def test_composite_score_all_none_returns_none():
    scores = {k: None for k in WEIGHTS}
    assert composite_score(scores) is None


# ---------------------------------------------------------------------------
# check_task_a()
# ---------------------------------------------------------------------------

def test_check_task_a_correct_fix(tmp_path):
    manager = tmp_path / "core" / "keychain"
    manager.mkdir(parents=True)
    (manager / "manager.ts").write_text("const ok = path.relative(base, resolved);\n")
    result = check_task_a(str(tmp_path))
    assert result["verdict"] == "CORRECT"
    assert result["root_cause_fix"] is True


def test_check_task_a_band_aid_fix(tmp_path):
    manager = tmp_path / "core" / "keychain"
    manager.mkdir(parents=True)
    (manager / "manager.ts").write_text("if (!resolved.startsWith(base + '/'))\n")
    result = check_task_a(str(tmp_path))
    assert result["verdict"] == "BAND_AID"


def test_check_task_a_wrong_fix(tmp_path):
    manager = tmp_path / "core" / "keychain"
    manager.mkdir(parents=True)
    (manager / "manager.ts").write_text("// nothing useful here\n")
    result = check_task_a(str(tmp_path))
    assert result["verdict"] == "WRONG"


def test_check_task_a_file_not_found(tmp_path):
    result = check_task_a(str(tmp_path))
    assert result["status"] == "FILE_NOT_FOUND"


# ---------------------------------------------------------------------------
# find_latest_session()
# ---------------------------------------------------------------------------

def test_find_latest_session_returns_most_recent(tmp_path):
    older = tmp_path / "session-old.jsonl"
    newer = tmp_path / "session-new.jsonl"
    older.write_text("{}")
    import time; time.sleep(0.01)
    newer.write_text("{}")
    result = find_latest_session(str(tmp_path))
    assert result == str(newer)


def test_find_latest_session_returns_none_when_empty(tmp_path):
    result = find_latest_session(str(tmp_path))
    assert result is None
