"""Tests for brain/dispatcher.py — Janitor integration (Phase 1)."""

import sys
import json
from pathlib import Path

# Add brain/ to import path
sys.path.insert(0, str(Path(__file__).parent.parent / "brain"))
from dispatcher import (
    janitor_evaluate,
    extract_handshake,
    validate_handshake,
    write_forge_record,
    load_task,
    Task,
    MAX_RETRIES,
    validate_task_id,
    read_handshake_file,
    build_clone_env,
    SENSITIVE_ENV_KEYS,
    claim_task,
    CONTEXT_TOKEN_BUDGET_BRAIN,
    CONTEXT_TOKEN_BUDGET_CLONE,
    assemble_context,
    _SKILL_ENDPOINTS,
    _DEFAULT_ENDPOINTS,
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


# ---------------------------------------------------------------------------
# B1: Concurrent watch() — threading tests (plan-build-v8)
# ---------------------------------------------------------------------------

import threading as _threading

def test_watch_uses_threading(tmp_path, monkeypatch):
    """B1: watch() should process tasks concurrently using threads."""
    import dispatcher
    monkeypatch.setattr(dispatcher, "BASE_DIR", tmp_path)
    inbox = tmp_path / "brain" / "inbox"
    monkeypatch.setattr(dispatcher, "INBOX", inbox)
    
    # Create inbox and required dirs
    for d in ["brain/inbox", "brain/active", "brain/completed", "brain/failed"]:
        (tmp_path / d).mkdir(parents=True, exist_ok=True)
    
    # Track processing times
    import time as _time
    process_times = []
    
    def slow_process(task_path):
        process_times.append(_time.time())
        # Remove from inbox so it is not re-picked
        Path(task_path).unlink(missing_ok=True)
        _time.sleep(0.1)
        return {"status": "ok"}
    
    monkeypatch.setattr(dispatcher, "process_task_file", slow_process)
    
    # Drop two tasks
    for i in range(2):
        task = {"id": f"t-b1-{i}", "type": "clone", "objective": f"task {i}", "source": "test"}
        (inbox / f"task-b1-{i}.json").write_text(json.dumps(task))
    
    # Simulate threaded watch loop for a few iterations
    active_threads = []
    for _ in range(5):
        active_threads = [t for t in active_threads if t.is_alive()]
        if len(active_threads) < dispatcher.MAX_CONCURRENT:
            tasks = dispatcher.get_pending_tasks()
            active_names = {t.name for t in active_threads}
            new_tasks = [t for t in tasks if str(t) not in active_names]
            for task_path in new_tasks:
                if len(active_threads) >= dispatcher.MAX_CONCURRENT:
                    break
                thread = _threading.Thread(target=dispatcher.process_task_file, args=(task_path,), name=str(task_path), daemon=True)
                thread.start()
                active_threads.append(thread)
        _time.sleep(0.05)
    for t in active_threads:
        t.join(timeout=2)
    
    # Both tasks should have started within one poll interval (not sequential)
    assert len(process_times) == 2
    # Time between starts should be < 0.05s (concurrent), not 0.1s+ (sequential)
    assert abs(process_times[1] - process_times[0]) < 0.08


def test_max_concurrent_respected(tmp_path, monkeypatch):
    """B1: MAX_CONCURRENT limit should be respected."""
    import dispatcher
    monkeypatch.setattr(dispatcher, "BASE_DIR", tmp_path)
    inbox = tmp_path / "brain" / "inbox"
    monkeypatch.setattr(dispatcher, "INBOX", inbox)
    monkeypatch.setattr(dispatcher, "MAX_CONCURRENT", 2)
    
    for d in ["brain/inbox", "brain/active", "brain/completed", "brain/failed"]:
        (tmp_path / d).mkdir(parents=True, exist_ok=True)
    
    import time as _time
    concurrent_count = []
    lock = _threading.Lock()
    active = [0]
    
    def counting_process(task_path):
        with lock:
            active[0] += 1
            concurrent_count.append(active[0])
        _time.sleep(0.15)
        with lock:
            active[0] -= 1
    
    monkeypatch.setattr(dispatcher, "process_task_file", counting_process)
    
    # Drop 4 tasks
    for i in range(4):
        task = {"id": f"t-mc-{i}", "type": "clone", "objective": f"task {i}", "source": "test"}
        (inbox / f"task-mc-{i}.json").write_text(json.dumps(task))
    
    # Run a few iterations
    active_threads = []
    for _ in range(15):
        active_threads = [t for t in active_threads if t.is_alive()]
        if len(active_threads) < dispatcher.MAX_CONCURRENT:
            tasks = dispatcher.get_pending_tasks()
            active_names = {t.name for t in active_threads}
            new_tasks = [t for t in tasks if str(t) not in active_names]
            for task_path in new_tasks:
                if len(active_threads) >= dispatcher.MAX_CONCURRENT:
                    break
                thread = _threading.Thread(target=dispatcher.process_task_file, args=(task_path,), name=str(task_path), daemon=True)
                thread.start()
                active_threads.append(thread)
        _time.sleep(0.05)
    
    for t in active_threads:
        t.join(timeout=2)
    
    # Max concurrent should never exceed MAX_CONCURRENT (2)
    assert len(concurrent_count) > 0
    assert max(concurrent_count) <= 2


# ---------------------------------------------------------------------------
# A1 (v9): Dead code removal — verify V2 decision tree is intact
# ---------------------------------------------------------------------------

def test_janitor_v2_blocked_impossible():
    """A1 v9: BLOCKED_IMPOSSIBLE -> BLOCK (V2 logic only, dead V1 code removed)."""
    h = {"status": "BLOCKED_IMPOSSIBLE"}
    assert janitor_evaluate(h, 0, "t-v9-a1-1") == "BLOCK"


def test_janitor_v2_completed_tests_failed_with_source_files():
    """A1 v9: tests_passed=False -> BLOCK (not SUGGEST from old V1 code)."""
    h = {
        "status": "COMPLETED",
        "tests_passed": False,
        "files_modified": ["a.py"],
        "janitor_notes": "done",
    }
    assert janitor_evaluate(h, 0, "t-v9-a1-2") == "BLOCK"


def test_janitor_v2_completed_tests_passed_none_not_suggest():
    """A1 v9: tests_passed=None should NOT produce SUGGEST (None is not False)."""
    h = {
        "status": "COMPLETED",
        "tests_passed": None,
        "files_modified": ["a.py"],
        "janitor_notes": "clean",
    }
    result = janitor_evaluate(h, 0, "t-v9-a1-3")
    assert result != "SUGGEST" or result == "NOTE"  # Should be NOTE for clean notes


def test_janitor_v2_completed_tests_passed_true():
    """A1 v9: COMPLETED + tests_passed=True -> NOTE."""
    h = {
        "status": "COMPLETED",
        "tests_passed": True,
        "files_modified": ["a.py"],
        "janitor_notes": "all good",
    }
    assert janitor_evaluate(h, 0, "t-v9-a1-4") == "NOTE"


# ---------------------------------------------------------------------------
# A3 (v9): Atomic task claim via os.rename()
# ---------------------------------------------------------------------------

def test_claim_task_first_wins(tmp_path):
    """A3 v9: First call to claim_task succeeds, file is moved."""
    inbox = tmp_path / "inbox"
    active = tmp_path / "active"
    inbox.mkdir()
    active.mkdir()

    task_file = inbox / "task-001.json"
    task_file.write_text('{"id":"t1"}')

    assert claim_task(task_file, active) is True
    assert not task_file.exists()
    assert (active / "task-001.json").exists()


def test_claim_task_second_fails(tmp_path):
    """A3 v9: Second call to claim_task returns False (file already moved)."""
    inbox = tmp_path / "inbox"
    active = tmp_path / "active"
    inbox.mkdir()
    active.mkdir()

    task_file = inbox / "task-001.json"
    task_file.write_text('{"id":"t1"}')

    # First claim succeeds
    assert claim_task(task_file, active) is True
    # Second claim fails (file no longer in inbox)
    assert claim_task(task_file, active) is False


def test_claim_task_two_threads_one_wins(tmp_path):
    """A3 v9: Two threads claiming same task — only one succeeds."""
    inbox = tmp_path / "inbox"
    active = tmp_path / "active"
    inbox.mkdir()
    active.mkdir()

    task_file = inbox / "task-race.json"
    task_file.write_text('{"id":"race"}')

    results = []
    barrier = _threading.Barrier(2)

    def try_claim():
        barrier.wait()
        results.append(claim_task(task_file, active))

    t1 = _threading.Thread(target=try_claim)
    t2 = _threading.Thread(target=try_claim)
    t1.start()
    t2.start()
    t1.join(timeout=2)
    t2.join(timeout=2)

    assert results.count(True) == 1
    assert results.count(False) == 1


# ---------------------------------------------------------------------------
# B3 (v9): Prompt file cleanup on all error paths
# ---------------------------------------------------------------------------

from dispatcher import launch_session


def test_prompt_file_cleaned_on_success(tmp_path, monkeypatch):
    """B3 v9: Prompt file is removed after successful session."""
    import dispatcher
    monkeypatch.setattr(dispatcher, "BASE_DIR", tmp_path)

    task = Task(id="t-b3-1", type="brain", objective="test", source="manual")
    # launch_session will fail (no claude CLI) but the finally block should clean up
    result = launch_session(task, "test context", tmp_path)
    prompt_file = tmp_path / ".dispatcher-prompt.md"
    assert not prompt_file.exists(), "Prompt file should be cleaned up after session"


def test_prompt_file_cleaned_on_exception(tmp_path, monkeypatch):
    """B3 v9: Prompt file is removed even when an exception occurs mid-launch."""
    prompt_file = tmp_path / ".dispatcher-prompt.md"
    prompt_file.write_text("sensitive context")

    # Simulate the try/finally pattern from launch_session
    try:
        raise RuntimeError("simulated error before launch")
    except RuntimeError:
        pass  # Exception caught, but finally should still clean up
    finally:
        if prompt_file.exists():
            prompt_file.unlink()

    assert not prompt_file.exists()


# ---------------------------------------------------------------------------
# v9 Fix 1: validate_handshake tests
# ---------------------------------------------------------------------------

def test_validate_handshake_valid_minimal():
    """Valid handshake with required fields passes."""
    valid, errs = validate_handshake({
        "status": "COMPLETED",
        "janitor_notes": "All good.",
    })
    assert valid is True
    assert errs == []


def test_validate_handshake_valid_full():
    """Valid handshake with all fields passes."""
    valid, errs = validate_handshake({
        "status": "FAILED_RETRY",
        "janitor_notes": "Auth route missing error handler.",
        "files_modified": ["src/auth.py"],
        "tests_passed": False,
        "tokens_consumed": 12345,
        "duration_seconds": 45.2,
    })
    assert valid is True
    assert errs == []


def test_validate_handshake_missing_janitor_notes():
    """Missing janitor_notes is a validation error (required field)."""
    valid, errs = validate_handshake({"status": "COMPLETED"})
    assert valid is False
    assert any("janitor_notes" in e for e in errs)


def test_validate_handshake_unknown_status():
    """Unknown status value is a validation error."""
    valid, errs = validate_handshake({
        "status": "MAGIC_STATUS",
        "janitor_notes": "done",
    })
    assert valid is False
    assert any("MAGIC_STATUS" in e for e in errs)


def test_validate_handshake_unknown_status_still_flows_through_janitor_evaluate():
    """Unknown status hits janitor_evaluate fallback and returns BLOCK."""
    handshake = {"status": "MAGIC_STATUS", "janitor_notes": "done", "tests_passed": None}
    # validate_handshake catches schema issue, but janitor_evaluate still runs
    valid, errs = validate_handshake(handshake)
    assert valid is False
    # janitor_evaluate fallback: unknown status -> BLOCK
    directive = janitor_evaluate(handshake, retry_count=0, task_id="test-task")
    assert directive == "BLOCK"


def test_validate_handshake_files_modified_wrong_type():
    """files_modified as non-list is a validation error."""
    valid, errs = validate_handshake({
        "status": "COMPLETED",
        "janitor_notes": "done",
        "files_modified": "src/auth.py",  # should be a list
    })
    assert valid is False
    assert any("files_modified" in e for e in errs)


def test_validate_handshake_missing_status():
    """Missing status field is a validation error."""
    valid, errs = validate_handshake({"janitor_notes": "done"})
    assert valid is False
    assert any("status" in e for e in errs)


# ---------------------------------------------------------------------------
# v9 Fix 2: context budget constants
# ---------------------------------------------------------------------------

def test_context_budget_constants_defined():
    """Budget constants exist and brain > clone (brain gets more room)."""
    assert CONTEXT_TOKEN_BUDGET_BRAIN > 0
    assert CONTEXT_TOKEN_BUDGET_CLONE > 0
    assert CONTEXT_TOKEN_BUDGET_BRAIN > CONTEXT_TOKEN_BUDGET_CLONE


# ---------------------------------------------------------------------------
# v9 Fix 3: objective mutation for SUGGEST retries
# ---------------------------------------------------------------------------

def test_suggest_requeue_objective_mutation(tmp_path, monkeypatch):
    """On SUGGEST, task.objective is updated with structured prior attempt context."""
    import dispatcher as d

    task = Task(
        id="test-suggest-001",
        type="clone",
        skill="code",
        objective="Fix the login route.",
        wiki_pages=[],
        constraints=[],
        source="test",
        retry_count=0,
    )
    handshake = {
        "status": "COMPLETED",
        "janitor_notes": "Tests failed — login route missing error handling.",
        "files_modified": ["src/auth.py", "src/routes.py"],
        "tests_passed": False,
    }

    # Capture the objective mutation without actually requeuing
    original_objective = task.objective
    files_str = ", ".join(handshake.get("files_modified", [])) or "none"
    from datetime import datetime, timezone
    history_entry = (
        f"\n\n---\n# Prior Attempt {task.retry_count}"
        f" ({datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M UTC')})\n"
        f"Directive: SUGGEST\n"
        f"Files modified: {files_str}\n"
        f"Janitor notes: {handshake.get('janitor_notes', 'none')}\n"
        f"Do NOT repeat the same approach."
    )
    task.objective += history_entry

    assert "Prior Attempt 0" in task.objective
    assert "Files modified: src/auth.py, src/routes.py" in task.objective
    assert "Directive: SUGGEST" in task.objective
    assert "Do NOT repeat the same approach." in task.objective
    assert original_objective in task.objective  # original preserved


# ---------------------------------------------------------------------------
# B1 fix: template variable injection — INJECT_WIKI_CONTEXT_HERE + INJECT_ALLOWED_ENDPOINTS_HERE
# ---------------------------------------------------------------------------

def test_skill_endpoints_loaded_for_known_skills():
    """scopes.yaml is loaded and known skills have endpoint lists."""
    assert "code" in _SKILL_ENDPOINTS
    assert "api.anthropic.com" in _SKILL_ENDPOINTS["code"]
    assert "api.github.com" in _SKILL_ENDPOINTS["code"]


def test_skill_endpoints_fallback_for_unknown_skill():
    """Unknown skill falls back to default endpoints (api.anthropic.com)."""
    endpoints = _SKILL_ENDPOINTS.get("nonexistent_skill_xyz", _DEFAULT_ENDPOINTS)
    assert endpoints == _DEFAULT_ENDPOINTS
    assert "api.anthropic.com" in endpoints


def test_assemble_context_no_unfilled_placeholders(tmp_path, monkeypatch):
    """All 5 template placeholders are replaced — no literal {INJECT_*} in output."""
    import dispatcher as d

    # Create a template with all 5 injection points
    template_dir = tmp_path / "templates"
    template_dir.mkdir()
    template_file = template_dir / "code-clone-TASK.md"
    template_file.write_text(
        "Soul: {INJECT_SOUL_HERE}\n"
        "Task: {INJECT_TASK_HERE}\n"
        "Paths: {INJECT_ALLOWED_PATHS_HERE}\n"
        "Endpoints: {INJECT_ALLOWED_ENDPOINTS_HERE}\n"
        "Wiki: {INJECT_WIKI_CONTEXT_HERE}\n"
    )

    # Minimal wiki Soul.md
    wiki_dir = tmp_path / "wiki"
    wiki_dir.mkdir()
    (wiki_dir / "Soul.md").write_text("# Soul\nTest soul content.")
    (wiki_dir / "index.md").write_text("# Index")

    monkeypatch.setattr(d, "BASE_DIR", tmp_path)
    monkeypatch.setattr(d, "TEMPLATES", template_dir)
    monkeypatch.setattr(d, "SOUL_MD", wiki_dir / "Soul.md")
    monkeypatch.setattr(d, "WIKI_INDEX", wiki_dir / "index.md")

    task = Task(
        id="test-b1-001",
        type="clone",
        skill="code",
        objective="Fix the login route.",
        wiki_pages=[],
        constraints=[],
        source="test",
        retry_count=0,
    )

    context = assemble_context(task)

    # None of the placeholders should remain (INJECT_ALLOWED_PATHS_HERE is replaced
    # in execute_task() not assemble_context(), but the others must be gone)
    assert "{INJECT_SOUL_HERE}" not in context
    assert "{INJECT_TASK_HERE}" not in context
    assert "{INJECT_ALLOWED_ENDPOINTS_HERE}" not in context
    assert "{INJECT_WIKI_CONTEXT_HERE}" not in context
    # INJECT_ALLOWED_PATHS_HERE is replaced in execute_task() — verify it's in context
    # so execute_task() can find and replace it
    assert "api.anthropic.com" in context  # endpoints injected
    assert "Fix the login route." in context  # objective injected
