# Dispatcher

> Flagged as missing by: [[review-opus-review1]]

## What It Is

A lightweight Python script (~50 lines) that bridges always-on components (User Agent, droids) with session-based components (Brain, clones). It is not an agent — it has no LLM calls. It watches the event queue and launches Claude Code sessions with appropriate context when conditions are met.

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

1. Watches a directory (e.g., `events/`) for new `.json` task files or appends to monitored `.jsonl` channels
2. On new task: validates format, extracts context, launches `claude code` with task injected as system prompt or initial message
3. Logs launch: task ID, timestamp, Brain session PID
4. Does NOT interpret or route — just reads and launches

## Scope

The dispatcher does not:
- Make decisions about task priority
- Communicate with the Brain during its session
- Merge clone outputs
- Retry on failure (that's the circuit breaker in [[segment-janitor]])

It only: watches → launches → logs.

## Implementation

```python
# brain/dispatcher.py — sketch
import os, json, time, subprocess, pathlib

WATCH_DIR = pathlib.Path("events/")
LAUNCHED = set()

while True:
    for task_file in WATCH_DIR.glob("*.json"):
        task_id = task_file.stem
        if task_id not in LAUNCHED:
            task = json.loads(task_file.read_text())
            subprocess.Popen(["claude", "code", "--task", json.dumps(task)])
            LAUNCHED.add(task_id)
    time.sleep(5)
```

## Implementation Phase

Phase 3 (User Agent) or Phase 4 (Brain + Clone Infrastructure) — must exist before droids are deployed (Phase 6). Add to Phase 4 deliverables as a prerequisite for droid integration.

*See also: [[concept-inter-agent-protocol]], [[segment-brain]], [[segment-user-agent]]*
