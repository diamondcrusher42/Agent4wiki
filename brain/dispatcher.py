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
import threading
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

# C1: Load MAX_RETRIES from shared config
_CLONE_CONFIG_PATH = Path(__file__).parent.parent / 'core' / 'config' / 'clone_config.json'
try:
    with open(_CLONE_CONFIG_PATH) as _f_config:
        _clone_config = json.load(_f_config)
    MAX_RETRIES = _clone_config['maxRetries']
except (FileNotFoundError, KeyError, json.JSONDecodeError):
    MAX_RETRIES = 3  # Fallback

# C2: Context token budgets (approximate, using len//3 for code-heavy content)
CONTEXT_TOKEN_BUDGET_BRAIN = 8000
CONTEXT_TOKEN_BUDGET_CLONE = 6000

# Phase 2C: MemPalace path for institutional memory queries
PALACE_PATH = BASE_DIR / "state" / "memory" / "palace"
MEMPALACE_VENV = Path(os.environ.get("MEMPALACE_VENV", "/home/claudebot/workspace/venv/bin/python3"))

# B1: Load allowed endpoints per skill from scopes.yaml (mirrors TS scopes.yaml path)
_SCOPES_PATH = Path(__file__).parent.parent / 'core' / 'keychain' / 'config' / 'scopes.yaml'
try:
    import re as _re
    def _load_scopes_yaml(path: Path) -> dict:
        """Minimal YAML parser for scopes.yaml — reads endpoints per skill."""
        scopes: dict = {}
        current_skill: str | None = None
        in_endpoints = False
        for line in path.read_text().splitlines():
            if not line.strip() or line.strip().startswith('#'):
                continue
            if not line.startswith(' ') and line.rstrip().endswith(':'):
                current_skill = line.strip().rstrip(':')
                scopes[current_skill] = []
                in_endpoints = False
            elif current_skill and line.strip() == 'endpoints:':
                in_endpoints = True
            elif current_skill and in_endpoints and line.strip().startswith('- '):
                scopes[current_skill].append(line.strip()[2:])
            elif current_skill and not line.startswith('  '):
                in_endpoints = False
        return scopes
    _SKILL_ENDPOINTS = _load_scopes_yaml(_SCOPES_PATH)
except Exception as _e:
    import logging as _log_scopes
    _log_scopes.getLogger("dispatcher").warning(
        f"[SCOPES] Failed to load {_SCOPES_PATH}: {_e} — "
        "all skills will use default endpoints (api.anthropic.com). "
        "Check core/keychain/config/scopes.yaml."
    )
    _SKILL_ENDPOINTS = {}

_DEFAULT_ENDPOINTS = ['api.anthropic.com']  # mirrors TS planner.ts fallback

# A1: Sensitive env keys that must never leak to clones
SENSITIVE_ENV_KEYS = {
    'VAULT_MASTER_PASSWORD',
    'ANTHROPIC_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
}


def build_clone_env(extra: dict | None = None) -> dict:
    """Build a sanitized env dict for clone subprocesses, stripping sensitive keys."""
    env = {k: v for k, v in os.environ.items() if k not in SENSITIVE_ENV_KEYS}
    if extra:
        env.update(extra)
    return env

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
    # Token estimate: 1 token ≈ 3 chars (code-heavy content; matches budget guard)
    max_chars = max_tokens * 3
    if len(content) > max_chars:
        content = content[:max_chars] + "\n\n[... truncated to fit context budget ...]"
    return content


def query_mempalace(objective: str, top_k: int = 5) -> str:
    """
    Phase 2C: Query MemPalace for context relevant to the task objective.
    Returns formatted results or empty string on any failure (silent fallback).
    """
    if not PALACE_PATH.exists():
        return ""
    try:
        result = subprocess.run(
            [str(MEMPALACE_VENV), "-m", "mempalace",
             "--palace", str(PALACE_PATH), "search", objective, "--top-k", str(top_k)],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            log.info(f"[MEMPALACE] Retrieved {top_k} relevant memories for task")
            return result.stdout.strip()
    except Exception as e:
        log.debug(f"[MEMPALACE] Query skipped: {e}")
    return ""


def _sanitize_wiki_page_name(name: str) -> str:
    """Reject any page name containing path traversal characters."""
    if ".." in name or "/" in name or "\\" in name:
        raise ValueError(f"Invalid wiki page name: {name!r}")
    import re
    return re.sub(r'[^a-zA-Z0-9_\-]', '', name)


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

        # Phase 2C: inject MemPalace context before task objective
        memory_context = query_mempalace(task.objective)
        if memory_context:
            parts.append(f"## Institutional Memory\n{memory_context}")

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

        # B1 fix: inject allowed endpoints (mirrors TS PromptBuilder + scopes.yaml)
        endpoints = _SKILL_ENDPOINTS.get(task.skill, _DEFAULT_ENDPOINTS)
        template = template.replace("{INJECT_ALLOWED_ENDPOINTS_HERE}", "\n".join(endpoints))

        # B1 fix: build wiki context string and inject into template
        # Mirrors TS PromptBuilder.loadWikiContext() — 500-token budget, truncated at line boundary
        wiki_sections: list[str] = []
        wiki_total_chars = 0
        wiki_char_budget = 2000  # ~500 tokens, same as TS
        for page_name in task.wiki_pages:
            try:
                page_name = _sanitize_wiki_page_name(page_name)
            except ValueError:
                log.warning(f"[{task.id}] Skipping invalid wiki page name: {page_name!r}")
                continue
            page_path = BASE_DIR / "wiki" / f"{page_name}.md"
            if not page_path.exists():
                for subdir in ["segments", "concepts", "tools", "entities", "decisions"]:
                    alt = BASE_DIR / "wiki" / subdir / f"{page_name}.md"
                    if alt.exists():
                        page_path = alt
                        break
            content = read_file_safe(page_path, max_tokens=500)
            if content:
                excerpt = content[:800]  # 800-char per-page cap, same as TS
                if wiki_total_chars + len(excerpt) > wiki_char_budget:
                    log.warning(f"[{task.id}] Wiki context budget reached at '{page_name}' — truncating")
                    break
                wiki_sections.append(f"## {page_name}\n{excerpt}")
                wiki_total_chars += len(excerpt)
        wiki_context = "\n\n---\n\n".join(wiki_sections)
        template = template.replace("{INJECT_WIKI_CONTEXT_HERE}", wiki_context or "(no wiki context)")

        parts.append(template)

        # Also append wiki pages as separate sections for models that benefit from
        # seeing context outside the template block (budget guard handles overflow)
        for page_name in task.wiki_pages:
            try:
                page_name = _sanitize_wiki_page_name(page_name)
            except ValueError:
                log.warning(f"[{task.id}] Skipping invalid wiki page name: {page_name!r}")
                continue
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

    # C2: Context budget guard — drop lowest-priority wiki pages if over budget
    # wiki_pages are ordered descending priority (first = most important)
    # so we drop from the end. Budget split by task type: brain=8000t, clone=6000t.
    budget = CONTEXT_TOKEN_BUDGET_BRAIN if task.type == "brain" else CONTEXT_TOKEN_BUDGET_CLONE
    full_text = "\n\n---\n\n".join(parts)
    estimated_tokens = len(full_text) // 3  # code-heavy: // 3 is more accurate than // 4
    if estimated_tokens > budget and task.wiki_pages:
        dropped = 0
        # wiki page parts start after the template/preamble parts — find them by prefix
        while estimated_tokens > budget and len(parts) > 1:
            # Find the last wiki page part and remove it
            for i in range(len(parts) - 1, -1, -1):
                if parts[i].startswith("# Wiki:"):
                    parts.pop(i)
                    dropped += 1
                    break
            else:
                break  # no more wiki parts to drop
            full_text = "\n\n---\n\n".join(parts)
            estimated_tokens = len(full_text) // 3
        if dropped:
            log.warning(
                f"[{task.id}] Context budget exceeded ({estimated_tokens}t > {budget}t) "
                f"— dropped {dropped} wiki page(s)"
            )
            parts.append(
                f"[Note: {dropped} wiki page(s) dropped due to context budget — "
                f"resubmit with fewer wiki_pages if needed]"
            )
            log_event("context_budget_exceeded", {
                "task_id": task.id,
                "estimated_tokens": estimated_tokens,
                "budget": budget,
                "dropped_pages": dropped,
            })

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


def cleanup_worktree(task_id: str, skill: str):
    """Remove the git worktree for a completed or failed clone task.

    Called after NOTE (success) and BLOCK (terminal failure) so worktrees
    don't accumulate on disk. SUGGEST re-queues intentionally skip cleanup
    because the clone may continue work in the same worktree on retry.
    """
    worktree_name = f"clone-{skill}-{task_id}"
    worktree_path = BASE_DIR / "state" / "worktrees" / worktree_name
    if not worktree_path.exists():
        return
    try:
        subprocess.run(
            ["git", "worktree", "remove", "--force", str(worktree_path)],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            check=True,
        )
        log.info(f"[WORKTREE] Cleaned up: {worktree_name}")
    except subprocess.CalledProcessError as e:
        log.warning(f"[WORKTREE] Failed to remove {worktree_name}: {e.stderr.strip()}")


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

    # B3 (v9): Write prompt file inside try/finally to guarantee cleanup on all error paths
    prompt_file = Path(cwd) / ".dispatcher-prompt.md"
    try:
        prompt_file.write_text(context, encoding="utf-8")

        log.info(f"Launching {task.type} session for task {task.id} in {cwd}")

        cmd = ["claude", "--model", task.model, "--print", "--dangerously-skip-permissions",
               "-p", f"@{prompt_file}"]
        env = build_clone_env({"CLAUDE_MODEL": task.model})
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=task.timeout_minutes * 60,
            env=env,
        )

        return {
            "status": "COMPLETED" if result.returncode == 0 else "FAILED_RETRY",
            "stdout_full": result.stdout or "",  # keep full for handshake extraction
            "stdout": result.stdout[-2000:] if result.stdout else "",  # last 2000 chars for storage
            "stderr": result.stderr[-1000:] if result.stderr else "",
            "returncode": result.returncode,
        }

    except subprocess.TimeoutExpired:
        return {"status": "FAILED_RETRY", "error": f"Timeout after {task.timeout_minutes} minutes"}

    except FileNotFoundError:
        return {"status": "FAILED_REQUIRE_HUMAN", "error": "claude CLI not found on PATH"}

    finally:
        if prompt_file.exists():
            prompt_file.unlink()


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

            # Inject allowed path BEFORE writing TASK.md — clone reads from disk,
            # so the file must contain the real path, not the placeholder.
            context = context.replace("{INJECT_ALLOWED_PATHS_HERE}", str(worktree_path))

            # Write TASK.md into worktree (all placeholders now resolved)
            task_md = worktree_path / "TASK.md"
            task_md.write_text(context, encoding="utf-8")

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
                    valid, errs = validate_handshake(obj)
                    if not valid:
                        log.warning(f"[HANDSHAKE] Schema validation failed: {errs}")
                        log_event("handshake_invalid", {"errors": errs})
                    return obj
            except json.JSONDecodeError:
                continue
    # Fallback: regex scan for JSON blocks containing "status"
    matches = re.findall(r'\{[^{}]*"status"[^{}]*\}', output, re.DOTALL)
    if matches:
        try:
            obj = json.loads(matches[-1])
            valid, errs = validate_handshake(obj)
            if not valid:
                log.warning(f"[HANDSHAKE] Schema validation failed (regex fallback): {errs}")
                log_event("handshake_invalid", {"errors": errs})
            return obj
        except json.JSONDecodeError:
            pass
    return None


_VALID_STATUSES = {"COMPLETED", "FAILED_RETRY", "FAILED_REQUIRE_HUMAN", "BLOCKED_IMPOSSIBLE"}


def validate_handshake(data: dict) -> tuple[bool, list[str]]:
    """Validate handshake schema. Returns (valid, [error_messages]).

    Advisory only — caller logs warnings but proceeds regardless.
    janitor_notes is required: it is the sole context for SUGGEST retries.
    """
    errors: list[str] = []

    # status: required, must be a known value
    status = data.get("status")
    if not isinstance(status, str):
        errors.append(f"status missing or not a string (got {type(status).__name__})")
    elif status not in _VALID_STATUSES:
        errors.append(f"status '{status}' not in known values {_VALID_STATUSES}")

    # janitor_notes: required — sole context for SUGGEST re-queues
    notes = data.get("janitor_notes")
    if notes is None:
        errors.append("janitor_notes missing (required — sole context for SUGGEST retries)")
    elif not isinstance(notes, str):
        errors.append(f"janitor_notes must be str (got {type(notes).__name__})")

    # files_modified: optional, must be list if present
    files = data.get("files_modified")
    if files is not None and not isinstance(files, list):
        errors.append(f"files_modified must be list (got {type(files).__name__})")

    # tokens_consumed / duration_seconds: optional numerics
    for field_name in ("tokens_consumed", "duration_seconds"):
        val = data.get(field_name)
        if val is not None and not isinstance(val, (int, float)):
            errors.append(f"{field_name} must be int or float (got {type(val).__name__})")

    # tests_passed: optional bool
    tp = data.get("tests_passed")
    if tp is not None and not isinstance(tp, bool):
        errors.append(f"tests_passed must be bool (got {type(tp).__name__})")

    return (len(errors) == 0, errors)


def janitor_evaluate(handshake: dict, retry_count: int, task_id: str) -> str:
    """
    Python-side Janitor evaluation — aligned exactly with auditor.ts decision tree.
    Returns: "NOTE" | "SUGGEST" | "BLOCK"

    Decision order (matches auditor.ts evaluateMission):
    1. Circuit breaker (retries >= MAX_RETRIES) -> BLOCK
    2. BLOCKED_IMPOSSIBLE -> BLOCK
    3. tests_passed === false -> BLOCK (regardless of status)
    4. FAILED_REQUIRE_HUMAN -> BLOCK
    5. Structural checks -> SUGGEST
    6. COMPLETED clean -> NOTE
    7. FAILED_RETRY (retries left) -> SUGGEST
    8. Fallback -> BLOCK
    """
    status = handshake.get("status", "FAILED_REQUIRE_HUMAN")

    # 1. Circuit breaker
    if retry_count >= MAX_RETRIES:
        return "BLOCK"

    # 2. BLOCKED_IMPOSSIBLE — before any status-specific branching
    if status == "BLOCKED_IMPOSSIBLE":
        return "BLOCK"

    # 3. tests_passed === false -> BLOCK (matches auditor.ts priority)
    if handshake.get("tests_passed") is False:
        return "BLOCK"

    # 4. FAILED_REQUIRE_HUMAN
    if status == "FAILED_REQUIRE_HUMAN":
        return "BLOCK"

    # 5-6. COMPLETED path — structural checks then NOTE
    if status == "COMPLETED":
        notes = handshake.get("janitor_notes", "").lower()
        files = handshake.get("files_modified", [])

        # Structural checks (mirror of auditor.ts detectStructuralIssue)
        if len(files) > 5 and re.search(r"also fixed|while i was at it|out of scope", notes):
            log.warning(f"[JANITOR] SCOPE CREEP detected in {task_id}")
            return "SUGGEST"

        # Shared config mutation
        shared_configs = [f for f in files if re.search(r"(tsconfig|package\.json|\.gitignore|CLAUDE\.md|\.env\.example)", f)]
        if shared_configs:
            return "SUGGEST"

        # Performance concern
        if re.search(r"(slow|O\(n..\)|timeout|perf|bottleneck)", notes, re.IGNORECASE):
            return "SUGGEST"

        if any(kw in notes for kw in WARN_KEYWORDS):
            log.warning(f"[JANITOR] ARCHITECTURAL SMELL in {task_id}: {notes[:100]}")
            return "SUGGEST"

        return "NOTE"

    # 7. FAILED_RETRY with retries left
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
    """Re-drop a modified task into the inbox with incremented retry counter.

    Uses atomic write (tmp file → rename) so the dispatcher never reads a
    half-written task file even if this call is interrupted mid-write.
    """
    import tempfile
    task.retry_count += 1
    task_data = asdict(task)
    requeue_path = inbox_dir / f"{task.id}-retry{task.retry_count}.json"
    # Write to a sibling .tmp file then rename — atomic on same filesystem
    with tempfile.NamedTemporaryFile(
        mode="w", dir=inbox_dir, suffix=".tmp", delete=False
    ) as tmp:
        json.dump(task_data, tmp, indent=2)
        tmp_path = Path(tmp.name)
    tmp_path.rename(requeue_path)
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

    # Move to active (skip if already there — claim_task() in watch() pre-moves)
    active_path = ACTIVE / task_path.name
    if task_path.parent.resolve() != ACTIVE.resolve():
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
        except Exception as e:
            log.warning(f"Failed to read target_node from task file {active_path}: {e}")
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
    # Phase 2D: file handshake is primary (written by runner.ts to state/handshakes/<id>.json)
    # Fall back to stdout parsing for clones that don't write the file.
    handshake = read_handshake_file(task.id) or extract_handshake(result.get("stdout_full", ""))

    if not handshake:
        # Brain tasks produce free-form output, not JSON handshakes — deliver directly.
        if task.type == "brain":
            output_text = result.get("stdout", "").strip()
            move_to_completed(task, active_path, output_text)
            bridge = get_bridge()
            ts = datetime.now(timezone.utc).strftime("%H:%M UTC")
            bridge.send(f"[{ts}] 🧠 Brain task {task.id}:\n{output_text[:3000]}")
            log_event("task_finished", {"task_id": task.id, "status": "NOTE", "type": "brain"})
            log.info(f"[{task.id}] Brain task complete — output delivered via Bridge")
            return result

        # S5 fix: no synthetic approval — clones must output explicit handshake JSON.
        # Exit code 0 without a handshake is FAILED_RETRY (not NOTE) so the clone
        # gets another attempt with a clear directive to output its handshake.
        reason = (
            "No JSON handshake found in clone output. "
            "Clone must output a JSON object with 'status' field as the last line of stdout. "
            f"exit_code={result.get('exit_code', '?')}"
        )
        log.error(f"[{task.id}] {reason}")
        log_event("task_finished", {"task_id": task.id, "status": "no_handshake", "type": task.type})
        if task.retry_count < MAX_RETRIES - 1:
            # Re-queue with explanation so clone knows what it did wrong
            task.objective += (
                f"\n\n---\n# Prior Attempt {task.retry_count} — NO HANDSHAKE\n"
                f"Your previous run exited without outputting a JSON handshake.\n"
                f"You MUST output a JSON object with at least {{\"status\": \"COMPLETED\", "
                f"\"janitor_notes\": \"...\", \"tests_passed\": true}} as the LAST line of stdout.\n"
                f"Do NOT skip this step."
            )
            if active_path.exists():
                active_path.unlink()
            requeue_task(task, INBOX)
            notify_human(task, "SUGGEST", {"janitor_notes": reason})
        else:
            move_to_failed(task, active_path, reason)
            notify_human(task, "BLOCK", {"janitor_notes": reason})
        return result

    directive = janitor_evaluate(handshake, task.retry_count, task.id)
    write_forge_record(task, directive, handshake)

    if directive == "NOTE":
        log.info(f"[{task.id}] Janitor: NOTE — merging result")
        move_to_completed(task, active_path, result.get("stdout", ""))
        cleanup_worktree(task.id, task.skill)
        notify_human(task, directive, handshake)
    elif directive == "SUGGEST":
        log.info(f"[{task.id}] Janitor: SUGGEST — re-queuing with feedback")
        files_str = ", ".join(handshake.get("files_modified", [])) or "none"
        history_entry = (
            f"\n\n---\n# Prior Attempt {task.retry_count}"
            f" ({datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M UTC')})\n"
            f"Directive: SUGGEST\n"
            f"Files modified: {files_str}\n"
            f"Janitor notes: {handshake.get('janitor_notes', 'none')}\n"
            f"Do NOT repeat the same approach."
        )
        task.objective += history_entry
        if active_path.exists():
            active_path.unlink()
        requeue_task(task, INBOX)
        notify_human(task, directive, handshake)
    elif directive == "BLOCK":
        log.warning(f"[{task.id}] Janitor: BLOCK — escalating to human")
        move_to_failed(task, active_path, f"Janitor BLOCK: {handshake.get('janitor_notes', '')}")
        cleanup_worktree(task.id, task.skill)
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


def claim_task(task_path: Path, active_dir: Path) -> bool:
    """Atomically claim a task file by renaming it to active/.

    Uses os.rename() which is atomic on the same filesystem. Only the thread
    that wins the rename gets to process the task — all others get FileNotFoundError.
    """
    active_path = active_dir / task_path.name
    try:
        os.rename(task_path, active_path)
        return True
    except FileNotFoundError:
        return False  # Another thread already claimed it


def watch():
    """Main watch loop — polls inbox for new tasks with concurrent execution."""
    ensure_directories()
    log.info(f"Dispatcher watching: {INBOX}")
    log.info(f"Poll interval: {POLL_INTERVAL}s | Max concurrent: {MAX_CONCURRENT}")

    active_threads: list[threading.Thread] = []

    while True:
        try:
            # Prune finished threads
            active_threads = [t for t in active_threads if t.is_alive()]

            if len(active_threads) < MAX_CONCURRENT:
                tasks = get_pending_tasks()
                for task_path in tasks:
                    if len(active_threads) >= MAX_CONCURRENT:
                        break
                    if not claim_task(task_path, ACTIVE):
                        continue  # Another thread already claimed it
                    active_path = ACTIVE / task_path.name
                    thread = threading.Thread(
                        target=process_task_file,
                        args=(active_path,),
                        daemon=True,
                    )
                    thread.start()
                    active_threads.append(thread)

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
