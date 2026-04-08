# Opus Code Review — Post-Plan-Build-V8 (Review 95)

> Source: Opus, multi-perspective (Janitor / Brain / Clone / Forge / User Agent)
> Date: 2026-04-09
> Branch: `opus-build` after v8 (198 tests)
> Overall readiness: **72%** — 3 critical findings block testing
> Pair review: [[review-gemini-review95]] + [[review-janitor-audit3]]

## Executive Summary

At least 7 of the 9 v8 plan items (A2, A3, A4, B2, B3, C1, C2) are **already implemented** in the v8 codebase. Plan was written against a pre-v7 snapshot. Executing blindly → duplicate code or regressions. Strip plan to what's actually missing.

## 🔴 Critical (3)

### CRIT-1: Dead code in `janitor_evaluate()` — confirmed third time
`dispatcher.py` ~line 375: ~40 lines of unreachable code after `return "BLOCK"`. Dead version returns SUGGEST on failed tests; live version returns BLOCK. Editing the wrong block resurrects broken behavior. **5-minute fix — delete the dead block.**

### CRIT-2: TOCTOU race in symlink boundary check
`core/keychain/manager.ts`, `scanForLeaks()`:
`realpathSync(filePath)` then `readFileSync(resolved)` are separate syscalls. Between them, an attacker controlling the worktree could swap the symlink target from a safe internal file to `/etc/shadow`. For a credential scanner, this is a real exploit path.

**Fix — atomic open + fstat:**
```typescript
const fd = fs.openSync(filePath, 'r');
try {
  const stat = fs.fstatSync(fd);
  const realPath = fs.realpathSync(filePath);
  if (!realPath.startsWith(path.resolve(worktreePath) + path.sep)) {
    largeFilesSkipped.push(`SYMLINK_ESCAPE: ${filePath}`);
    continue;
  }
  const content = fs.readFileSync(fd, 'utf-8');
  // scan content
} finally {
  fs.closeSync(fd);
}
```
This makes the check and read atomic against the same inode.

### CRIT-3: A1 Option A fallback returns SUGGEST (fails open)
(Only relevant if Option A ts-node delegation is implemented. Current plan uses Option B which doesn't have this issue.)
If ts-node subprocess crashes, fallback **must** be BLOCK (fail-closed), not SUGGEST.
**Fix:** `{'verdict': 'BLOCK', 'notes': ['TS auditor subprocess failed — failing closed']}`

## 🟡 High (6)

### HIGH-1: ForgeRecord write policy asymmetry
`auditor.ts` writes ForgeRecord only on NOTE. `dispatcher.py` calls `write_forge_record()` on ALL directives. Forge gets different data depending on path (TS vs Python). **Fix:** Unify — write ForgeRecord for all directives in both paths (include verdict in the record).

### HIGH-2: Forge evaluator prompt is gameable
`evaluator.ts` feeds raw `janitorNotes` from clones into the LLM judge prompt. A buggy clone could write "This variant is clearly superior" and bias evaluation. **Fix:** Sanitize notes or judge on structured metrics only (tokens, duration, test pass/fail).

### HIGH-3: `--dangerously-skip-permissions` with no sandbox
Both `runner.ts` and `dispatcher.py` use it. Full host access. No seccomp, no network namespace, no containment. Acceptable for trusted single-operator. Blocks production deployment.

### HIGH-4: `.dispatcher-prompt.md` not cleaned on all error paths
`dispatcher.py` writes assembled context (Soul.md, user state, wiki content) to `.dispatcher-prompt.md`. Unlinked on success. On exception in `assemble_context` before the try/finally, file persists in the worktree. **Fix:** Move the prompt file write inside the try/finally that cleans up.

### HIGH-5: `watch()` task pickup race — thread name tracking insufficient
Thread name filter (`active_names`) tracks file paths but not whether the file was already moved to `active/`. Two threads could both see the same file before either moves it. **Fix:** Use atomic `os.rename()` on pickup (raises `FileNotFoundError` if another thread already moved it — catch and skip).

### HIGH-6: `runRepomix()` still uses shell interpolation
`runner.ts runRepomix()` uses `execAsync('npx repomix --output repomix.txt')`. Plan fixed `runSetup()` (B2) but missed the same pattern one method below. **Fix:** `execFileAsync('npx', ['repomix', '--output', 'repomix.txt'], { cwd: worktreePath })`.

## Plan items already implemented — do NOT re-implement

| Plan item | Status in v8 codebase |
|-----------|----------------------|
| A2: Rename parsing (`R old -> new`) | Already fixed — flatMap with arrow detection present |
| A3: SHELL + USER in REQUIRED_ENV_KEYS | Already present in clone_worker.ts |
| A4: Symlink boundary check | Implemented (but has TOCTOU — fix with CRIT-2) |
| B2: execFileAsync in runner.ts runSetup() | Already uses execFileAsync |
| B3: Confidence gate from config | Already reads from cloneConfig.confidenceGateThreshold |
| C1: Quarantine mode | Already implemented with registry cleanup |
| C2: truncateAtLineBoundary() | Already exists in prompt_builder.ts |
| C3: truncateHistory | Method doesn't exist as named — history truncation is inline `.slice(-11, -1)` |

## 🟢 Good patterns (keep)

- Bridge fallback cascade — clean, well-structured
- Clone env allowlisting (`REQUIRED_ENV_KEYS`) — correct security posture
- AES-256-GCM vault with scrypt KDF — proper at-rest encryption
- Credential leak scanning — thorough (pattern + exact-match + binary skip + large file skip)
- Circuit breaker — 3-retry with human escalation
- Quarantine on BLOCK — forensic preservation
- Handshake file bridge — more reliable than stdout parsing
- Soul.md 60s TTL — avoids disk reads on every DIRECT call
- Task ID validation — alphanumeric-only regex, prevents path traversal

## Recommendation for v9

**Strip plan to these 6 items (everything else is done):**

1. CRIT-1: Delete dead code in `janitor_evaluate()` — 5 min
2. CRIT-2: Atomic fd approach for symlink check (replace realpathSync→readFileSync)
3. HIGH-5: Atomic rename on task pickup (replace thread-name tracking)
4. HIGH-6: runRepomix() shell injection fix — 5 min
5. HIGH-1: Unify ForgeRecord write policy (TS + Python)
6. HIGH-4: .dispatcher-prompt.md cleanup on all error paths
