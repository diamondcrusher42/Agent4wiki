# Build State — 2026-04-08 — After Plan-build-v4

> Branch: `opus-build` @ commit `af40e52`
> Date: 2026-04-08
> Tests: 126 total (96 Jest + 30 pytest), all green. TSC clean.

## What's done

### Phase A — High Impact
- A1: `core/routing/classifier.ts` — 2-pass classifier. Hardcoded DIRECT patterns (greetings/acks/yes-no) + hardcoded phrase-level FULL_PIPELINE patterns (no substring). Everything else → Haiku (10 tokens). Old `fullPipelineKeywords` list deleted. `classify()` is now async.
- A2: `core/janitor/config/heuristics.json` (new) — canonical `warn_keywords` shared between `auditor.ts` and `dispatcher.py`. Both load from file. "todo:" + "temporary" + 6 others unified.
- A3: `core/forge/metrics_db.ts` — `getTotalTokensThisCycle()`. `core/forge/shadow_runner.ts` — budget cap (50k tokens default) before launching variant B.

### Phase B — Reliability
- B1: `active_worktrees` pruned after task completes. Startup cleanup removes IDs missing from registry.
- B2: `core/brain/planner.ts` — Anthropic client moved to constructor, optional injection for testing.
- B3: `triggerFullPipeline()` + `routeToBrain()` wrapped in try/catch, return user-facing error string on failure.

### Phase C — Quality
- C1: `core/keychain/manager.ts` — `loadMasterVault()` + `unlockVault()` both call `addSecret()` for every loaded secret. Length floor lowered 17 → 8 chars.
- C2: `core/user_agent/agent.ts` — `executeDirect()` loads Soul.md + passes last 10 history entries. `routeToBrain()` runs Haiku with plan reasoning, returns real answer (not echoed objective). `conversationHistory` typed (no more `any[]`).
- C3: `CloneResult` interface — `tokensConsumed: number` + `filesModified: string[]` added, populated from handshake. `(result as any)` cast removed from `shadow_runner.ts`.
- C4: `core/janitor/scythe.ts` — `runFullAuditCycle()` writes to `wiki/archive-queue.md` instead of auto-archiving. `processArchiveQueue()` only moves human-approved `[x]` items.

## Files changed (16)
`core/routing/classifier.ts`, `core/user_agent/agent.ts`, `core/brain/planner.ts`, `core/janitor/auditor.ts`, `core/janitor/config/heuristics.json` (new), `brain/dispatcher.py`, `core/forge/metrics_db.ts`, `core/forge/shadow_runner.ts`, `core/clones/clone_worker.ts`, `core/keychain/manager.ts`, `core/janitor/scythe.ts`, `test/phase4.test.ts`, `test/forge.test.ts`, `test/keychain.test.ts`, `test/scythe.test.ts`, `test/test_dispatcher.py`

## Remaining TODOs (plan-build-v5 candidates)
- Integration test: full clone lifecycle spawner → runner → janitor → teardown (no mocks)
- `setup.sh` npm/pip caching (--prefer-offline, shared cache dir)
- `spawner.ts` cloneId validation before shell execution
- `loadWikiContext()` 500-token budget enforcement
- `dispatcher.py` decomposition (33KB monolith → 5-6 modules)
- `promote()` event type filtering (only use `evaluation` events)
- Confidence field (hardcoded 0.8) — wire or remove
- Integration test: Haiku call in classifier with real/mocked API
- Bridge cascade test: Telegram down → fallback to email
