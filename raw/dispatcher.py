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
import sys
import time
import shutil
import subprocess
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
from dataclasses import dataclass, field, asdict

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(os.environ.get("AGENT_BASE_DIR", Path.home() / "agent-v4"))
INBOX = BASE_DIR / "brain" / "inbox"
ACTIVE = BASE_DIR / "brain" / "active"
COMPLETED = BASE_DIR / "brain" / "completed"
FAILED = BASE_DIR / "brain" / "failed"
TEMPLATES = BASE_DIR / "brain" / "templates"
WIKI_INDEX = BASE_DIR / "wiki" / "index.md"
USER_STATE = BASE_DIR / "user-agent" / "state" / "state.json"
SOUL_MD = BASE_DIR / "user-agent" / "profile" / "soul.md"
EVENT_LOG = BASE_DIR / "events" / "dispatcher.jsonl"

POLL_INTERVAL = 2  # seconds between inbox checks in watch mode
MAX_CONCURRENT = 3  # max simultaneous clone sessions

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
    created_at: str = ""
    timeout_minutes: int = 30

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
        template_path = TEMPLATES / f"{task.skill}.md"
        if template_path.exists():
            template = template_path.read_text()
        else:
            template = f"# Mission: {task.skill}\nExecute the following task."
            log.warning(f"No template found for skill '{task.skill}', using generic")

        # Inject soul.md into template
        soul = read_file_safe(SOUL_MD, max_tokens=200)
        template = template.replace("{INJECT_SOUL_MD_HERE}", soul or "(no soul.md found)")

        # Inject objective
        template = template.replace("{INJECT_BRAIN_DELEGATED_TASK_HERE}", task.objective)

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

    worktree_name = f"clone-{task.skill}-{task.id}"
    branch_name = f"task/{task.id}"
    worktree_path = BASE_DIR.parent / worktree_name

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

    # Write context to a temporary prompt file in the working directory
    prompt_file = Path(cwd) / ".dispatcher-prompt.md"
    prompt_file.write_text(context, encoding="utf-8")

    log.info(f"Launching {task.type} session for task {task.id} in {cwd}")

    try:
        result = subprocess.run(
            ["claude", "--print", "--dangerously-skip-permissions",
             "-p", context],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=task.timeout_minutes * 60,
        )

        # Clean up prompt file
        if prompt_file.exists():
            prompt_file.unlink()

        return {
            "status": "COMPLETED" if result.returncode == 0 else "FAILED_RETRY",
            "stdout": result.stdout[-2000:] if result.stdout else "",  # last 2000 chars
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
            context = context.replace("{INJECT_ALLOWED_PATH_HERE}", str(worktree_path))

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

    # Execute
    result = execute_task(task)

    # Move to completed or failed
    if result.get("status") == "COMPLETED":
        dest = COMPLETED / task_path.name
    else:
        dest = FAILED / task_path.name

    if active_path.exists():
        shutil.move(str(active_path), str(dest))

    # Write result alongside the task file
    result_path = dest.with_suffix(".result.json")
    with open(result_path, "w") as f:
        json.dump(result, f, indent=2)

    log_event("task_finished", {
        "task_id": task.id,
        "status": result.get("status"),
        "type": task.type,
    })

    log.info(f"Task {task.id}: {result.get('status')}")
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
