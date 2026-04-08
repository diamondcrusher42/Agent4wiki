"""Tests for brain/dispatcher.py — Janitor integration (Phase 1)."""

import sys
import json
from pathlib import Path

# Add brain/ to import path
sys.path.insert(0, str(Path(__file__).parent.parent / "brain"))
from dispatcher import (
    janitor_evaluate,
    extract_handshake,
    write_forge_record,
    load_task,
    Task,
    MAX_RETRIES,
)


# ---------------------------------------------------------------------------
# extract_handshake tests
# ---------------------------------------------------------------------------

def test_extract_handshake_valid():
    output = (
        'Some debug output\n'
        '{"status": "COMPLETED", "tests_passed": true, "files_modified": ["main.py"], '
        '"janitor_notes": "clean", "tokens_consumed": 1000, "duration_seconds": 30}\n'
    )
    h = extract_handshake(output)
    assert h is not None
    assert h["status"] == "COMPLETED"
    assert h["tests_passed"] is True
    assert h["files_modified"] == ["main.py"]


def test_extract_handshake_last_line():
    """Should pick the LAST JSON block, not the first."""
    output = (
        '{"status": "debug_not_real"}\n'
        'some logs\n'
        '{"status": "COMPLETED", "tests_passed": true, "files_modified": [], '
        '"janitor_notes": "final", "tokens_consumed": 500, "duration_seconds": 10}\n'
    )
    h = extract_handshake(output)
    assert h is not None
    assert h["status"] == "COMPLETED"
    assert h["janitor_notes"] == "final"


def test_extract_handshake_missing():
    assert extract_handshake("no json here at all") is None


def test_extract_handshake_empty():
    assert extract_handshake("") is None


def test_extract_handshake_malformed_json():
    output = '{"status": "COMPLETED", bad json here}\n'
    # Falls back to regex, which may also fail on malformed JSON
    h = extract_handshake(output)
    # Either None or a valid parse — should not crash
    assert h is None or isinstance(h, dict)


# ---------------------------------------------------------------------------
# janitor_evaluate tests
# ---------------------------------------------------------------------------

def test_janitor_evaluate_completed_clean():
    h = {
        "status": "COMPLETED",
        "tests_passed": True,
        "files_modified": ["main.py"],
        "janitor_notes": "all good",
    }
    assert janitor_evaluate(h, 0, "t-001") == "NOTE"


def test_janitor_evaluate_scope_creep():
    h = {
        "status": "COMPLETED",
        "tests_passed": True,
        "files_modified": ["a.py", "b.py", "c.py", "d.py", "e.py", "f.py"],
        "janitor_notes": "also fixed some unrelated formatting while I was at it",
    }
    assert janitor_evaluate(h, 0, "t-001") == "SUGGEST"


def test_janitor_evaluate_no_tests():
    h = {
        "status": "COMPLETED",
        "tests_passed": False,
        "files_modified": ["main.py"],
        "janitor_notes": "done",
    }
    assert janitor_evaluate(h, 0, "t-001") == "SUGGEST"


def test_janitor_evaluate_blocked_impossible():
    h = {
        "status": "BLOCKED_IMPOSSIBLE",
        "files_modified": [],
        "tests_passed": False,
        "janitor_notes": "can't do this",
    }
    assert janitor_evaluate(h, 0, "t-001") == "BLOCK"


def test_janitor_evaluate_failed_require_human():
    h = {
        "status": "FAILED_REQUIRE_HUMAN",
        "files_modified": [],
        "tests_passed": False,
        "janitor_notes": "needs human",
    }
    assert janitor_evaluate(h, 0, "t-001") == "BLOCK"


def test_janitor_evaluate_failed_retry_first_attempt():
    h = {
        "status": "FAILED_RETRY",
        "files_modified": [],
        "tests_passed": False,
        "janitor_notes": "retry me",
    }
    assert janitor_evaluate(h, 0, "t-001") == "SUGGEST"


def test_janitor_evaluate_failed_retry_last_attempt():
    h = {
        "status": "FAILED_RETRY",
        "files_modified": [],
        "tests_passed": False,
        "janitor_notes": "still failing",
    }
    # At retry_count == MAX_RETRIES - 1, FAILED_RETRY should BLOCK
    assert janitor_evaluate(h, MAX_RETRIES - 1, "t-001") == "BLOCK"


def test_janitor_evaluate_circuit_breaker():
    h = {
        "status": "COMPLETED",
        "tests_passed": True,
        "files_modified": [],
        "janitor_notes": "fine",
    }
    # Even if handshake looks clean, circuit breaker fires at MAX_RETRIES
    assert janitor_evaluate(h, MAX_RETRIES, "t-001") == "BLOCK"


def test_janitor_evaluate_architectural_smell():
    h = {
        "status": "COMPLETED",
        "tests_passed": True,
        "files_modified": ["main.py"],
        "janitor_notes": "This is a hacky workaround",
    }
    assert janitor_evaluate(h, 0, "t-001") == "SUGGEST"


# ---------------------------------------------------------------------------
# write_forge_record tests
# ---------------------------------------------------------------------------

def test_write_forge_record(tmp_path, monkeypatch):
    """Forge record is written as valid JSON-lines."""
    import dispatcher
    monkeypatch.setattr(dispatcher, "BASE_DIR", tmp_path)

    task = Task(id="t-fr-001", type="clone", objective="test", source="manual")
    handshake = {
        "status": "COMPLETED",
        "tokens_consumed": 500,
        "duration_seconds": 12,
        "files_modified": ["a.py"],
        "janitor_notes": "clean",
    }
    write_forge_record(task, "NOTE", handshake)

    forge_log = tmp_path / "forge" / "events.jsonl"
    assert forge_log.exists()
    record = json.loads(forge_log.read_text().strip())
    assert record["task_id"] == "t-fr-001"
    assert record["directive"] == "NOTE"
    assert record["tokens_consumed"] == 500


# ---------------------------------------------------------------------------
# Task model tests
# ---------------------------------------------------------------------------

def test_task_model_default():
    t = Task(id="t-1", type="clone", objective="test", source="manual")
    assert t.model == "claude-sonnet-4-6"
    assert t.retry_count == 0


def test_load_task_with_model(tmp_path):
    task_data = {
        "id": "t-model",
        "type": "clone",
        "objective": "test model field",
        "source": "manual",
        "model": "claude-haiku-4-5-20251001",
    }
    task_file = tmp_path / "task.json"
    task_file.write_text(json.dumps(task_data))
    task = load_task(task_file)
    assert task.model == "claude-haiku-4-5-20251001"
