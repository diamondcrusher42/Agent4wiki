# Dispatcher

> Flagged as missing by: [[review-opus-review1]]

## What It Is

A lightweight Python script that bridges always-on components (User Agent, droids) with session-based components (Brain, clones). It is not an agent — it has no LLM calls. It watches a task inbox and launches Claude Code sessions with appropriate context when conditions are met.

## The Problem It Solves

The Brain starts fresh every session (`/new`). Currently the only way to start a Brain session is manually via Telegram. But droids are always-on monitors that can detect problems at any time. Without a dispatcher, a droid alert has no path to a Brain response — the architecture has a dead end.

**Without dispatcher:**
```
Droid detects problem → writes to droid-alerts.jsonl → nothing happens
```

**With dispatcher:**
```
Droid detects problem → writes to droid-alerts.jsonl → dispatcher wakes
→ launches Brain session with alert as task context → Brain responds
```

## Behavior

1. Watches `brain/inbox/` for new `.json` task files
2. On new task: assembles context from wiki pages + objective, provisions keychain, launches `claude` session
3. Logs all events to `events/dispatcher.jsonl` (JSON-lines, matching [[concept-inter-agent-protocol]] design)
4. Does NOT interpret or route — just reads, assembles, launches

## Scope

The dispatcher does not:
- Make decisions about task priority
- Communicate with the Brain during its session
- Merge clone outputs
- Retry on failure (that's the circuit breaker in [[segment-janitor]])

It only: watches → assembles context → provisions credentials → launches → logs.

## Implementation

> Code: `brain/dispatcher.py` — full MVP implementation committed.
> Task format spec: `brain/TASK-FORMAT.md`

### Directory structure
```
brain/inbox/      ← drop task JSON files here
brain/active/     ← tasks currently processing
brain/completed/  ← finished tasks + .result.json
brain/failed/     ← tasks that errored
events/dispatcher.jsonl  ← event log (JSON-lines)
```

### Task dataclass (from `brain/TASK-FORMAT.md`)
```python
@dataclass
class Task:
    id: str
    type: str           # "brain" | "clone" | "janitor" | "forge"
    objective: str
    source: str         # who triggered this task
    priority: int = 3   # 1 = urgent, 5 = background
    skill: str = "code"
    required_keys: list = field(default_factory=list)
    wiki_pages: list = field(default_factory=list)
    constraints: list = field(default_factory=list)
    timeout_minutes: int = 30
```

Six supported task types: `brain`, `clone/code`, `clone/research`, `janitor`, `forge`, `droid-triggered`.

### Full lifecycle (per task)
```
assemble_context(task)         → builds prompt from wiki_pages + objective
create_worktree(task)          → git worktree add (clone tasks only)
provision_keychain(path, keys) → subprocess call to keychain CLI
try:
    launch_session(task, ctx)  → claude --print --dangerously-skip-permissions -p <ctx>
finally:
    revoke_keychain(path)      → always runs, even on crash
```

### CLI modes
```bash
python dispatcher.py watch        # daemon mode, polls inbox/ every 2s
python dispatcher.py run <file>   # run a single task file
python dispatcher.py dry <file>   # dry run — print assembled context only
python dispatcher.py status       # show active/completed/failed counts
```

### Language note — Python vs TypeScript Core decision
The [[decision-typescript-python]] rule assigns TypeScript to Core Orchestrator components. `dispatcher.py` is an acceptable MVP exception because:
- It is infrastructure/process orchestration, not a reasoning component
- No LLM calls — pure subprocess management
- Flag for TypeScript rewrite (`brain/dispatcher.ts`) before production hardening

## Implementation Phase

Phase 3/4 deliverable — MVP committed. Must exist before droids are deployed (Phase 6).

*See also: [[concept-inter-agent-protocol]], [[segment-brain]], [[segment-user-agent]], [[decision-typescript-python]]*
