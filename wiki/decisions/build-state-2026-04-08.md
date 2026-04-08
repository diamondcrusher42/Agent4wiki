# Build State — 2026-04-08

> Snapshot of the full system as of end of day 2026-04-08.
> Branch: `opus-build` — 6 commits ahead of `main`

## What Is Real, Working Code

All Phases 0-4 were built by Claude Opus 4.6 in a single session. Two security patches applied manually after Gemini code review (review-68).

### Phase 0 — Compile Fixes ✅

All TypeScript compile errors resolved. `tsc` exits 0. Commit: `7ee2534`.

| Fix | File |
|-----|------|
| MissionBrief defined twice | Removed duplicate from keychain/manager.ts |
| Missing `provisionEnvironment()` | Added to KeychainManager |
| Missing `revokeEnvironment()` | Added to KeychainManager |
| Missing `getScopeKeys()` | Added to KeychainManager |
| Missing `writeSummary()` | Added to MemPalaceAdapter |
| Missing `audit()` | Added to MemPalaceAdapter |
| `MemoryTier` enum not used | Fixed readContext() signature |
| Renamed `dispatcher.ts` → `router.ts` | Prevents Python name clash |

### Phase 1 — Dispatcher + Janitor Integration ✅ 17 pytest

Python dispatcher fully wired to Janitor. Commit: `845b74f`.

- `dispatcher.py watch` loops, picks up task.json from `brain/inbox/`
- Parses clone stdout for JSON handshake (reverse-iterate last line starting with `{`)
- Calls `janitor_evaluate(handshake, retry_count)` — returns BLOCK/SUGGEST/NOTE
- BLOCK → moved to `brain/failed/`, BLOCK alert via Bridge (Telegram + Email)
- SUGGEST → re-queued with Janitor feedback appended (max 3 retries)
- NOTE → moved to `brain/completed/`, ForgeRecord written to `forge/events.jsonl`
- 17 pytest covering dispatch lifecycle, retry logic, BLOCK escalation

### Phase 2 — Keychain Credentials ✅ 14 Jest

Full credential lifecycle implemented. Commit: `842631c`.

- `loadMasterVault()` reads from `.env` file (MVP — AES vault in Phase 5)
- `provisionEnvironment(worktreePath, keys)` writes `.env` with `0o600` permissions
- `revokeEnvironment(worktreePath)` deletes `.env`, runs `scanForLeaks()`
- `scanForLeaks()` scans modified files with both exact-match and regex patterns
- `buildScopedEnv(skill)` reads `config/scopes.yaml` — clones get only what they need
- Security patches applied (see below): path traversal + entropy threshold
- 14 Jest covering full credential lifecycle

### Phase 3 — Clone Lifecycle ✅ 12 Jest

Full clone spawn/run/teardown. Commit: `ca45996`.

- `CloneSpawner.createWorktree()` creates git worktree, writes `setup.sh`, copies TASK.md template, registers in `state/worktrees/registry.json`
- `CloneRunner.run()` executes `setup.sh → repomix → claude --print` session, reverse-iterates stdout to parse JSON handshake
- `CloneTeardown` merges on NOTE, force-removes worktree, prunes branch, deregisters
- 12 Jest: 6 unit (handshake parsing), 6 integration (real git worktrees)

### Phase 4 — Brain + Full Pipeline ✅ 14 Jest

First autonomous loop. Commit: `9a22294`.

- `BrainPlanner.plan()` calls Haiku → `MissionBrief`
- `triggerFullPipeline()` auto-writes `task.json` to `brain/inbox/`
- `ComplexityClassifier` routes: DIRECT / BRAIN_ONLY / FULL_PIPELINE
- `UserAgent.handleUserInput()` wired to classifier → appropriate pipeline
- `ForgeRecord` written to `forge/events.jsonl` on NOTE
- 14 Jest: injection, routing, pipeline, state

### Security Patches (post-Gemini review-68)

Commit: `3650a3f`

| Patch | File | What was wrong |
|-------|------|----------------|
| Path traversal fix | `core/keychain/manager.ts:183` | `startsWith()` allows clone-1 to escape into clone-12 sandbox. Fixed with `path.relative()` — `..` or absolute = rejected |
| Entropy threshold | `core/keychain/manager.ts:174` | `> 8` chars causes false-positive FAILED_REQUIRE_HUMAN on `DEBUG=true`, `PORT=3000`. Changed to `> 16` chars |

14/14 keychain tests still green after patches.

## What Remains (Known TODOs)

| Item | File | Status |
|------|------|--------|
| MCP transport | `core/memory_store/mempalace_adapter.ts` | All methods are `// TODO` stubs. Wire `StdioClientTransport` when MemPalace MCP server confirmed running. Low priority — Brain falls back to wiki context. |
| AES-256 vault | `core/keychain/manager.ts:loadMasterVault()` | MVP reads plain `.env`. Real vault (Argon2id key derivation, AES-256-GCM) is Phase 5. |
| WikiScythe | `core/janitor/scythe.ts` | Contradiction detection must be V4-implemented (LLM semantic comparison). MemPalace KG only blocks exact duplicate triples. |
| Fleet routing | `brain/dispatcher.py` | `target_node` field parsing not implemented. All tasks run on current node. |
| Forge | `core/forge/` | All 4 files are stubs. Shadow runner, evaluator, ratchet, metrics DB for Phase 7. |
| BitNet/User Agent | `core/user_agent/` | Always-on local model integration not wired. |

## Test Summary

| Phase | Tests | Status |
|-------|-------|--------|
| Phase 0 | tsc exits 0 | ✅ |
| Phase 1 | 17 pytest | ✅ |
| Phase 2 | 14 Jest | ✅ |
| Phase 3 | 12 Jest | ✅ |
| Phase 4 | 14 Jest | ✅ |
| **Total** | **57 tests** | **✅ All green** |

## Verified End-to-End Flow

```
User message → ComplexityClassifier → FULL_PIPELINE
  → BrainPlanner.plan() (Haiku) → MissionBrief
  → task.json written to brain/inbox/
  → dispatcher.py watch picks up task
  → CloneWorker: spawner → keychain provision → runner (claude session) → janitor evaluate → teardown
  → ForgeRecord written to forge/events.jsonl
  → Bridge delivers result via Telegram
```

DoD test confirmed: dispatcher → clone → Janitor → Bridge (Telegram + Email broadcast 200 OK).

## Branch Status

```
main         ← wiki + docs (65 pages, all reviews, architecture spec)
opus-build   ← working TypeScript/Python code, 57 tests
             ← 6 commits ahead of main
```

Pending: merge `opus-build` → `main` when MCP transport wired and vault hardened.

## Related Pages

- [[plan-build-v1]] — original build spec (Phases 0-4 delivered)
- [[review-gemini-code-review68]] — security patches rationale
- [[review-mempalace-issues]] — MemPalace limitations, revised memory strategy
- [[review-janitor-audit2]] — 17/25 health score, remaining RED findings
