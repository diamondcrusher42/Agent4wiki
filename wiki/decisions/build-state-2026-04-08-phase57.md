# Build State — 2026-04-08 (Phase 5-7 Complete)

> Snapshot after Opus Phase 5-7 implementation.
> Branch: `opus-build` — commit `2960b4d`
> Previous state: [[build-state-2026-04-08]] (Phases 0-4, 57 tests)

## What Changed in This Build

All remaining TODOs from the Phase 0-4 state are now implemented.

### Phase 5A — AES-256 Vault ✅ +5 Jest

File: `core/keychain/manager.ts`

| Method | What it does |
|--------|-------------|
| `initVault(password, secrets)` | Generates salt, derives key via scrypt (N=16384), encrypts as AES-256-GCM, writes `vault.enc` + `vault.salt` |
| `loadMasterVault()` | Decrypts vault.enc when present; falls back to `.env` in dev |
| `addSecret(key, value)` | Decrypt/add/re-encrypt. Secrets <17 chars go to `exactMatchSecrets[]` bypass array |

Security: `VAULT_MASTER_PASSWORD` read from `process.env` only — never from disk. Wrong password throws on decrypt.

### Phase 5B — MCP Transport ✅ +7 Jest

File: `core/memory_store/mempalace_adapter.ts`

All 6 methods fully wired via `@modelcontextprotocol/sdk` (StdioClientTransport + Client).

| Method | MCP Tool |
|--------|---------|
| `write()` | `add_memory` |
| `writeSummary()` | `add_memory` (tagged summary) |
| `readContext(L0_WAKE)` | `get_aaak_summary` |
| `readContext(other)` | `search_vault` |
| `search()` | `search_vault` |
| `delete()` | `delete_memory` |
| `audit()` | `audit_vault` |

`validateTools()` called on `connect()` — lists all MCP tools, logs any expected tool missing by name.
All methods return safe fallbacks (empty string / empty array / false) when client is null.

### Phase 6A — WikiScythe ✅ +4 Jest

File: `core/janitor/scythe.ts`

- `pruneStaleKnowledge()`: contradictions → `state/janitor/audit-board.md`, orphans → `state/janitor/cold-queue.json`
- `runFullAuditCycle()`: wiki-tiering (git mtime, 90d → `wiki/archive/`), cycle summary appended to audit-board, health score delta in `state/janitor/health.json` (score = 25 - contradictions×3 - orphans×1 - stale×0.5)

### Phase 6B — Fleet Routing ✅ +6 pytest

File: `brain/dispatcher.py`

- `load_fleet_registry()` — reads `state/fleet/registry.json`
- `is_local_node(target)` — matches hostname or "local"
- `dispatch_remote(task, node)` — SSH writes task.json to remote inbox, polls for result (10 min timeout)
- Wired into `process_task_file()`: if `target_node` set and not local → SSH dispatch; fallback to local if node not in registry

### Phase 7 — Forge Core ✅ +5 Jest

| File | What it does |
|------|-------------|
| `core/forge/metrics_db.ts` | SQLite via better-sqlite3. Tables: `metrics` (per-run stats), `ab_outcomes` (WIN_A/WIN_B/TIE history). `getWinStreak()` counts consecutive B wins |
| `core/forge/shadow_runner.ts` | Deep-clones MissionBrief, overrides templatePath, runs via CloneWorker (full lifecycle). Never merges even on NOTE. Writes to `forge/events.jsonl` |
| `core/forge/evaluator.ts` | Sonnet-as-judge. Prompt compares A vs B on Janitor directive, tokens, duration. Returns WIN_A/WIN_B/TIE + reasoning. Logs to `forge/events.jsonl` |
| `core/forge/ratchet.ts` | 5-win threshold. On promote: git tag (rollback point), copy variant_b → production, Janitor veto check, auto-revert on BLOCK, log to wiki/log.md |

## Full Test Summary

| Phase | Tests | Status |
|-------|-------|--------|
| Phase 0 | tsc exits 0 | ✅ |
| Phase 1 | 17 pytest | ✅ |
| Phase 2 | 14 Jest | ✅ |
| Phase 3 | 12 Jest | ✅ |
| Phase 4 | 14 Jest | ✅ |
| Phase 5A | +5 Jest | ✅ |
| Phase 5B | +7 Jest | ✅ |
| Phase 6A | +4 Jest | ✅ |
| Phase 6B | +6 pytest | ✅ |
| Phase 7 | +5 Jest | ✅ |
| **Total** | **84 tests** | **✅ All green** |

## Branch Status

```
main         ← wiki + docs (78 pages)
opus-build   ← complete TypeScript/Python engine, 84 tests
             ← commit 2960b4d (Phases 5-7)
             ← ready for merge when AES vault tested in production
```

## Known Remaining Items

| Item | Status |
|------|--------|
| BitNet/local model integration | Not started (Phase 8+) |
| AES vault production test | Needs real VAULT_MASTER_PASSWORD in .env |
| Fleet registry population | state/fleet/registry.json is empty (manual step) |
| MemPalace MCP tool names | May need adjustment on first live run (validateTools() will log mismatches) |

## Related Pages

- [[build-state-2026-04-08]] — Phase 0-4 state (57 tests)
- [[plan-build-v2]] — the build brief Opus followed
- [[review-gemini-code-review68]] — prior security patches
