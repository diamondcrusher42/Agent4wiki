# Clone Lifecycle

> The complete execution sequence for a disposable clone — from worktree creation to teardown. Owned by CloneWorker. Three phases: spawn, run, teardown.

## Overview

Every clone follows a deterministic lifecycle. No exceptions. The lifecycle is owned by `CloneWorker.execute()` in `core/clones/clone_worker.ts`. No other class spawns or manages the full lifecycle.

```
Brain writes task.json → brain/inbox/
  ↓
dispatcher.py picks up task
  ↓
npx ts-node core/clones/clone_worker.ts --task <path>
  ↓
  [SPAWN]    spawner.ts creates git worktree in state/worktrees/task-{id}/
  [KEYCHAIN] provisionEnvironment() writes .env to worktree
  [SETUP]    setup.sh runs: npm install, pip install, task-specific setup
  [RUN]      runner.ts launches: claude --model {model} --print --dangerously-skip-permissions -p "{prompt}"
  [HANDSHAKE] clone outputs JSON as final line of stdout
  [JANITOR]  auditor.ts evaluates handshake → BLOCK / SUGGEST / NOTE
  [TEARDOWN] revokeEnvironment() deletes .env, removeWorktree() cleans up
  ↓
CloneResult JSON output to stdout
  ↓
dispatcher.py parses result, calls bridge.py
```

## Phase 1: Spawn

**Owner:** `core/clones/lifecycle/spawner.ts` — `createWorktree()`

1. Create git worktree: `git worktree add state/worktrees/task-{id} -b task-{id}`
2. Write `setup.sh` to worktree root:
   ```bash
   #!/bin/bash
   cd "$(dirname "$0")"
   [[ -f package.json ]] && npm install --silent
   [[ -f requirements.txt ]] && pip install -r requirements.txt --quiet
   echo "Setup complete."
   ```
3. Append task-specific setup commands from template if present

## Phase 2: Run

**Owner:** `core/clones/lifecycle/runner.ts` — `run()`

1. Execute `setup.sh` first. If missing: log warning, continue.
2. Build prompt via `PromptBuilder.buildPrompt()` (5 injection variables)
3. Launch clone process:
   ```
   claude --model {task.model} --print --dangerously-skip-permissions -p "{prompt}"
   ```
   Fallback: set `CLAUDE_MODEL={task.model}` as env var if `--model` flag unsupported
4. Capture all stdout. Enforce timeout (`task.timeoutMinutes`).

## Phase 3: Teardown

**Owner:** `core/clones/lifecycle/teardown.ts` — `removeWorktree()` + `mergeWorktree()`

- `revokeEnvironment()` MUST run in `finally` block — even if clone crashed
- Verify `.env` deleted: `ls state/worktrees/task-{id}/.env` must fail
- If Janitor approved (NOTE): merge branch, archive task JSON to brain/completed/
- If Janitor rejected (BLOCK/SUGGEST): move to brain/failed/, log to forge/events.jsonl

## Handshake Protocol

The clone outputs its result as the **final line of stdout**:

```json
{
  "status": "COMPLETED|FAILED_REQUIRE_HUMAN|FAILED_RETRY|BLOCKED_IMPOSSIBLE",
  "summary": "one-line description",
  "files_changed": ["path/to/file.ts"],
  "tests_passed": true,
  "tokens_consumed": 0,
  "duration_seconds": 0,
  "confidence": 0.85,
  "janitor_notes": "brief notes for auditor"
}
```

**Parser rule:** Split stdout by `\n`, reverse-iterate, find last line starting with `{`, `JSON.parse()` it. If no valid JSON found → treat as `FAILED_REQUIRE_HUMAN`.

## Security Invariants

- `.env` file must NOT exist after teardown (verify before marking complete)
- `grep -r "sk-ant" state/worktrees/` must return nothing
- Path traversal: all file access via `path.resolve()`, never `path.includes()`
- Allowed paths enforced: `if (!resolved.startsWith(path.resolve(worktreePath))) throw`

*See also: [[segment-clones]], [[concept-git-worktrees]], [[concept-clone-skill-templates]], [[segment-janitor]]*
