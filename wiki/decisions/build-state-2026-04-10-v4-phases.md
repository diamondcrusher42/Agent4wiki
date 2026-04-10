# Build State 2026-04-10 — V4 Phases 2A/2B/2C/2D

> Commit: `7ad431c`
> Branch: `main`
> Date: 2026-04-10
> Tests: 65 pytest + 30 Jest (all passing)
> Live readiness: 15% → 60%

## Summary

Implemented all four sub-phases of the V4 activation plan Phase 2 (Repo Remix).

## Phase 2A — start.sh Production Launcher

New file `start.sh`:
- Sources `/home/claudebot/keychain/vault.env` credentials
- Starts `brain/dispatcher.py watch` in background via nohup
- Writes PID to `/tmp/agent4wiki-dispatcher.pid`
- Prints status: queued/active/completed task counts
- Single command: `./start.sh`

## Phase 2B — Brain Classifier Wired into CLAUDE.md

**Impact: 15% → 60% live** (single highest-value change)

Added mandatory 3-tier routing to `CLAUDE.md`:

| Tier | Description | Action |
|------|-------------|--------|
| DIRECT | Greetings, simple questions, quick lookups | Reply inline |
| BRAIN_ONLY | Analysis, explanation, planning — no file writes | Reason + reply |
| FULL_PIPELINE | Build/fix/implement + file writes or code execution | Write task.json → dispatcher |

Default rule: when in doubt between BRAIN_ONLY and FULL_PIPELINE, use BRAIN_ONLY.

Previous state: only DIRECT and PIPELINE tiers, no explicit enforcement.

## Phase 2C — MemPalace Auto-Query

Added `query_mempalace()` to `brain/dispatcher.py`:
- Queries `state/memory/palace` via `python3 -m mempalace ... search <objective> --top-k 5`
- Results injected as `## Institutional Memory` section in brain task context
- 10-second timeout, silent fallback on failure or missing palace path
- Activates for all `type=brain` tasks

palace.json has 1412 drawers from wiki pages — now queried in production.

## Phase 2D — File-Based Handshake (Primary)

Changed handshake extraction in watch loop:

```python
# Before:
handshake = extract_handshake(result.get("stdout", ""))

# After:
handshake = read_handshake_file(task.id) or extract_handshake(result.get("stdout_full", ""))
```

- `read_handshake_file()` existed since v8 but was never called in production
- `runner.ts` writes `state/handshakes/<task_id>.json` — now the primary source
- Fallback uses `stdout_full` (complete output) not `stdout` (last 2000 chars)

## Test Status

- 65 Python tests: all passing
- 30 TypeScript lifecycle tests: all passing
- py_compile: clean
- tsc --noEmit: clean (no changes to TypeScript)

## What's Still Pending

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Clone Army dedicated bot token | ⏳ Needs @BotFather action from Jure |
| Phase 3 | Janitor in live loop (gate clone→Bridge) | 📋 Planned |
| Phase 4 | Bridge as primary output layer | 📋 Planned |
| Phase 5 | Forge autonomous (Month 2) | ⏳ Deferred |
