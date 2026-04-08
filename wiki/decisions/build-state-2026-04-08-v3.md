# Build State — 2026-04-08 — After Plan-build-v3

> Branch: `opus-build` @ commit `3b5513e`
> Date: 2026-04-08
> Tests: 103 total (76 Jest + 27 pytest), all green

## What's done

### Phase A — Security
- A1: `dispatch_remote()` uses scp via temp file. `validate_task_id()` rejects non `^[\w-]+$`
- A2: `buildCloneEnv()` strips VAULT_MASTER_PASSWORD, ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID before spawning claude subprocess
- A3: `revokeEnvironment()` returning false → immediate BLOCK + `escalate_to_human: true`

### Phase B — Reliability
- B1: Runner writes `state/handshakes/{cloneId}.json` after parsing stdout. Dispatcher `read_handshake_file()` reads+deletes, falls back to stdout
- B2: `js-yaml` replaces hand-rolled YAML parsers in `manager.ts`. Fixed `patterns.yaml` single-quote escaping
- B3: `getAllFilesRecursive()` traverses subdirs (skips `.` and `node_modules`)
- B3b: `resolveWikiPage()` uses `findFileRecursive()` — finds pages in `decisions/`, `segments/`, `concepts/` etc.
- B4: New `core/clones/watchdog.ts` — stale worktree cleanup, force-deletes `.env` on teardown failure

### Phase C — Quality
- C1: `executeDirect()` calls Haiku API. `routeToBrain()` calls `planner.plan()` and returns reasoning
- C2: `conversationHistory` capped at 50 entries + TOKEN_FLUSH_THRESHOLD=4000 token estimate
- C3: `ShadowResult` includes `filesModified` + `codePreview` (git diff --stat, 500 chars). Ratchet reads real `forge/events.jsonl` instead of synthetic handshake

## Files changed (18)
`brain/dispatcher.py`, `core/brain/prompt_builder.ts`, `core/clones/clone_worker.ts`, `core/clones/lifecycle/runner.ts`, `core/clones/watchdog.ts` (new), `core/forge/evaluator.ts`, `core/forge/ratchet.ts`, `core/forge/shadow_runner.ts`, `core/keychain/config/patterns.yaml`, `core/keychain/manager.ts`, `core/user_agent/agent.ts`, `package.json`, `package-lock.json`, `test/clone-lifecycle.test.ts`, `test/forge.test.ts`, `test/keychain.test.ts`, `test/phase4.test.ts`, `test/test_dispatcher.py`

## Known TODOs (plan-build-v4)
- Unify TS/Python Janitor heuristics ("todo:" vs "temporary")
- 2-pass classifier (regex + Haiku for ambiguous inputs)
- Forge cost cap (max_shadow_budget_per_cycle)
- active_worktrees never pruned from state.json
- BrainPlanner Anthropic client singleton
- setup.sh npm/pip caching (--prefer-offline)
- WikiScythe auto-archive needs human confirmation gate
- scanForLeaks() short-secret bypass (17-char floor)
- triggerFullPipeline try/catch for API failures
