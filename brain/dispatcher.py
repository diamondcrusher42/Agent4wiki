"""
Dispatcher — The ignition key for the Agent V4 architecture.

Watches brain/inbox/ for task files (JSON), validates them, assembles context
from the wiki and user state, and launches Claude Code sessions.

This is the missing glue between always-on components (Telegram bots, droids,
cron jobs) and session-based components (Brain, clones).

Usage:
    # Watch mode (daemon) — runs continuously, picks up new tasks
    python dispatcher.py watch

    # Single task — process one task file and exit
    python dispatcher.py run brain/inbox/task-001.json

    # Dry run — validate and show what would happen, don't execute
    python dispatcher.py dry brain/inbox/task-001.json

Requirements:
    - Python 3.9+
    - claude CLI installed and on PATH
    - git (for worktree operations)

File structure expected:
    brain/
    ├── inbox/              ← drop task files here (JSON)
    ├── active/             ← tasks currently being processed (moved from inbox)
    ├── completed/          ← finished tasks with results
    ├── failed/             ← tasks that errored out
    └── templates/          ← clone skill templates (TASK.md variants)
"""

import json
import os
import re
import sys
import time
import shutil
import socket
import subprocess
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
from dataclasses import dataclass, field, asdict

# Bridge import — brain/bridge.py is in the same directory
sys.path.insert(0, str(Path(__file__).parent))
from bridge import get_bridge, BridgeError

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# A2: Load warn_keywords from shared heuristics config
_HEURISTICS_PATH = Path(__file__).parent.parent / 'core' / 'janitor' / 'config' / 'heuristics.json'
try:
    import json as _json_h
    with open(_HEURISTICS_PATH) as _f:
        WARN_KEYWORDS = _json_h.load(_f)['warn_keywords']
except (FileNotFoundError, KeyError, json.JSONDecodeError):
    WARN_KEYWORDS = ['todo:', 'hacky', 'tech debt', 'temporary', 'fragile', 'slow', 'fixme', 'workaround']

BASE_DIR = Path(os.environ.get("AGENT_BASE_DIR", Path(__file__).parent.parent.resolve()))
INBOX     = BASE_DIR / "brain" / "inbox"
ACTIVE    = BASE_DIR / "brain" / "active"
COMPLETED = BASE_DIR / "brain" / "completed"
FAILED    = BASE_DIR / "brain" / "failed"
TEMPLATES = BASE_DIR / "templates"           # canonical until consolidated to core/clones/templates/
WIKI_INDEX = BASE_DIR / "wiki" / "index.md"
USER_STATE = BASE_DIR / "state" / "user_agent" / "state.json"
SOUL_MD   = BASE_DIR / "wiki" / "Soul.md"
EVENT_LOG = BASE_DIR / "events" / "dispatcher.jsonl"

MAX_RETRIES = 3  # Janitor circuit breaker

POLL_INTERVAL = 2  # seconds between inbox checks in watch mode
MAX_CONCURRENT = 3  # max simultaneous clone sessions
FLEET_REGISTRY = BASE_DIR / "state" / "fleet" / "registry.json"

# ---------------------------------------------------------------------------
# Fleet routing (Phase 6B)
# ---------------------------------------------------------------------------

def load_fleet_registry() -> list:
    """Returns list of {node_id, host, user, capabilities, ssh_key}."""
    if not FLEET_REGISTRY.exists():
        return []
    try:
        with open(FLEET_REGISTRY) as f:
            data = json.load(f)
            # Support both {nodes: [...]} and [...] formats
            if isinstance(data, list):
                return data
            return data.get("nodes", [])
    except (json.JSONDecodeError, KeyError):
        return []


def is_local_node(target_node: str) -> bool:
    """Returns True if target_node matches current hostname."""
    return target_node in ("", "local", socket.gethostname())


def validate_task_id(task_id: str) -> str:
    """Validate task ID contains only safe characters (alphanumeric, dash, underscore)."""
    if not re.match(r'^[\w-]+$', task_id):
        raise ValueError(f"Invalid task ID: {task_id!r} — must be alphanumeric/dash/underscore only")
    return task_id


def dispatch_remote(task: dict, node: dict) -> dict:
    """
    SSH into fleet node, write task.json to its inbox, wait for result.
    Returns the handshake JSON from the remote clone.

    Security: uses scp via temp file to avoid shell injection through task JSON.
    Validates task ID to prevent path traversal.
    """
    import tempfile

    task_id = validate_task_id(task['id'])

    # Write to temp file — no shell escaping needed
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(task, f)
        tmp_path = f.name

    try:
        remote_inbox = f"{node['user']}@{node['host']}:~/agent4/brain/inbox/{task_id}.json"
        subprocess.run(
            ["scp", "-i", node["ssh_key"], tmp_path, remote_inbox],
            check=True, timeout=15
        )
    finally:
        os.unlink(tmp_path)

    # Poll for result (max 10 minutes)
    result_path = f"{node['user']}@{node['host']}:~/agent4/brain/completed/{task_id}.json"
    local_result = f"/tmp/remote-result-{task_id}.json"
    for _ in range(120):  # 120 x 5s = 10 min
        time.sleep(5)
        result = subprocess.run(
            ["scp", "-i", node["ssh_key"], result_path, local_result],
            capture_output=True
        )
        if result.returncode == 0:
            with open(local_result) as f:
                return json.load(f)
    raise TimeoutError(f"Remote node {node['node_id']} did not complete task within 10 minutes")


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [DISPATCHER] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("dispatcher")

# ---------------------------------------------------------------------------
# Task schema
# ---------------------------------------------------------------------------

@dataclass
class Task:
    """A task file dropped into brain/inbox/ by Telegram bot, droid, or cron."""
    id: str
    type: str  # "brain" | "clone" | "janitor" | "forge"
    objective: str
    source: str  # who created this: "telegram", "droid:leak-watch", "cron:daily", "brain"
    priority: int = 3  # 1=critical, 2=high, 3=normal, 4=low
    skill: str = "code"  # clone skill template to use
    required_keys: list = field(default_factory=list)  # credentials needed from Keychain
    wiki_pages: list = field(default_factory=list)  # specific wiki pages to inject as context
    constraints: list = field(default_factory=list)  # things NOT to do
    model: str = "claude-sonnet-4-6"  # Sonnet baseline — Forge varies this for A/B
    created_at: str = ""
    timeout_minutes: int = 30
    retry_count: int = 0  # incremented on SUGGEST re-queue

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now(timezone.utc).isoformat()


def load_task(path: Path) -> Task:
    """Load and validate a task file."""
    with open(path) as f:
        data = json.load(f)

    required = ["id", "type", "objective", "source"]
    missing = [k for k in required if k not in data]
    if missing:
        raise ValueError(f"Task file missing required fields: {missing}")

    if data["type"] not in ("brain", "clone", "janitor", "forge"):
        raise ValueError(f"Unknown task type: {data['type']}")

    return Task(**{k: v for k, v in data.items() if k in Task.__dataclass_fields__})


# ---------------------------------------------------------------------------
# Context assembly
# ---------------------------------------------------------------------------

def read_file_safe(path: Path, max_tokens: int = 2000) -> str:
    """Read a file, return empty string if missing. Truncate if too long."""
    if not path.exists():
        return ""
    content = path.read_text(encoding="utf-8", errors="replace")
    # Rough token estimate: 1 token ≈ 4 chars
    max_chars = max_tokens * 4
    if len(content) > max_chars:
        content = content[:max_chars] + "\n\n[... truncated to fit context budget ...]"
    return content


def assemble_context(task: Task) -> str:
    """
    Build the context payload for a Brain or Clone session.
    
    For Brain sessions: wiki index + user state + soul.md + task objective
    For Clone sessions: skill template + wiki pages + task objective (soul injected into template)
    """
    parts = []

    if task.type == "brain":
        # Brain gets the full planning context
        wiki_index = read_file_safe(WIKI_INDEX, max_tokens=500)
        if wiki_index:
            parts.append(f"# Current Wiki Index\n{wiki_index}")

        user_state = read_file_safe(USER_STATE, max_tokens=300)
        if user_state:
            parts.append(f"# User State\n{user_state}")

        soul = read_file_safe(SOUL_MD, max_tokens=200)
        if soul:
            parts.append(f"# Voice & Style\n{soul}")

        parts.append(f"# Task\n{task.objective}")

        if task.constraints:
            parts.append(f"# Constraints\n" + "\n".join(f"- {c}" for c in task.constraints))

    elif task.type == "clone":
        # Clone gets skill template with injected variables
        # Map skill to template filename — matches spawner.ts convention (<skill>-task.md)
        # Special case: the canonical code template is code-clone-TASK.md
        skill_template_map = {"code": "code-clone-TASK.md"}
        template_filename = skill_template_map.get(task.skill, f"{task.skill}-task.md")
        template_path = TEMPLATES / template_filename
        if template_path.exists():
            template = template_path.read_text()
        else:
            template = f"# Mission: {task.skill}\nExecute the following task."
            log.warning(f"No template found for skill '{task.skill}', using generic")

        # Inject soul.md into template
        soul = read_file_safe(SOUL_MD, max_tokens=200)
        template = template.replace("{INJECT_SOUL_HERE}", soul or "(no soul.md found)")

        # Inject objective
        template = template.replace("{INJECT_TASK_HERE}", task.objective)

        parts.append(template)

        # Inject requested wiki pages
        for page_name in task.wiki_pages:
            page_path = BASE_DIR / "wiki" / f"{page_name}.md"
            if not page_path.exists():
                # Try with segments/concepts/tools prefix
                for subdir in ["segments", "concepts", "tools", "entities", "decisions"]:
                    alt = BASE_DIR / "wiki" / subdir / f"{page_name}.md"
                    if alt.exists():
                        page_path = alt
                        break
            content = read_file_safe(page_path, max_tokens=500)
            if content:
                parts.append(f"# Wiki: {page_name}\n{content}")

    elif task.type in ("janitor", "forge"):
        # Janitor and Forge get their own context assembly
        parts.append(f"# {task.type.title()} Task\n{task.objective}")
        wiki_index = read_file_safe(WIKI_INDEX, max_tokens=500)
        if wiki_index:
            parts.append(f"# Wiki Index\n{wiki_index}")

    return "\n\n---\n\n".join(parts)


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

def create_worktree(task: Task) -> Optional[Path]:
    """Create an isolated git worktree for a clone task. Returns worktree path."""
    if task.type != "clone":
        return None

    validate_task_id(task.id)

    worktree_name = f"clone-{task.skill}-{task.id}"
    branch_name = f"task/{task.id}"
    worktree_path = BASE_DIR / "state" / "worktrees" / worktree_name

    if worktree_path.exists():
        log.warning(f"Worktree already exists: {worktree_path}")
        return worktree_path

    try:
        subprocess.run(
            ["git", "worktree", "add", "-b", branch_name, str(worktree_path), "main"],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            check=True,
        )
        log.info(f"Created worktree: {worktree_path} on branch {branch_name}")
        return worktree_path
    except subprocess.CalledProcessError as e:
        log.error(f"Failed to create worktree: {e.stderr}")
        return None


def provision_keychain(worktree_path: Path, required_keys: list) -> bool:
    """Ask the Keychain to provision credentials for this worktree."""
    if not required_keys:
        return True

    # For now, call the keychain CLI. 
    # Future: MCP server call or direct Python import.
    try:
        subprocess.run(
            ["python", str(BASE_DIR / "keychain" / "src" / "keychain.py"),
             "inject", "--agent", worktree_path.name,
             "--needs", ",".join(required_keys),
             "--worktree", str(worktree_path)],
            capture_output=True,
            text=True,
            check=True,
        )
        log.info(f"Keychain provisioned {len(required_keys)} keys for {worktree_path.name}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        log.warning(f"Keychain provisioning skipped (not yet implemented): {e}")
        # In MVP, this is a soft failure — we continue without keys
        # The clone will fail when it tries to use the missing key
        return True


def revoke_keychain(worktree_path: Path) -> bool:
    """Ask the Keychain to revoke credentials and scan for leaks."""
    try:
        subprocess.run(
            ["python", str(BASE_DIR / "keychain" / "src" / "keychain.py"),
             "revoke", "--worktree", str(worktree_path)],
            capture_output=True,
            text=True,
            check=True,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        log.warning("Keychain revocation skipped (not yet implemented)")
        return True


def launch_session(task: Task, context: str, worktree_path: Optional[Path] = None) -> dict:
    """
    Launch a Claude Code session with the assembled context.
    Returns the handshake result.
    """
    cwd = str(worktree_path) if worktree_path else str(BASE_DIR)

    # Write context to prompt file and pass via @file — avoids credential leakage in /proc/<pid>/cmdline
    prompt_file = Path(cwd) / ".dispatcher-prompt.md"
    prompt_file.write_text(context, encoding="utf-8")

    log.info(f"Launching {task.type} session for task {task.id} in {cwd}")

    try:
        cmd = ["claude", "--model", task.model, "--print", "--dangerously-skip-permissions",
               "-p", f"@{prompt_file}"]
        env = {**os.environ, "CLAUDE_MODEL": task.model}
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=task.timeout_minutes * 60,
            env=env,
        )

        # Clean up prompt file
        if prompt_file.exists():
            prompt_file.unlink()

        return {
            "status": "COMPLETED" if result.returncode == 0 else "FAILED_RETRY",
            "stdout_full": result.stdout or "",  # keep full for handshake extraction
            "stdout": result.stdout[-2000:] if result.stdout else "",  # last 2000 chars for storage
            "stderr": result.stderr[-1000:] if result.stderr else "",
            "returncode": result.returncode,
        }

    except subprocess.TimeoutExpired:
        if prompt_file.exists():
            prompt_file.unlink()
        return {"status": "FAILED_RETRY", "error": f"Timeout after {task.timeout_minutes} minutes"}

    except FileNotFoundError:
        if prompt_file.exists():
            prompt_file.unlink()
        return {"status": "FAILED_REQUIRE_HUMAN", "error": "claude CLI not found on PATH"}


def execute_task(task: Task) -> dict:
    """
    Full task execution lifecycle:
    1. Assemble context
    2. Create worktree (if clone)
    3. Provision keychain (if credentials needed)
    4. Launch session
    5. Revoke keychain
    6. Return result
    """
    started_at = datetime.now(timezone.utc).isoformat()
    worktree_path = None

    try:
        # 1. Assemble context
        context = assemble_context(task)

        # 2. Create worktree for clones
        if task.type == "clone":
            worktree_path = create_worktree(task)
            if not worktree_path:
                return {"status": "FAILED_RETRY", "error": "Could not create worktree"}

            # Write TASK.md into worktree
            task_md = worktree_path / "TASK.md"
            task_md.write_text(context, encoding="utf-8")

            # Inject allowed path into template
            context = context.replace("{INJECT_ALLOWED_PATHS_HERE}", str(worktree_path))

        # 3. Provision credentials
        if task.required_keys:
            provision_keychain(worktree_path or BASE_DIR, task.required_keys)

        # 4. Launch session
        result = launch_session(task, context, worktree_path)

        # 5. Revoke credentials
        if task.required_keys and worktree_path:
            revoke_keychain(worktree_path)

        # 6. Enrich result
        result["task_id"] = task.id
        result["task_type"] = task.type
        result["started_at"] = started_at
        result["finished_at"] = datetime.now(timezone.utc).isoformat()
        result["worktree"] = str(worktree_path) if worktree_path else None

        return result

    except Exception as e:
        log.error(f"Task {task.id} failed with exception: {e}")
        # Still revoke credentials on failure
        if task.required_keys and worktree_path:
            revoke_keychain(worktree_path)
        return {
            "status": "FAILED_RETRY",
            "task_id": task.id,
            "error": str(e),
            "started_at": started_at,
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }


# ---------------------------------------------------------------------------
# Event logging
# ---------------------------------------------------------------------------

def log_event(event_type: str, data: dict):
    """Append an event to the dispatcher event log (JSON-lines)."""
    EVENT_LOG.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event_type,
        **data,
    }
    with open(EVENT_LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


def notify_human(task, directive: str, handshake: dict):
    """
    Alert the user through the Bridge. Uses broadcast() for BLOCK/security,
    send() (fallback cascade) for completions and suggestions.
    """
    bridge = get_bridge()
    ts = datetime.now(timezone.utc).strftime("%H:%M UTC")

    if directive == "NOTE":
        msg = f"[{ts}] ✓ Task {task.id} complete ({task.skill})\nObjective: {task.objective[:120]}"
        bridge.send(msg)

    elif directive == "SUGGEST":
        notes = handshake.get("janitor_notes", "")[:200]
        msg = f"[{ts}] ↻ Task {task.id} re-queued — Janitor feedback:\n{notes}"
        bridge.send(msg)

    elif directive == "BLOCK":
        notes = handshake.get("janitor_notes", "")[:200]
        msg = (
            f"[{ts}] 🚫 Task {task.id} BLOCKED — human intervention required\n"
            f"Skill: {task.skill} | Source: {task.source}\n"
            f"Objective: {task.objective[:120]}\n"
            f"Reason: {notes}"
        )
        # Broadcast BLOCK to all channels — this is urgent
        results = bridge.broadcast(msg, subject=f"Agent V4 — Task BLOCKED: {task.id}")
        delivered = [ch for ch, r in results.items() if r == "ok"]
        log.warning(f"[BRIDGE] BLOCK alert delivered via: {', '.join(delivered) or 'NONE'}")

    elif directive == "SECURITY":
        msg = (
            f"[{ts}] 🔴 SECURITY ALERT — Task {task.id}\n"
            f"Credential leak or security violation detected.\n"
            f"Details: {handshake.get('janitor_notes', 'see logs')[:200]}"
        )
        bridge.broadcast(msg, subject=f"Agent V4 — SECURITY ALERT: {task.id}")


# ---------------------------------------------------------------------------
# Janitor integration (Python-side MVP)
# ---------------------------------------------------------------------------

def read_handshake_file(task_id: str) -> Optional[dict]:
    """
    B1: Read handshake from file written by runner.ts.
    Falls back to None if file doesn't exist.
    """
    handshake_path = BASE_DIR / "state" / "handshakes" / f"{task_id}.json"
    if handshake_path.exists():
        try:
            with open(handshake_path) as f:
                data = json.load(f)
            handshake_path.unlink()  # clean up after reading
            return data
        except (json.JSONDecodeError, OSError):
            pass
    return None


def extract_handshake(output: str) -> Optional[dict]:
    """Extract the JSON handshake block from clone stdout.

    The clone MUST output its JSON handshake as the final line of stdout.
    We reverse-iterate to find the last line starting with '{', then JSON.parse it.
    """
    if not output:
        return None
    lines = output.strip().split("\n")
    for line in reversed(lines):
        stripped = line.strip()
        if stripped.startswith("{"):
            try:
                obj = json.loads(stripped)
                if "status" in obj:
                    return obj
            except json.JSONDecodeError:
                continue
    # Fallback: regex scan for JSON blocks containing "status"
    matches = re.findall(r'\{[^{}]*"status"[^{}]*\}', output, re.DOTALL)
    if matches:
        try:
            return json.loads(matches[-1])
        except json.JSONDecodeError:
            pass
    return None


def janitor_evaluate(handshake: dict, retry_count: int, task_id: str) -> str:
    """
    Minimal Python-side Janitor evaluation.
    Returns: "NOTE" | "SUGGEST" | "BLOCK"

    The full Janitor (core/janitor/auditor.ts) will be called via
    npx ts-node once the TypeScript lifecycle is wired up. This is the MVP bridge.
    """
    status = handshake.get("status", "FAILED_REQUIRE_HUMAN")

    # Circuit breaker
    if retry_count >= MAX_RETRIES:
        return "BLOCK"

    if status == "BLOCKED_IMPOSSIBLE":
        return "BLOCK"

    if status == "FAILED_REQUIRE_HUMAN":
        return "BLOCK"

    if status == "COMPLETED":
        tests_passed = handshake.get("tests_passed", False)
        notes = handshake.get("janitor_notes", "").lower()

        # Structural checks (mirror of auditor.ts detectStructuralIssue)
        files = handshake.get("files_modified", [])
        if len(files) > 5 and re.search(r"also fixed|while i was at it|out of scope", notes):
            log.warning(f"[JANITOR] SCOPE CREEP detected in {task_id}")
            return "SUGGEST"

        source_files = [f for f in files if re.search(r"\.(ts|js|py)$", f) and "test" not in f]
        if not tests_passed and source_files:
            log.warning(f"[JANITOR] MISSING TESTS or tests failed in {task_id}")
            return "SUGGEST"

        if any(kw in notes for kw in WARN_KEYWORDS):
            log.warning(f"[JANITOR] ARCHITECTURAL SMELL in {task_id}: {notes[:100]}")
            return "SUGGEST"

        return "NOTE"

    if status == "FAILED_RETRY" and retry_count < MAX_RETRIES - 1:
        return "SUGGEST"

    return "BLOCK"


def write_forge_record(task: "Task", directive: str, handshake: dict):
    """Write a ForgeRecord to forge/events.jsonl for Forge consumption."""
    record = {
        "task_id": task.id,
        "skill": task.skill,
        "directive": directive,
        "tokens_consumed": handshake.get("tokens_consumed", 0),
        "duration_seconds": handshake.get("duration_seconds", 0),
        "files_modified": handshake.get("files_modified", []),
        "janitor_notes": handshake.get("janitor_notes", ""),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    forge_log = BASE_DIR / "forge" / "events.jsonl"
    forge_log.parent.mkdir(parents=True, exist_ok=True)
    with open(forge_log, "a") as f:
        f.write(json.dumps(record) + "\n")


def requeue_task(task: "Task", inbox_dir: Path):
    """Re-drop a modified task into the inbox with incremented retry counter."""
    task.retry_count += 1
    task_data = asdict(task)
    requeue_path = inbox_dir / f"{task.id}-retry{task.retry_count}.json"
    with open(requeue_path, "w") as f:
        json.dump(task_data, f, indent=2)
    log.info(f"[JANITOR] Re-queued {task.id} (retry {task.retry_count}) to {requeue_path}")


def move_to_completed(task: "Task", active_path: Path, output: str):
    """Move task from active to completed, write result file."""
    dest = COMPLETED / active_path.name
    if active_path.exists():
        shutil.move(str(active_path), str(dest))
    result_path = dest.with_suffix(".result.json")
    with open(result_path, "w") as f:
        json.dump({"task_id": task.id, "status": "COMPLETED", "output": output[-2000:]}, f, indent=2)


def move_to_failed(task: "Task", active_path: Path, reason: str):
    """Move task from active to failed, write result file."""
    dest = FAILED / active_path.name
    if active_path.exists():
        shutil.move(str(active_path), str(dest))
    result_path = dest.with_suffix(".result.json")
    with open(result_path, "w") as f:
        json.dump({"task_id": task.id, "status": "FAILED", "reason": reason[:2000]}, f, indent=2)


# ---------------------------------------------------------------------------
# Task routing
# ---------------------------------------------------------------------------

def process_task_file(task_path: Path) -> dict:
    """
    Process a single task file:
    1. Validate
    2. Move to active/
    3. Execute
    4. Move to completed/ or failed/
    5. Log event
    """
    log.info(f"Processing: {task_path.name}")

    # Load and validate
    try:
        task = load_task(task_path)
    except (json.JSONDecodeError, ValueError) as e:
        log.error(f"Invalid task file {task_path.name}: {e}")
        shutil.move(str(task_path), str(FAILED / task_path.name))
        log_event("task_invalid", {"file": task_path.name, "error": str(e)})
        return {"status": "FAILED_REQUIRE_HUMAN", "error": str(e)}

    # Move to active
    active_path = ACTIVE / task_path.name
    shutil.move(str(task_path), str(active_path))
    log_event("task_started", {"task_id": task.id, "type": task.type, "source": task.source})

    # Fleet routing check (Phase 6B)
    target = getattr(task, 'target_node', '') if hasattr(task, 'target_node') else ''
    if not target:
        # Check raw task data for target_node
        try:
            with open(active_path) as _f:
                _raw = json.load(_f)
                target = _raw.get('target_node', '')
        except:
            target = ''

    if target and not is_local_node(target):
        registry = load_fleet_registry()
        node = next((n for n in registry if n.get('node_id', n.get('id', '')) == target), None)
        if node:
            log.info(f'Dispatching task {task.id} to remote node: {target}')
            try:
                from dataclasses import asdict as _asdict
                handshake = dispatch_remote(_asdict(task), node)
                directive = janitor_evaluate(handshake, 0, task.id)
                write_forge_record(task, directive, handshake)
                move_to_completed(task, active_path, json.dumps(handshake))
                log_event('task_finished', {'task_id': task.id, 'status': directive, 'type': task.type, 'node': target})
                return handshake
            except Exception as e:
                log.error(f'Remote dispatch to {target} failed: {e}')
                log.info(f'Falling back to local execution for task {task.id}')
        else:
            log.warning(f"target_node '{target}' not in registry — running local")

    # Execute
    result = execute_task(task)

    # --- Janitor evaluation (Phase 1) ---
    output = result.get("stdout", "")
    handshake = extract_handshake(output)

    if not handshake:
        # No parseable handshake — treat the raw result status as a fallback
        if result.get("status") == "COMPLETED":
            # Session completed but no structured handshake — treat as NOTE
            handshake = {
                "status": "COMPLETED",
                "tests_passed": True,
                "files_modified": [],
                "janitor_notes": "No structured handshake — raw completion accepted.",
                "tokens_consumed": 0,
                "duration_seconds": 0,
            }
        else:
            log.error(f"[{task.id}] No JSON handshake in clone output — treating as BLOCK")
            move_to_failed(task, active_path, "No handshake JSON found")
            log_event("task_finished", {"task_id": task.id, "status": "BLOCK", "type": task.type})
            notify_human(task, "BLOCK", {"janitor_notes": "No handshake JSON in clone output"})
            return result

    directive = janitor_evaluate(handshake, task.retry_count, task.id)
    write_forge_record(task, directive, handshake)

    if directive == "NOTE":
        log.info(f"[{task.id}] Janitor: NOTE — merging result")
        move_to_completed(task, active_path, output)
        notify_human(task, directive, handshake)
    elif directive == "SUGGEST":
        log.info(f"[{task.id}] Janitor: SUGGEST — re-queuing with feedback")
        task.objective += f"\n\nJanitor feedback: {handshake.get('janitor_notes', '')}"
        if active_path.exists():
            active_path.unlink()
        requeue_task(task, INBOX)
        notify_human(task, directive, handshake)
    elif directive == "BLOCK":
        log.warning(f"[{task.id}] Janitor: BLOCK — escalating to human")
        move_to_failed(task, active_path, f"Janitor BLOCK: {handshake.get('janitor_notes', '')}")
        notify_human(task, directive, handshake)

    log_event("task_finished", {
        "task_id": task.id,
        "status": directive,
        "type": task.type,
    })

    log.info(f"Task {task.id}: directive={directive}")
    return result


# ---------------------------------------------------------------------------
# Watch mode
# ---------------------------------------------------------------------------

def ensure_directories():
    """Create all required directories."""
    for d in [INBOX, ACTIVE, COMPLETED, FAILED, TEMPLATES, EVENT_LOG.parent]:
        d.mkdir(parents=True, exist_ok=True)


def get_pending_tasks() -> list[Path]:
    """Get task files from inbox, sorted by priority (filename convention: P1-*, P2-*, etc.)"""
    if not INBOX.exists():
        return []
    tasks = sorted(INBOX.glob("*.json"))
    return tasks


def watch():
    """Main watch loop — polls inbox for new tasks."""
    ensure_directories()
    log.info(f"Dispatcher watching: {INBOX}")
    log.info(f"Poll interval: {POLL_INTERVAL}s | Max concurrent: {MAX_CONCURRENT}")

    while True:
        try:
            tasks = get_pending_tasks()
            if tasks:
                # Process one at a time in MVP (concurrent execution in Phase 4)
                task_path = tasks[0]
                process_task_file(task_path)
            time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            log.info("Dispatcher shutting down.")
            break
        except Exception as e:
            log.error(f"Watch loop error: {e}")
            time.sleep(POLL_INTERVAL * 5)  # back off on errors


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]

    if command == "watch":
        watch()

    elif command == "run":
        if len(sys.argv) < 3:
            print("Usage: dispatcher.py run <task-file.json>")
            sys.exit(1)
        ensure_directories()
        task_path = Path(sys.argv[2])
        if not task_path.exists():
            print(f"File not found: {task_path}")
            sys.exit(1)
        result = process_task_file(task_path)
        print(json.dumps(result, indent=2))

    elif command == "dry":
        if len(sys.argv) < 3:
            print("Usage: dispatcher.py dry <task-file.json>")
            sys.exit(1)
        task_path = Path(sys.argv[2])
        task = load_task(task_path)
        context = assemble_context(task)
        print(f"Task ID:     {task.id}")
        print(f"Type:        {task.type}")
        print(f"Source:      {task.source}")
        print(f"Priority:    {task.priority}")
        print(f"Skill:       {task.skill}")
        print(f"Keys needed: {task.required_keys}")
        print(f"Wiki pages:  {task.wiki_pages}")
        print(f"Timeout:     {task.timeout_minutes} min")
        print(f"\n--- Assembled Context ({len(context)} chars) ---\n")
        print(context[:3000])
        if len(context) > 3000:
            print(f"\n[... {len(context) - 3000} more chars ...]")

    elif command == "status":
        ensure_directories()
        inbox = list(INBOX.glob("*.json"))
        active = list(ACTIVE.glob("*.json"))
        completed = list(COMPLETED.glob("*.json"))
        failed = list(FAILED.glob("*.json"))
        print(f"Inbox:     {len(inbox)} pending")
        print(f"Active:    {len(active)} running")
        print(f"Completed: {len(completed)} done")
        print(f"Failed:    {len(failed)} errors")

    else:
        print(f"Unknown command: {command}")
        print("Commands: watch, run, dry, status")
        sys.exit(1)


if __name__ == "__main__":
    main()
