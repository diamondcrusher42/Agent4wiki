# Build State — 2026-04-08 — After Plan-build-v5

> Branch: `opus-build` @ commit `83e6ba8`
> Date: 2026-04-08
> Tests: 140 total (110 Jest + 30 pytest), all green. TSC clean.

## What's done

### Phase A — Critical
- A1: `core/forge/metrics_db.ts` — `recordMetric()` added. `shadow_runner.ts` calls it after each shadow run. Budget cap now actually tracks spend.
- A2: `core/user_agent/agent.ts` — `executeDirect()` uses `.slice(-11, -1)` — current turn excluded from history slice, no duplicate message.
- A3: Same file — `routeToBrain()` injects last 10 conversation turns into messages array.

### Phase B — Security
- B1: `core/clones/lifecycle/spawner.ts` — `/^[\w-]+$/` validation on `cloneId` before `execSync`. Throws on shell metacharacters or path traversal.
- B2: `core/brain/prompt_builder.ts` — `loadWikiContext()` cumulative cap at `MAX_TOTAL_CHARS = 2000`. Breaks loop with warning when exceeded.

### Phase C — Quality
- C1: `core/forge/ratchet.ts` — `promote()` filters `events.jsonl` for `type === "evaluation"` only. Throws if none found.
- C2: `setup.sh` + `spawner.ts` — npm install now uses `--prefer-offline --no-audit --no-fund`.
- C3a: `core/keychain/manager.ts` — `exactMatchSecrets` changed from `string[]` to `Set<string>`. No duplicate scan entries.
- C3b: `brain/dispatcher.py` — heuristics.json file handle wrapped in `with open(...)`.

## Files changed (9)
`core/forge/shadow_runner.ts`, `core/forge/metrics_db.ts`, `core/user_agent/agent.ts`, `core/clones/lifecycle/spawner.ts`, `core/brain/prompt_builder.ts`, `core/forge/ratchet.ts`, `setup.sh`, `core/keychain/manager.ts`, `brain/dispatcher.py`

## Remaining TODOs (plan-build-v6 candidates)
- Integration test: full clone lifecycle end-to-end (no mocks)
- dispatcher.py monolith decomposition (33KB → 5-6 modules)
- loadSoul() TTL cache invalidation
- Classifier LRU cache for Haiku dedup
- routeToBrain() double API call (planner + answer → single call)
- ThinkingResult.confidence dead field removal
- processArchiveQueue() structured format (JSON vs markdown checkboxes)
- Watchdog respect task timeoutMinutes (currently hardcoded 30min)
- scanForLeaks() skip binary files
- Bridge cascade test: Telegram down → fallback to email
- Forge evaluator: use Haiku for obvious outcomes (one BLOCKED, one NOTE)
