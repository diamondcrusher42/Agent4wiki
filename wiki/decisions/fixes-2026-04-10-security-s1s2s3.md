# Security Fixes 2026-04-10 — S1 Path Traversal, S2 Git Arg Injection, S3 Shell Interpolation

> Date: 2026-04-10
> Commit: `9ed3369`
> Branch: `main`
> Triggered by: Multi-reviewer code audit (Opus + Gemini external reviews of v4-activation-plan)

## Context

Following the Opus + Gemini reviews of the v4 codebase, three critical/high security vulnerabilities
were identified and confirmed by both reviewers. All mandatory fixes completed before testing begins.

## Fixes Applied

### S1 — Path Traversal in `brain/dispatcher.py` (Critical)

**Risk:** `assemble_context()` built wiki page paths from LLM-provided `page_name` values with zero
validation. A rogue or hallucinating Brain task requesting `../keychain/vault.enc` would read any
file relative to the wiki directory into LLM context.

**Fix:** Added `_sanitize_wiki_page_name()` function:
- Rejects any name containing `..`, `/`, or `\`
- Strips non-alphanumeric/underscore/hyphen characters
- Applied to both loops in `assemble_context()` (full context + compact context paths)
- Invalid names log a warning and are skipped (no crash)

### S2 — Git Argument Injection in `core/janitor/scythe.ts` (High)

**Risk:** `getGitMtime()` called `execFileSync('git', ['log', '--format=%ct', '-1', filePath])`
without a `--` separator. A wiki file named `--open-files-in-pager=malicious` would be treated
as a git flag.

**Fix:** Added `'--'` before `filePath`:
```typescript
execFileSync('git', ['log', '--format=%ct', '-1', '--', filePath], { ... })
```

Audited `teardown.ts` (6 git calls — all use internal handles) and `core/keychain/manager.ts`
(hardcoded `git status --porcelain`) — no additional fixes needed there.

### S3 — Shell Interpolation in `core/clones/lifecycle/spawner.ts` (High)

**Risk:** `createWorktree()` used `execSync(\`git worktree add "${worktreePath}" -b "${branch}"\`)`.
String interpolation into a shell command — fragile even with cloneId validation.

**Fix:** Replaced with `execFileSync` and array arguments:
```typescript
execFileSync('git', ['worktree', 'add', worktreePath, '-b', branch], { ... })
```

Import updated from `execSync` to `execFileSync` (only use in file).

## Verification

- `npx tsc --noEmit` — passed, zero TypeScript errors
- `python -m py_compile brain/dispatcher.py` — passed
- Pushed to `origin main` as commit `9ed3369`

## Security Posture After Fixes

| Before | After |
|--------|-------|
| C+ (3 critical/high open) | B+ (0 critical, 0 high open) |

Remaining tracked (not blocking testing):
- S4: .env on disk during clone execution (Low — watchdog cleans up, env-arg path exists in runner.ts)
- S5: Prompt-only sandbox enforcement (Acknowledged — OS-level sandboxing is backlog)
- S6: SCP argument injection in dispatch_remote (Medium — remote dispatch is not yet in use)

## What Reviewers Agreed On

Both Opus and Gemini flagged S1/S2/S3 independently. Additional findings from Opus only:
- Dual Janitor (TS auditor.ts + Python dispatcher) will diverge — tracked as backlog
- Confidence gate hardcoded at 0.8 — cosmetic, tracked
- warn_keywords punishing honest clones — tracked

## Next Step

Cleared for testing. Push order:
1. Phase 1: dedicated bot token for Clone Army
2. Phase 2B: wire Brain classifier into session routing (15% → 60% live)
3. Dry-run dispatcher.py before any live clone execution
