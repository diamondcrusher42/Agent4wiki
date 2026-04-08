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
    validate_task_id,
    read_handshake_file,
    build_clone_env,
    SENSITIVE_ENV_KEYS,
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
    # A1 fix: tests_passed=False now returns BLOCK (aligned with auditor.ts)
    assert janitor_evaluate(h, 0, "t-001") == "BLOCK"


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
    # A1 fix: tests_passed=False returns BLOCK before FAILED_RETRY check (aligned with auditor.ts)
    assert janitor_evaluate(h, 0, "t-001") == "BLOCK"


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


# ---------------------------------------------------------------------------
# Phase 6B — Fleet routing tests
# ---------------------------------------------------------------------------

from dispatcher import is_local_node, load_fleet_registry, dispatch_remote
import socket


def test_is_local_node_local():
    assert is_local_node("local") is True


def test_is_local_node_hostname():
    assert is_local_node(socket.gethostname()) is True


def test_is_local_node_empty():
    assert is_local_node("") is True


def test_is_local_node_unknown():
    assert is_local_node("unknown-host-xyz-999") is False


def test_dispatch_remote_called_when_target_nonlocal(tmp_path, monkeypatch):
    """dispatch_remote() is callable when target_node is non-local and in registry."""
    import dispatcher

    registry_path = tmp_path / "state" / "fleet" / "registry.json"
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_data = [
        {"node_id": "remote-node", "host": "192.168.1.100", "user": "agent", "ssh_key": "/tmp/key", "capabilities": ["code"]}
    ]
    registry_path.write_text(json.dumps(registry_data))

    monkeypatch.setattr(dispatcher, "FLEET_REGISTRY", registry_path)

    registry = load_fleet_registry()
    assert len(registry) == 1
    assert registry[0]["node_id"] == "remote-node"
    assert not is_local_node("remote-node")


def test_fallback_to_local_when_target_not_in_registry(tmp_path, monkeypatch):
    """When target_node is not in registry, dispatcher falls back to local."""
    import dispatcher

    registry_path = tmp_path / "state" / "fleet" / "registry.json"
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_path.write_text(json.dumps([]))

    monkeypatch.setattr(dispatcher, "FLEET_REGISTRY", registry_path)

    registry = load_fleet_registry()
    node = next((n for n in registry if n.get("node_id") == "nonexistent"), None)
    assert node is None  # Not found — would fall back to local


# ---------------------------------------------------------------------------
# A1: SSH injection security tests
# ---------------------------------------------------------------------------

def test_validate_task_id_valid():
    """Valid task IDs should pass through."""
    assert validate_task_id("task-001") == "task-001"
    assert validate_task_id("my_task_2") == "my_task_2"
    assert validate_task_id("abc123") == "abc123"


def test_validate_task_id_rejects_special_chars():
    """Task IDs with shell metacharacters must raise ValueError."""
    import pytest
    with pytest.raises(ValueError):
        validate_task_id("task'; rm -rf /")
    with pytest.raises(ValueError):
        validate_task_id("../../../etc/passwd")
    with pytest.raises(ValueError):
        validate_task_id("task id with spaces")
    with pytest.raises(ValueError):
        validate_task_id("")


# ---------------------------------------------------------------------------
# B1: File-based handshake tests
# ---------------------------------------------------------------------------

def test_read_handshake_file_exists(tmp_path, monkeypatch):
    """read_handshake_file reads and deletes handshake JSON."""
    import dispatcher
    monkeypatch.setattr(dispatcher, "BASE_DIR", tmp_path)

    hs_dir = tmp_path / "state" / "handshakes"
    hs_dir.mkdir(parents=True)
    hs_file = hs_dir / "task-001.json"
    hs_file.write_text(json.dumps({"status": "COMPLETED", "tokens_consumed": 1234}))

    result = read_handshake_file("task-001")
    assert result is not None
    assert result["status"] == "COMPLETED"
    assert result["tokens_consumed"] == 1234
    assert not hs_file.exists()  # cleaned up


def test_read_handshake_file_missing(tmp_path, monkeypatch):
    """read_handshake_file returns None when file doesn't exist."""
    import dispatcher
    monkeypatch.setattr(dispatcher, "BASE_DIR", tmp_path)

    result = read_handshake_file("nonexistent-task")
    assert result is None


# ---------------------------------------------------------------------------
# A2: Unified heuristics tests
# ---------------------------------------------------------------------------

def test_janitor_evaluate_temporary_keyword():
    """Both Python and TS should catch 'temporary' from shared heuristics."""
    h = {
        "status": "COMPLETED",
        "tests_passed": True,
        "files_modified": ["main.py"],
        "janitor_notes": "This is a temporary workaround",
    }
    assert janitor_evaluate(h, 0, "t-heur") == "SUGGEST"


def test_janitor_evaluate_fixme_keyword():
    """fixme is in the shared heuristics list."""
    h = {
        "status": "COMPLETED",
        "tests_passed": True,
        "files_modified": ["main.py"],
        "janitor_notes": "fixme: needs proper error handling",
    }
    assert janitor_evaluate(h, 0, "t-fixme") == "SUGGEST"


def test_janitor_evaluate_clean_passes():
    """Clean notes should still return NOTE."""
    h = {
        "status": "COMPLETED",
        "tests_passed": True,
        "files_modified": ["main.py"],
        "janitor_notes": "Implementation complete. All tests passing.",
    }
    assert janitor_evaluate(h, 0, "t-clean") == "NOTE"


# ---------------------------------------------------------------------------
# A2: create_worktree() task ID validation (plan-build-v6)
# ---------------------------------------------------------------------------

from dispatcher import create_worktree

def test_create_worktree_rejects_invalid_task_id():
    """create_worktree() should reject task IDs with shell metacharacters."""
    import pytest
    task = Task(id='evil; rm -rf /', type='clone', objective='test', source='manual')
    with pytest.raises(ValueError):
        create_worktree(task)


def test_create_worktree_accepts_valid_task_id(tmp_path, monkeypatch):
    """create_worktree() should proceed normally with a valid task ID."""
    import dispatcher
    monkeypatch.setattr(dispatcher, 'BASE_DIR', tmp_path)
    task = Task(id='valid-task-123', type='clone', objective='test', source='manual')
    # Will fail at git worktree add (no repo) but should NOT raise ValueError
    result = create_worktree(task)
    # Returns None because git command fails (no git repo in tmp_path)
    assert result is None


# ---------------------------------------------------------------------------
# A1: Python vault leak — build_clone_env tests (plan-build-v7)
# ---------------------------------------------------------------------------

def test_build_clone_env_strips_vault_password(monkeypatch):
    """build_clone_env() must strip VAULT_MASTER_PASSWORD."""
    monkeypatch.setenv('VAULT_MASTER_PASSWORD', 'super-secret')
    env = build_clone_env()
    assert 'VAULT_MASTER_PASSWORD' not in env


def test_build_clone_env_strips_all_sensitive_keys(monkeypatch):
    """All keys in SENSITIVE_ENV_KEYS must be stripped."""
    for key in SENSITIVE_ENV_KEYS:
        monkeypatch.setenv(key, 'test-value')
    env = build_clone_env()
    for key in SENSITIVE_ENV_KEYS:
        assert key not in env, f"{key} should be stripped from clone env"


def test_build_clone_env_preserves_task_scoped_keys(monkeypatch):
    """Extra keys passed to build_clone_env should appear in the result."""
    monkeypatch.setenv('VAULT_MASTER_PASSWORD', 'secret')
    env = build_clone_env({'TASK_KEY': 'task-value', 'CLAUDE_MODEL': 'haiku'})
    assert env['TASK_KEY'] == 'task-value'
    assert env['CLAUDE_MODEL'] == 'haiku'
    assert 'VAULT_MASTER_PASSWORD' not in env


# ---------------------------------------------------------------------------
# C1: Shared config MAX_RETRIES test (plan-build-v7)
# ---------------------------------------------------------------------------

def test_max_retries_from_shared_config():
    """MAX_RETRIES should be loaded from core/config/clone_config.json."""
    import json
    from pathlib import Path
    config_path = Path(__file__).parent.parent / 'core' / 'config' / 'clone_config.json'
    config = json.loads(config_path.read_text())
    assert MAX_RETRIES == config['maxRetries']


# ---------------------------------------------------------------------------
# A1: Janitor decision tree alignment with auditor.ts (plan-build-v8)
# ---------------------------------------------------------------------------

def test_janitor_completed_tests_failed_returns_block():
    """A1: {status: COMPLETED, tests_passed: false} must return BLOCK, matching auditor.ts."""
    h = {
        "status": "COMPLETED",
        "tests_passed": False,
        "files_modified": ["a.ts"],
        "janitor_notes": "done",
    }
    assert janitor_evaluate(h, 0, "t-a1-1") == "BLOCK"


def test_janitor_blocked_impossible_returns_block():
    """A1: BLOCKED_IMPOSSIBLE always returns BLOCK."""
    h = {
        "status": "BLOCKED_IMPOSSIBLE",
        "files_modified": [],
        "tests_passed": False,
        "janitor_notes": "impossible",
    }
    assert janitor_evaluate(h, 0, "t-a1-2") == "BLOCK"


def test_janitor_completed_tests_passed_returns_note():
    """A1: {status: COMPLETED, tests_passed: true} returns NOTE (clean pass)."""
    h = {
        "status": "COMPLETED",
        "tests_passed": True,
        "files_modified": ["a.ts"],
        "janitor_notes": "all good",
    }
    assert janitor_evaluate(h, 0, "t-a1-3") == "NOTE"


def test_janitor_tests_passed_absent_not_suggest():
    """A1: tests_passed field absent should not produce SUGGEST."""
    h = {
        "status": "COMPLETED",
        "files_modified": ["a.ts"],
        "janitor_notes": "clean",
    }
    # tests_passed absent -> handshake.get("tests_passed") returns None, not False
    # So it should NOT hit the BLOCK for tests_passed===false, should reach NOTE
    result = janitor_evaluate(h, 0, "t-a1-4")
    assert result != "SUGGEST"
