# Opus Build Brief — Agent V4 Implementation

> This document is a mission brief for Claude Opus. It contains everything needed to implement the Agent V4 codebase from its current stub state to a working autonomous system.
>
> Read this document first. Then read the files listed under "Full Context". Then execute Phase 0 before anything else.

---

## What This System Is

Agent V4 is a personal AI agent system built around 7 specialised segments. The architecture is fully documented in the wiki (56 pages). The codebase is scaffolded but most methods throw `NotImplementedError` or return stubs. Your job is to implement it phase by phase.

**The one-line summary of what needs to happen:**
A Telegram message arrives → ComplexityClassifier routes it → Brain plans using Haiku API → MissionBrief written to `brain/inbox/` as JSON → Python dispatcher picks it up → git worktree spawned → clone runs → Janitor evaluates handshake → Bridge notifies user.

None of that chain is connected yet. You will connect it.

---

## Full Context

Before writing a single line of code, read these files in order:

### 1. Full repo context (Repomix pack)
```
raw/repomix-full-context.txt
```
This is every file in the repo packed into a single document by Repomix. It is the authoritative source of what the code actually looks like right now. Do not assume — read it.

### 2. Build plan (exact phase-by-phase instructions)
```
wiki/decisions/plan-build-v1.md
```
This is the primary implementation guide. It contains exact code for every method you need to implement, unit test specs, and verification commands for each phase. Follow it precisely.

### 3. Current known bugs (all 20 issues)
```
wiki/decisions/review-code-audit-1.md
```
6 are compile-blocking. 9 are structural. 5 are weak-signal. Fix compile-blocking first (Phase 0 in the build plan covers exactly these).

### 4. Latest external review
```
wiki/decisions/review-gemini-review7.md
```
Gemini's current-state assessment. The key insight: `triggerFullPipeline()` in `core/user_agent/agent.ts` must auto-generate a `task.json` and write it to `brain/inbox/`. That is the missing bridge between TypeScript and Python.

### 5. System philosophy (why things are the way they are)
```
wiki/decisions/decision-system-philosophy.md
```
Read this if you're confused about why a design choice was made. The answers are here.

---

## Current State: What Works, What Doesn't

### What runs today
- `python brain/dispatcher.py watch` — the Python dispatcher watches brain/inbox/ and processes tasks
- `core/routing/classifier.ts` — ComplexityClassifier (regex-based DIRECT/BRAIN_ONLY/FULL_PIPELINE)
- `core/janitor/auditor.ts` — Janitor V2 (structural checks, ForgeRecord output)
- `brain/bridge.py` — 5-channel Bridge relay (Telegram → Email → Discord → Slack → SMS)

### What throws NotImplementedError or returns stubs
- `core/keychain/manager.ts` — `loadMasterVault()` returns `{}`, `scanForLeaks()` always returns `true`
- `core/keychain/manager.ts` — missing methods: `provisionEnvironment()`, `revokeEnvironment()`, `getScopeKeys()`
- `core/memory_store/mempalace_adapter.ts` — missing `writeSummary()`, `audit()`, wrong `readContext()` signature
- `core/brain/planner.ts` — `BrainPlanner.plan()` throws
- `core/brain/prompt_builder.ts` — file reads work, template injection works (this one is mostly complete)
- `core/clones/lifecycle/spawner.ts` — `createWorktree()` throws
- `core/clones/lifecycle/runner.ts` — `runSetup()`, `runRepomix()`, `launchClause()` all throw
- `core/clones/lifecycle/teardown.ts` — `mergeWorktree()`, `removeWorktree()`, `pruneBranch()` all throw
- `core/user_agent/agent.ts` — `triggerFullPipeline()` returns placeholder string

### Compile-blocking bugs (nothing builds until these are fixed)
1. `MissionBrief` defined in both `manager.ts` (4 fields) and `planner.ts` (10 fields) — incompatible
2. `clone_worker.ts` calls `keychain.provisionEnvironment()` — method doesn't exist
3. `clone_worker.ts` calls `keychain.revokeEnvironment()` — method doesn't exist
4. `brain/dispatcher.ts` calls `keychain.getScopeKeys()` — method doesn't exist
5. `mempalace_adapter.ts` missing `writeSummary()` + `audit()` — interface not satisfied
6. `mempalace_adapter.ts` `readContext(tier: string)` — should be `readContext(tier: MemoryTier)`

### Structural issues to fix alongside Phase 0
- `core/clones/lifecycle/spawner.ts` has leftover `teardownWorktree()` (duplicate of teardown.ts) — delete it
- `core/brain/dispatcher.ts` name clashes with `brain/dispatcher.py` — rename to `router.ts`
- `brain/dispatcher.py` paths are wrong — see Phase 1 in build plan for correct values

---

## Execution Order (Non-Negotiable)

### Phase 0 first — nothing else compiles
Run `npx tsc --noEmit` after each fix to verify. All 6 compile errors must be gone before Phase 1.

### Phase sequence
```
Phase 0 (Day 1-2):   Fix 8 compile errors → tsc --noEmit exits 0
Phase 1 (Week 1):    Fix dispatcher.py paths + add Janitor integration + pytest suite
Phase 2 (Week 2):    loadMasterVault() MVP + scanForLeaks() with patterns.yaml
Phase 3 (Weeks 3-4): Clone lifecycle (spawner + runner + teardown) + e2e test
Phase 4 (Weeks 5-6): BrainPlanner.plan() + triggerFullPipeline() writes to inbox
                     → FIRST AUTONOMOUS LOOP
```

Do not skip phases. Phase 2 depends on Phase 0 compile fixes. Phase 3 depends on Phase 2 credentials. Phase 4 depends on Phase 3 worktrees.

---

## Key Design Rules (Do Not Violate)

1. **Brain never executes.** `BrainPlanner` plans and writes to inbox. It does not spawn processes, call APIs for action, or touch files directly.

2. **Credentials never touch disk at rest.** `provisionEnvironment()` writes a temporary `.env` to the worktree. `revokeEnvironment()` must delete it in a `finally` block — even if the clone crashes.

3. **TS writes, Python reads.** `core/user_agent/agent.ts` writes `brain/inbox/task-{id}.json`. `brain/dispatcher.py` reads it. They never call each other directly. The inbox directory is the API contract.

4. **Janitor runs after every clone.** The `NOTE/SUGGEST/BLOCK` directive system is not optional. `dispatcher.py` must call `janitor_evaluate()` on every handshake. `NOTE` → merge, `SUGGEST` → re-queue with feedback, `BLOCK` → escalate + broadcast via Bridge.

5. **ALL output goes via Bridge.** `brain/bridge.py` is the only exit for user-facing messages. Import `get_bridge()` and use `bridge.send()` for completions, `bridge.broadcast()` for BLOCK/security.

6. **Teardown always runs.** `CloneTeardown.teardown()` must be called in a `finally` block in `CloneWorker.execute()`. Orphaned worktrees fill disk. This is non-negotiable.

---

## Test Commands

Set up test infrastructure first (one-time):
```bash
npm install --save-dev jest ts-jest @types/jest
source venv/bin/activate && pip install pytest
mkdir -p test
```

Run after each phase:
```bash
# TypeScript compile check
npx tsc --noEmit

# Unit tests
npx jest test/ --verbose
python -m pytest test/test_dispatcher.py -v

# Dispatcher smoke test (Phase 1+)
python brain/dispatcher.py dry brain/inbox/test-001.json

# Integration test (Phase 3+)
python brain/dispatcher.py watch &
# drop task → check brain/completed/
```

---

## Files You Will Modify

### Phase 0
- `core/keychain/manager.ts` — delete local MissionBrief, add 3 methods, fix loadMasterVault stub
- `core/memory_store/mempalace_adapter.ts` — add writeSummary(), audit(), fix readContext signature
- `core/brain/dispatcher.ts` → rename to `core/brain/router.ts`, update imports
- `core/clones/lifecycle/spawner.ts` — delete teardownWorktree(), fix stale header

### Phase 1
- `brain/dispatcher.py` — fix 5 path constants, add extract_handshake(), janitor_evaluate(), write_forge_record(), notify_human(), MAX_RETRIES

### Phase 2
- `core/keychain/manager.ts` — implement loadMasterVault() (read .env), implement scanForLeaks() (patterns.yaml)

### Phase 3
- `core/clones/lifecycle/spawner.ts` — implement createWorktree()
- `core/clones/lifecycle/runner.ts` — implement runSetup(), runRepomix(), launchClause()
- `core/clones/lifecycle/teardown.ts` — implement mergeWorktree(), removeWorktree(), pruneBranch()

### Phase 4
- `core/brain/planner.ts` — implement BrainPlanner.plan() using Haiku API
- `core/user_agent/agent.ts` — implement triggerFullPipeline() writing to brain/inbox/

---

## Environment

- **Repo**: `/tmp/agent4wiki` (local) → `github.com/diamondcrusher42/Agent4wiki`
- **Node**: KEVIN (WSL2, DESKTOP-RBUGS84)
- **Python venv**: `~/workspace/venv` — always use this, never system pip
- **Git identity**: `diamondcrusher42` / `61275519+diamondcrusher42@users.noreply.github.com`
- **Credentials**: in `/home/claudebot/workspace/.env` (ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, AGENTMAIL_API_KEY, etc.)
- **AGENT_BASE_DIR**: set this to `/tmp/agent4wiki` when testing locally

---

## Commit Convention

```
feat(phase-0): fix compile errors — MissionBrief, missing methods, MemPalaceAdapter
feat(phase-1): dispatcher paths + Janitor integration + pytest suite
feat(phase-2): loadMasterVault + scanForLeaks — credential system MVP
feat(phase-3): clone lifecycle — spawner + runner + teardown
feat(phase-4): BrainPlanner + triggerFullPipeline — first autonomous loop
```

One commit per phase minimum. Include test results in commit message body.

---

## Definition of Done

Phase 4 is complete when this sequence runs end-to-end without manual intervention:

```
1. UserAgent.handleUserInput("Write a Python hello world script")
   → classifier returns FULL_PIPELINE
   → BrainPlanner.plan() returns MissionBrief (Haiku API call)
   → triggerFullPipeline() writes brain/inbox/task-{id}.json

2. brain/dispatcher.py watch (running in background)
   → picks up task-{id}.json
   → spawns git worktree in state/worktrees/task-{id}/
   → provisions .env with ANTHROPIC_API_KEY
   → launches claude --print with assembled prompt
   → clone executes, outputs JSON handshake
   → revokeEnvironment() deletes .env

3. janitor_evaluate(handshake)
   → returns NOTE (assuming clean execution)
   → write_forge_record() to forge/events.jsonl
   → notify_human() → bridge.send() → Telegram notification

4. Verify:
   - brain/completed/task-{id}.json exists
   - state/worktrees/ is empty (cleaned up)
   - forge/events.jsonl has the ForgeRecord entry
   - Telegram received the notification
```

Good luck. Start with Phase 0.
