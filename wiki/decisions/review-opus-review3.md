# Review: Opus Review 3 — Janitor + Dispatcher Integration

> Source: raw/Opus-review3-janitor-dispatcher.md | Reviewer: Claude Opus

## What's Right

- Three-tier directive system (BLOCK/SUGGEST/NOTE) maps cleanly to red/yellow/green severity
- Circuit breaker (3 retries → human escalation) prevents infinite loops
- WikiScythe as separate class from Auditor — correct separation: code review is synchronous, wiki maintenance is async
- "Clone finishes → Keychain sweeps → Janitor audits → merge or block → Forge logs" — clearest production pipeline statement yet

## Issues Applied

### 1. detectsArchitecturalMess() — V2 upgrade

V1 keyword-matching ("hacky", "todo") was too naive. V2 adds structural checks that don't need an LLM:
- **Scope creep**: >5 files modified + notes mention "also fixed / while I was at it"
- **Missing tests**: source files added without test files + tests_passed ≠ true
- **Shared config edits**: tsconfig/package.json/CLAUDE.md/gitignore touched without explicit approval
- **Performance admission**: slow/timeout/O(n²) keywords in notes

Legacy semantic keywords retained but narrowed (hacky, tech debt, fragile, temporary).

Phase 7 upgrade path: replace with fast Haiku LLM call to evaluate note quality semantically.

> Applied to: `core/janitor/auditor.ts` — `detectStructuralIssue()` method

### 2. Forge logging — structured JSONL

Janitor was appending NOTE results to `wiki/log.md` (human-readable only). Forge needs machine-parseable data. Changed to write structured `ForgeRecord` to `forge/events.jsonl`:
```json
{
  "task_id": "...", "skill": "code", "directive": "NOTE",
  "janitor_notes": "...", "tokens_consumed": 12500, "duration_seconds": 47,
  "files_modified": ["src/auth.ts"], "timestamp": "2026-04-07T23:00:00Z"
}
```
The Forge pattern-matches this to detect slow clones, missing tests, recurring quality issues.

> Applied to: `core/janitor/auditor.ts` — `writeForgeRecord()` method + `forge/` directory

### 3. Dispatcher → Janitor integration

Missing integration: dispatcher was treating all results as COMPLETED or FAILED. Full lifecycle:
```
dispatcher.execute_task()
  → clone runs, produces handshake JSON in stdout
  → dispatcher extracts handshake
  → janitor.evaluateMission(handshake, retryCount)
  → BLOCK  → move to failed/, optionally re-queue with retryCount + 1
  → SUGGEST → re-queue with janitor_feedback injected into task objective
  → NOTE   → merge worktree, write to forge/events.jsonl
```

**TypeScript/Python tension:** Dispatcher is Python, Janitor is TypeScript. For MVP: dispatcher.py implements mirror Janitor logic inline (same priority order, same checks). TypeScript Janitor remains the source of truth for production. Migration path: expose Janitor as MCP server or ts-node subprocess.

> Documented as known limitation in `brain/dispatcher.py`

### 4. WikiScythe — three concrete operations

Skeleton upgraded with concrete implementation targets:
1. **Delete expired entries** — check `valid_until` metadata, call `memory.delete(id)`
2. **Contradiction detection** — delegate to MemPalace's built-in contradiction API (semantic, not string-matching)
3. **Orphan page detection** — regex scan of all `[[page-name]]` wikilinks across wiki/, find pages with zero inbound links

> Applied to: `core/janitor/scythe.ts` — implementation TODOs clarified

### 5. SUGGEST retry loop — documented

When Janitor issues SUGGEST: dispatcher takes original task JSON, appends `janitor_feedback` to the `objective` field, increments `retry_count`, drops back in `brain/inbox/`. Creates the feedback loop: clone tries → Janitor suggests → clone retries with guidance → Janitor re-evaluates (max 3 tries before circuit breaker fires).

> Documented in: [[concept-dispatcher]], [[segment-janitor]]
