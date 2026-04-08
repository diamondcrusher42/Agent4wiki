# Build State — 2026-04-08 — After Plan-build-v8

> Branch: `opus-build` @ commit `96002ec` (latest after v8)
> Date: 2026-04-08
> Tests: 198 total (156 Jest + 42 pytest), all green. TSC clean.

## What's done

### Phase A — Critical Correctness
- A1: `brain/dispatcher.py` — `janitor_evaluate()` decision tree reordered to match `auditor.ts` exactly: `BLOCKED_IMPOSSIBLE` first → `tests_passed is False` → COMPLETED branch. Option B chosen (aligned Python tree, no ts-node dependency). Two existing tests updated to expect BLOCK where they previously expected SUGGEST for `tests_passed=False`.
- A2: `core/keychain/manager.ts` — `getModifiedFiles()` uses `flatMap` with status parsing: renames (`R`, `RM`) extract only the new filename after ` -> `.
- A3: `core/clones/clone_worker.ts` — `REQUIRED_ENV_KEYS` now includes `SHELL` and `USER`.
- A4: `core/keychain/manager.ts` — `scanForLeaks()` uses `realpathSync` + boundary check. Symlinks escaping worktree recorded as `SYMLINK_ESCAPE` in `largeFilesSkipped`.

### Phase B — Reliability
- B1: `brain/dispatcher.py` — `watch()` replaced sequential `process_task_file(tasks[0])` with `threading.Thread` pool respecting `MAX_CONCURRENT`. Dead threads pruned each iteration.
- B2: `core/clones/lifecycle/runner.ts` — `runSetup()` uses `execFileAsync('bash', [setupScript])` (array form) instead of `execAsync('bash "${setupScript}"')` (string interpolation, shell injection risk).
- B3: `core/config/clone_config.json` — Added `confidenceGateThreshold`, `brainWikiPages`, `maxWikiContextChars`. `agent.ts` reads from config, not hardcoded values. Raw confidence float removed from user-facing messages.

### Phase C — Quality
- C1: `core/clones/lifecycle/teardown.ts` — BLOCK verdict moves worktree to `state/worktrees/quarantine/<cloneId>-<timestamp>/` instead of deleting. `git worktree prune` cleans dangling refs. Fallback to normal removal if rename fails.
- C2: `core/brain/prompt_builder.ts` — Added `truncateAtLineBoundary()`. Wiki context excerpts now cut at last newline before 800-char limit (not mid-JSON or mid-code-fence).
- C3: `core/user_agent/agent.ts` — `compressHistory()` renamed `truncateHistory()` with `slice(-10)` and descriptive TODO comment. All call sites updated.

### Bonus
- `jest.config.js` — Added `testPathIgnorePatterns: ['/node_modules/', '/state/worktrees/']` to prevent Jest discovering test files inside quarantined worktrees.

## Files changed (~13)
`brain/dispatcher.py`, `core/clones/clone_worker.ts`, `core/clones/lifecycle/runner.ts`, `core/clones/lifecycle/teardown.ts`, `core/brain/prompt_builder.ts`, `core/config/clone_config.json`, `core/keychain/manager.ts`, `core/user_agent/agent.ts`, `jest.config.js`, + test files

## Commits (4)
- `79a430e` Phase A
- `70337a9` Phase B
- `a5f130c` Phase C
- `96002ec` Jest config fix (quarantine dirs)

## Cumulative test progress
| Version | Tests | Key wins |
|---------|-------|----------|
| Phase 5-7 baseline | 84 | AES vault, MCP, WikiScythe, fleet, Forge |
| v3 | 103 | SSH fix, env strip, noLeaks, handshake, yaml, watchdog |
| v4 | 126 | 2-pass classifier, Janitor unified, cost cap, executeDirect |
| v5 | 140 | Forge budget real, duplicate msg, spawner injection, wiki cap |
| v6 | 157 | Registry fix, OOM guard, dispatcher injection, scythe, soul TTL |
| v7 | 174 | Python vault leak, git status scan, env allowlist, confidence gate |
| **v8** | **198** | Janitor unified, rename parsing, SHELL/USER, symlink guard, watch concurrency, execFile, config externalization, quarantine mode, line-boundary truncation |

## Remaining TODOs (plan-build-v9 candidates)
- Integration test: full clone lifecycle end-to-end (no mocks)
- Docker/real sandbox isolation (--dangerously-skip-permissions is still present)
- data-scrubbing middleware before events.jsonl writes (PII in Forge logs)
- dispatcher.py monolith decomposition
- Git worktree orphan branches after failed teardown
- JSONL concurrency corruption in Forge events
- extract_handshake() regex false-positive for handshake-looking code in clone output
- ForgeEvaluator fragile string parsing ("WIN_A" anywhere in response)
- Conversation history not persisted across restarts
- ts-node CLI for Janitor (Option A) — deferred since Option B works but TS is still authoritative
