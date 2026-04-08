# Gemini Code Review — opus-build Branch (Review 68)

> Date: 2026-04-08
> Reviewer: Gemini
> Scope: opus-build branch — Phases 0-4 (5 commits, 57 tests)
> Verdict: "90% solution" — 2 real security findings, 1 false positive, 1 known stub

## Summary

Opus produced solid boilerplate: MemoryStore interface, MemPalaceAdapter, KeychainManager logic all correctly scaffolded. Gemini's review focused on security blind spots in LLM-generated code.

## Findings

### Finding 1 — Path Traversal (Critical) ✅ FIXED

**Location:** `core/keychain/manager.ts:183` (scanForLeaks file loop)

**Flaw:** `startsWith()` check allows clone-1 path to bypass clone-12 sandbox:
```
/state/worktrees/clone-1  (allowed)
/state/worktrees/clone-12 (malicious — passes startsWith check)
```

**Fix applied:**
```typescript
const rel = path.relative(path.resolve(worktreePath), resolved);
if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
```

### Finding 2 — .env File Permissions (High) ✅ FALSE POSITIVE

**Gemini predicted:** `writeFileSync` without `0o600` mode.

**Actual code:** Opus already wrote `{ mode: 0o600 }` at line 64. Confirmed by code inspection.

### Finding 3 — Leak Scanner Entropy Threshold (Medium) ✅ FIXED

**Location:** `core/keychain/manager.ts:174`

**Flaw:** `filter(v => v.length > 8)` — short values like `DEBUG=true`, `PORT=3000` trigger false-positive FAILED_REQUIRE_HUMAN circuit breaks on normal clone output.

**Fix applied:** `filter(v => v.length > 16)` — covers all real API tokens (sk-ant-, sk-, AKIA, sk_live_).

### Finding 4 — MCP Transport Layer (Missing) ⏳ KNOWN TODO

**Location:** `core/memory_store/mempalace_adapter.ts` — all methods are `// TODO` stubs.

**Expected fix:**
```typescript
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const transport = new StdioClientTransport({ command: "python3", args: ["-m", "mempalace", "--mcp"] });
await this.client.connect(transport);
```

**Status:** Known scope gap from build brief. MemPalace adapter stubs are intentional — Phase 1 delivers the interface, not the full Python bridge. Wire when MemPalace MCP server is confirmed running locally.

## Gemini Context Note

Gemini's review suggested "proceed to Phase 3 (User Agent + Complexity Classifier)" — Opus already built all 5 phases (Phases 0-4). Gemini was reviewing from the repomix without full build history context.

## Test Results

14/14 keychain tests pass after both patches. All 57 tests (40 Jest + 17 pytest) still green.

## Commit

`3650a3f` — fix(security): path.relative() traversal guard + entropy threshold 8→16
