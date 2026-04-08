# Build State — 2026-04-08 — After Plan-build-v7

> Branch: `opus-build` @ commit (latest after v7)
> Date: 2026-04-08
> Tests: 174 total (138 Jest + 36 pytest), all green. TSC clean.

## What's done

### Phase A — Critical Security
- A1: `brain/dispatcher.py` — `build_clone_env()` strips VAULT_MASTER_PASSWORD + 3 others. Python clones no longer inherit vault password.
- A2: `core/keychain/manager.ts` — `getModifiedFiles()` uses `git status --porcelain`. Untracked files now detected.
- A3: `core/janitor/auditor.ts` — `tests_passed === false` (not `!== true`). `undefined` no longer false-positives as SUGGEST.
- A4: Same file — `ScanResult` interface with `largeFilesSkipped: string[]`. Large files flagged in janitor_notes instead of silently skipped.

### Phase B — Security Hardening
- B1: `core/clones/clone_worker.ts` — `buildCloneEnv()` allowlist: only PATH, HOME, NODE_ENV, TMPDIR, LANG, LC_ALL + scoped keys. Host env vars no longer leak.
- B2: `core/clones/lifecycle/spawner.ts` — Generated `setup.sh` template includes `--ignore-scripts`.

### Phase C — Quality
- C1: `core/config/clone_config.json` (new) — `maxRetries: 3`, `timeoutMs: 300000`, `watchdogMaxAgeMinutes: 30`. Both TS and Python read from it.
- C2: `core/user_agent/agent.ts` — `routeToBrain()` injects wiki context via `promptBuilder.loadWikiContext()`. `executeDirect()` stays lightweight.
- C3: Same file — `triggerFullPipeline()` returns clarification request when `confidence < 0.5`.

## Files changed (12)
`brain/dispatcher.py`, `core/brain/prompt_builder.ts`, `core/clones/clone_worker.ts`, `core/clones/lifecycle/spawner.ts`, `core/config/clone_config.json` (new), `core/janitor/auditor.ts`, `core/keychain/manager.ts`, `core/user_agent/agent.ts`, `test/clone-lifecycle.test.ts`, `test/keychain.test.ts`, `test/phase4.test.ts`, `test/test_dispatcher.py`

## Cumulative test progress
| Version | Tests | Key wins |
|---------|-------|----------|
| Phase 5-7 baseline | 84 | AES vault, MCP, WikiScythe, fleet, Forge |
| v3 | 103 | SSH fix, env strip, noLeaks, handshake, yaml, watchdog |
| v4 | 126 | 2-pass classifier, Janitor unified, cost cap, executeDirect |
| v5 | 140 | Forge budget real, duplicate msg, spawner injection, wiki cap |
| v6 | 157 | Registry fix, OOM guard, dispatcher injection, scythe, soul TTL |
| v7 | 174 | Python vault leak, git status scan, env allowlist, confidence gate |

## Remaining TODOs (plan-build-v8 candidates)
- Integration test: full clone lifecycle end-to-end (no mocks)
- dispatcher.py monolith decomposition
- TS/Python Janitor divergence (tests_passed:false different verdict — partially fixed A3)
- ForgeEvaluator fragile string parsing ("WIN_A" anywhere in response)
- Git worktree orphan branches after failed teardown
- JSONL concurrency corruption in Forge events
- Brittle handshake regex fallback (dispatcher.py nested JSON)
- Conversation history not persisted across restarts
- buildCloneEnv deny-list for SENSITIVE_ENV_KEYS in Python path (now fixed A1) — verify Python tests_passed logic matches TS
