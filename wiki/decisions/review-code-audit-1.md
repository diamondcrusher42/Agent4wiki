# Code Audit 1 — Full Codebase Review

> Date: 2026-04-07 | Auditor: Claude Sonnet 4.6 | Scope: all TypeScript + Python source files

---

## 🔴 CRITICAL — Compile errors / security failures

### 1. KeychainManager missing `provisionEnvironment()` and `revokeEnvironment()`

`core/clones/clone_worker.ts:70-73` calls:
```typescript
await this.keychain.provisionEnvironment(handle.path, decision.requiredKeys);
await this.keychain.revokeEnvironment(handle.path);
```
Neither method exists on `KeychainManager` (`core/keychain/manager.ts`). The only public method is `executeCloneMission()`. TypeScript will not compile.

**Fix:** Add `provisionEnvironment(path, keys)` and `revokeEnvironment(path)` to `KeychainManager`, or change `CloneWorker` to call `executeCloneMission()`.

---

### 2. BrainDispatcher calls non-existent `getScopeKeys()`

`core/brain/dispatcher.ts:38`:
```typescript
const requiredKeys = await this.keychain.getScopeKeys(skill);
```
`KeychainManager` has no `getScopeKeys()` method. TypeScript compile error.

**Fix:** Add `getScopeKeys(skill: SkillType): Promise<string[]>` to `KeychainManager` — reads from `core/keychain/config/scopes.yaml`.

---

### 3. MemPalaceAdapter doesn't satisfy MemoryStore interface

`core/memory_store/mempalace_adapter.ts` implements `MemoryStore` but is missing:
- `writeSummary(digest: InteractionDigest): Promise<string>` — not implemented
- `audit(olderThan?: Date): Promise<AuditReport>` — not implemented

TypeScript will reject `implements MemoryStore` with "type is missing properties". Also: `readContext(tier: string)` uses raw string, but the interface requires `MemoryTier` enum.

**Fix:** Add both missing methods + change `tier: string` → `tier: MemoryTier`.

---

### 4. `loadMasterVault()` always returns `{}` — credentials always fail

`core/keychain/manager.ts:144`:
```typescript
return {}; // placeholder
```
`buildScopedEnv()` will throw `SECURITY HALT: Requested key X does not exist in vault` for every mission. The system cannot provision any credentials.

**Impact:** Every clone launch silently fails at credential injection before doing any work.

---

### 5. `scanForLeaks()` always returns `true` — security scanner disabled

`core/keychain/manager.ts:126`:
```typescript
return true; // Safe — no leaks (placeholder)
```
This creates false confidence. A clone that hardcodes `sk-ant-api03-...` in its output will pass the security check. The Janitor never sees FAILED_REQUIRE_HUMAN for credential leaks.

**Fix:** Implement the regex scan using `core/keychain/config/patterns.yaml` before this code ships anywhere near real credentials.

---

### 6. Duplicate `MissionBrief` interface — two incompatible shapes

Defined in two places with different fields:

| Field | `keychain/manager.ts` | `brain/planner.ts` |
|-------|-----------------------|--------------------|
| `task` | ✓ | ✗ (uses `objective`) |
| `worktreePath` | ✓ | ✗ |
| `id` | ✗ | ✓ |
| `skill` | ✗ | ✓ |
| `wikiContext` | ✗ | ✓ |
| `timeoutMinutes` | ✗ | ✓ |

`clone_worker.ts` imports from `planner.ts`. `CloneWorker.execute()` passes a `planner.MissionBrief` to `promptBuilder.build()` (which expects `planner.MissionBrief` ✓) but the Keychain's `executeCloneMission()` expects `keychain.MissionBrief`. They can never be passed to each other without conversion.

**Fix:** Delete `MissionBrief` from `keychain/manager.ts`. Create one canonical `MissionBrief` in `brain/planner.ts`. Refactor `KeychainManager` to accept `(requiredKeys, worktreePath)` params directly.

---

## 🟡 STRUCTURAL — Wrong architecture, will cause problems

### 7. `spawner.ts` has a leftover `teardownWorktree()` method

`core/clones/lifecycle/spawner.ts:47-52` has `teardownWorktree()`. This functionality was explicitly moved to `lifecycle/teardown.ts` (Gemini review 6). Now two classes own teardown. The one in spawner.ts is also a stub that throws, but its existence confuses ownership.

**Fix:** Delete `teardownWorktree()` from `spawner.ts`.

---

### 8. Stale file path in spawner.ts header

`core/clones/lifecycle/spawner.ts:1` still says `// core/clones/spawner.ts` — the pre-move path. Minor but will mislead anyone reading the file.

**Fix:** Update comment to `// core/clones/lifecycle/spawner.ts`.

---

### 9. Two dispatchers with the same name, different roles

`brain/dispatcher.py` = Python watch daemon (file poller, process launcher)
`core/brain/dispatcher.ts` = TypeScript routing logic (skill selector, scope resolver)

Both are named "dispatcher". They are different components. The Python one is infrastructure; the TypeScript one is a routing module. When someone says "the dispatcher", it's ambiguous.

**Fix:** Rename `core/brain/dispatcher.ts` → `core/brain/router.ts` (and class `BrainDispatcher` → `BrainRouter`). Update all imports. Document distinction in wiki.

---

### 10. Templates in three locations — no canonical source

1. `templates/code-clone-TASK.md` (repo root — the actual V2 template)
2. `core/clones/templates/` (directory with only README.md — no real templates)
3. `brain/dispatcher.py:55`: `TEMPLATES = BASE_DIR / "brain" / "templates"` (another ghost location)

`brain/dispatcher.py` will look for templates in a directory that doesn't exist and contains the wrong files. `core/brain/dispatcher.ts:37` looks in `core/clones/templates/<skill>_task.md` — also doesn't exist (only README.md there).

**Fix:** Move `templates/code-clone-TASK.md` → `core/clones/templates/code_task.md` now (don't defer to Phase 5 — the mismatch is already causing bugs). Update Python dispatcher path. Update TypeScript dispatcher template path.

---

### 11. `CloneWorker` retry limit duplicates `Janitor.maxRetries`

`clone_worker.ts:54`: `while (retries < 3)` hardcodes 3.
`janitor/auditor.ts:26`: `private maxRetries = 3` hardcodes 3.

They're both 3 now, but changing one without the other creates silent logic bugs. The circuit breaker in the Janitor fires at `>=3`, the while loop exits at `<3` — they coincide but for the wrong reason.

**Fix:** Export `MAX_RETRIES = 3` from a shared constants file. Both import it.

---

### 12. `brain/dispatcher.py` path assumptions don't match repo structure

Three hardcoded paths in Python dispatcher that reference non-existent directories:
- `SOUL_MD = BASE_DIR / "user-agent" / "profile" / "soul.md"` → actual: `wiki/Soul.md`
- `USER_STATE = BASE_DIR / "user-agent" / "state" / "state.json"` → actual: `state/user_agent/state.json`
- `TEMPLATES = BASE_DIR / "brain" / "templates"` → no such directory

The dispatcher will silently fall back to empty context when these files aren't found (or crash depending on the read-or-fail behavior). Soul.md won't be injected.

**Fix:** Align Python dispatcher paths with actual repo structure. Add to `.env.example`:
```
AGENT_BASE_DIR=/path/to/agent4wiki
```

---

### 13. `brain/dispatcher.py` has no Janitor integration — all results COMPLETED or FAILED

Confirmed by reading the code. After `launch_session()`, the dispatcher moves the task to `completed/` or `failed/` with no Janitor call. The BLOCK/SUGGEST/NOTE directive system is completely bypassed for the only actual dispatcher that runs.

**Fix (MVP):** Add `janitor_evaluate(handshake)` function to `dispatcher.py` mirroring the TypeScript Janitor logic. On SUGGEST: re-queue task with `janitor_feedback` appended. On BLOCK: move to failed, optionally re-queue.

---

### 14. `WikiScythe` is an orphan — never instantiated anywhere

`core/janitor/scythe.ts` defines `WikiScythe` which takes a `MemoryStore`. Nothing in the codebase instantiates it. It's not referenced from `auditor.ts`, `bin/agent4.ts`, or anywhere else.

**Fix:** Wire `WikiScythe` into the `audit` CLI command in `bin/agent4.ts`.

---

### 15. `events/` vs `forge/` — two event directories, inconsistent routing

- `brain/dispatcher.py` logs to `events/dispatcher.jsonl`
- `core/janitor/auditor.ts` writes ForgeRecord to `forge/events.jsonl`

Two different directories for events. The Forge needs to read both? Or one is the right place and one is wrong?

**Fix:** Pick one. Recommendation: `events/<component>.jsonl` for all structured event streams (`events/dispatcher.jsonl`, `events/forge.jsonl`, `events/janitor.jsonl`). The `forge/` directory is for Forge *outputs* (shadow results, promoted templates), not event logs.

---

## 🟢 WEAK — Won't break but needs attention before production

### 16. `MemoryTier` enum not used in adapter

`mempalace_adapter.ts:27` checks `if (tier === 'L0_WAKE')` — raw string comparison. Should be `if (tier === MemoryTier.L0_WAKE)`. The enum was specifically introduced to prevent silent typo failures.

---

### 17. `runner.ts` expects `promptPath` (file path) but `clone_worker.ts` passes assembled prompt string

`lifecycle/runner.ts` signature: `run(handle, promptPath: string, timeoutMs: number)`.
`clone_worker.ts:71`: passes `prompt` (the assembled string from `PromptBuilder.build()`).

The runner would try to `readFile(prompt)` — which is the full prompt string, not a path. This will fail at runtime.

**Fix:** Either `runner.ts` accepts the prompt string directly, or `PromptBuilder.build()` writes to a temp file and returns the path.

---

### 18. `bin/agent4.ts` imports `UserAgent` but never uses it

```typescript
import { UserAgent } from '../core/user_agent/agent';
```
Unused import. TypeScript strict mode will warn.

---

### 19. `MemPalaceAdapter.write()` ignores the `writeSummary()` / `InteractionDigest` schema

The adapter's `write()` calls `this.client.add({ text: content, meta: metadata })` — this works for raw writes. But there's no `writeSummary()` implementation, so the User Agent's interaction digests can't be stored. The schema enforced by `InteractionDigest` is lost.

---

### 20. `clone_worker.ts:89` passes `AuditDirective.BLOCK` to teardown for SUGGEST

When Janitor issues SUGGEST (retry without merging), the code calls:
```typescript
await this.teardown.teardown(handle, AuditDirective.BLOCK); // don't merge
```
This works because `teardown.ts` only merges on `NOTE`. But using `BLOCK` to mean "don't merge this SUGGEST retry" is semantically wrong. Future developers will be confused.

**Fix:** Add a `CleanupMode.DISCARD` option, or just pass a boolean `merge: false`.

---

## Summary Table

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | 🔴 | clone_worker.ts | Missing `provisionEnvironment` / `revokeEnvironment` on KeychainManager |
| 2 | 🔴 | brain/dispatcher.ts | Missing `getScopeKeys()` on KeychainManager |
| 3 | 🔴 | mempalace_adapter.ts | Missing `writeSummary()` and `audit()` — interface not satisfied |
| 4 | 🔴 | keychain/manager.ts | `loadMasterVault()` always returns `{}` — all clone launches fail |
| 5 | 🔴 | keychain/manager.ts | `scanForLeaks()` always returns `true` — security scanner disabled |
| 6 | 🔴 | planner.ts + manager.ts | Duplicate `MissionBrief` interface, incompatible shapes |
| 7 | 🟡 | lifecycle/spawner.ts | Leftover `teardownWorktree()` — duplicate of teardown.ts |
| 8 | 🟡 | lifecycle/spawner.ts | Stale file path in header comment |
| 9 | 🟡 | brain/dispatcher.ts | Name collision with Python dispatcher — rename to router.ts |
| 10 | 🟡 | multiple | Templates in 3 locations — none canonical |
| 11 | 🟡 | clone_worker.ts + auditor.ts | Duplicate retry limit — no shared constant |
| 12 | 🟡 | brain/dispatcher.py | Hardcoded paths don't match repo structure |
| 13 | 🟡 | brain/dispatcher.py | No Janitor integration — BLOCK/SUGGEST/NOTE bypassed |
| 14 | 🟡 | scythe.ts | WikiScythe never instantiated — orphan class |
| 15 | 🟡 | auditor.ts + dispatcher.py | Two event directories (events/ vs forge/) |
| 16 | 🟢 | mempalace_adapter.ts | MemoryTier enum not used — raw string comparison |
| 17 | 🟢 | clone_worker.ts + runner.ts | Prompt string vs file path mismatch |
| 18 | 🟢 | bin/agent4.ts | Unused import |
| 19 | 🟢 | mempalace_adapter.ts | `writeSummary()` / InteractionDigest schema not implemented |
| 20 | 🟢 | clone_worker.ts | Misleading use of AuditDirective.BLOCK for SUGGEST cleanup |

---

## Priority Fix Order

1. Issues 1, 2, 6 — fix the three compile-breaking type errors (KeychainManager API, MissionBrief)
2. Issue 3 — satisfy MemoryStore interface in adapter
3. Issues 4, 5 — implement vault loading + leak scanner before any credential is real
4. Issue 9 — rename TypeScript dispatcher → router to prevent naming confusion
5. Issue 10 — consolidate templates to one location
6. Issue 13 — add Janitor integration to Python dispatcher (the only one that actually runs)
7. Issues 7, 11, 12, 15 — structural cleanup

*See also: [[segment-janitor]], [[decision-typescript-python]], [[concept-dispatcher]]*
