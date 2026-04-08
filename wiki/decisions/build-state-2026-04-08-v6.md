# Build State — 2026-04-08 — After Plan-build-v6

> Branch: `opus-build` @ commit `d9ac4ba`
> Date: 2026-04-08
> Tests: 157 total (125 Jest + 32 pytest), all green. TSC clean.

## What's done

### Phase A — Critical Silent Bugs
- A1: `core/user_agent/agent.ts` — `cleanupStaleWorktrees()` parses registry.json as `Record<string, ...>` with `Object.keys()`. Active worktrees no longer wiped on every startup.
- A2: `brain/dispatcher.py` — `create_worktree()` calls `validate_task_id()` at entry. Shell injection via task IDs blocked.
- A3: `core/keychain/manager.ts` — `scanForLeaks()` checks file size (skip >1MB) and extension (skip binaries) before `readFileSync`. OOM crash + silent bypass eliminated.

### Phase B — Security
- B1: `core/janitor/scythe.ts` — `getGitMtime()` uses `execFileSync` array form. No shell invoked — filePath injection impossible.
- B2: `setup.sh` — `npm install --ignore-scripts` added. Post-install scripts from compromised packages blocked.

### Phase C — Quality
- C1: `core/brain/planner.ts` — `parseMissionBrief()` helper: 3-tier extraction (strip fences → extract `{...}` → default brief). No crash on malformed Haiku JSON.
- C2: `core/user_agent/agent.ts` — `loadSoul()` 60s TTL. Soul.md edits live without restart.
- C3: Same file — `routeToBrain()` single Haiku call (Soul.md + history + prompt). Removed double call through planner. Halves BRAIN_ONLY latency and cost.

## Files changed (10)
`core/user_agent/agent.ts`, `brain/dispatcher.py`, `core/keychain/manager.ts`, `core/janitor/scythe.ts`, `core/brain/planner.ts`, `setup.sh`, `test/phase4.test.ts`, `test/keychain.test.ts`, `test/scythe.test.ts`, `test/test_dispatcher.py`

## Cumulative progress
| Version | Tests | Key wins |
|---------|-------|----------|
| Phase 5-7 baseline | 84 | AES vault, MCP, WikiScythe, fleet, Forge |
| v3 | 103 | SSH fix, env strip, noLeaks, handshake, yaml, watchdog |
| v4 | 126 | 2-pass classifier, Janitor unified, cost cap, executeDirect |
| v5 | 140 | Forge budget real, duplicate msg, spawner injection, wiki cap |
| v6 | 157 | Registry fix, OOM guard, dispatcher injection, scythe, soul TTL |

## Remaining TODOs (plan-build-v7 candidates)
- Integration test: full clone lifecycle end-to-end (no mocks)
- dispatcher.py monolith decomposition (33KB → modules)
- TS/Python Janitor divergence: tests_passed:false gives different verdicts
- Dispatcher stdout captures secrets to disk (completed/*.result.json)
- Registry race condition at MAX_CONCURRENT=3 (read-modify-write)
- ForgeEvaluator string parsing fragile ("WIN_A" anywhere in response)
- Bridge cascade test: Telegram down → fallback to email
- Forge evaluator: Haiku for obvious outcomes
- compressHistory() BitNet comment cleanup
- ThinkingResult.confidence dead field
