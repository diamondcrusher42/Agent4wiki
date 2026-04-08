# Review — Gemini Code Review: opus-build Branch

> Date: 2026-04-08
> Source: `raw/gemini-code-branch-review68.md`
> Reviewer: Gemini
> Scope: All Opus-built code — Phases 0-4 (5 commits, 57 tests)
> Verdict: "90% solution" — 2 real findings patched, 1 false positive, 1 known TODO

## Summary

Gemini reviewed the `opus-build` branch (full repomix). Overall verdict: Opus correctly scaffolded the MemoryStore interface, KeychainManager logic, and clone lifecycle — but LLM-generated security checks had two vulnerabilities. Both patched and pushed. 14/14 keychain tests pass after fixes.

## Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Path traversal via `startsWith()` in scanForLeaks | Critical | ✅ Fixed — `path.relative()` |
| 2 | `.env` missing `0o600` permissions | High | ✅ FALSE POSITIVE — Opus already used `0o600` |
| 3 | Entropy threshold `> 8` causes false-positive leak alerts | Medium | ✅ Fixed — changed to `> 16` |
| 4 | MCP transport layer: all stubs, no `StdioClientTransport` | High | ⏳ Known TODO — Phase 1 scope |

## Finding 1 — Path Traversal (Critical) ✅ Fixed

`startsWith()` path check in `scanForLeaks` allows a file in `/state/worktrees/clone-12` to pass the `/state/worktrees/clone-1` sandbox boundary check.

Fix: `path.relative()` — if result starts with `..` or is absolute, reject.

```typescript
// Before (vulnerable)
if (!resolved.startsWith(path.resolve(worktreePath))) continue;

// After (safe)
const rel = path.relative(path.resolve(worktreePath), resolved);
if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
```

File: `core/keychain/manager.ts:183`

## Finding 2 — .env Permissions ✅ False Positive

Gemini predicted Opus would omit file permissions. Opus wrote `{ mode: 0o600 }` correctly. No action needed.

## Finding 3 — Entropy Threshold ✅ Fixed

`filter(v => v.length > 8)` triggers false alarms on short vault values (`DEBUG=true`, `PORT=3000`, etc.) — circuit-breaks the Janitor on every clean clone run. Changed to `> 16`: covers all real tokens (sk-ant-, sk-, AKIA, sk_live_) while ignoring config values.

File: `core/keychain/manager.ts:174`

## Finding 4 — MCP Transport ⏳ Known TODO

`mempalace_adapter.ts` has all methods stubbed (`// TODO: Initialize MCP client`). Build brief scope was Phase 1 = interface, not full Python bridge. Wire `StdioClientTransport` when MemPalace MCP server is confirmed running:

```typescript
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const transport = new StdioClientTransport({ command: "python3", args: ["-m", "mempalace", "--mcp"] });
await this.client.connect(transport);
```

## Context Note

Gemini suggested "proceed to Phase 3" — Opus already built all 5 phases. Gemini reviewed the repomix without build history context. The code is more complete than Gemini assumed.

## Commit

`3650a3f` on `opus-build` — both patches applied, 57 tests green.
