# Gemini Review — Post-Plan-Build-V8 (Review 95)

> Source: Gemini, 2026-04-08
> Branch: `opus-build` after v8 (198 tests)
> Pair review: [[review-opus-review95]] (pending)

## Executive Summary

| Category | Status | Action |
|----------|--------|--------|
| V8 Plan Execution | 🟡 Partial | Most items implemented, but severe dead code in Python Janitor |
| Security & Privacy | 🟡 Fair | Symlink/allowlist good, Python env parity remains a vulnerability |
| Stability / Usability | 🟢 Good | Threading and quarantine solid, but EXDEV cross-filesystem crash |

## 🟢 The Good

- **watch() concurrency (B1)**: `threading.Thread` pool up to MAX_CONCURRENT. Thread-name filtering (`active_names`) cleanly prevents the same task being picked up twice.
- **Shell safety (B2 + A1)**: `execFileAsync` array args in `runner.ts` neutralises shell injection. `task_id` regex validation `^[\w-]+$` is solid.
- **Symlink hardening (A4)**: `realpathSync` boundary check catches escapes, logs, bypasses safely.
- **Config externalisation (B3)**: `confidenceGateThreshold` + `brainWikiPages` in `clone_config.json` is clean.

## 🔴 The Bad — Critical

### 1. Botched Python Janitor merge — dead code
`brain/dispatcher.py`, `janitor_evaluate()`, lines 763–802:
- Lines 763–775: **new logic** (correct — BLOCKED_IMPOSSIBLE first, tests_passed False second). Ends with `return "BLOCK"`.
- Lines 777+: **old logic orphaned** (`if status == "BLOCKED_IMPOSSIBLE": return "BLOCK"` etc.) — unreachable dead code.

Does not break the build, but looks sloppy in review and could confuse future maintainers.

**Fix:** Delete lines 777–802 in `janitor_evaluate`.

### 2. Quarantine EXDEV crash (cross-filesystem)
`core/clones/lifecycle/teardown.ts`, `quarantineWorktree()`:
`fs.renameSync(handle.path, dest)` throws `EXDEV` if the worktree (e.g., `/tmp` or ramdisk) and `state/worktrees/quarantine/` are on different filesystem partitions. Node silently falls back and **deletes the worktree** — losing all forensic data.

**Fix:** Catch `EXDEV` error, fall back to recursive copy-then-delete:
```typescript
try {
  fs.renameSync(worktreePath, dest);
} catch (err: any) {
  if (err.code === 'EXDEV') {
    // Cross-device move — copy then delete
    fs.cpSync(worktreePath, dest, { recursive: true });
    fs.rmSync(worktreePath, { recursive: true, force: true });
  } else {
    throw err;
  }
}
```

### 3. Python env still blacklist — TS/Python parity gap
TS `buildCloneEnv()` uses strict **allowlist** (`REQUIRED_ENV_KEYS`). Python `build_clone_env()` uses **blacklist** (`SENSITIVE_ENV_KEYS`). A new secret like `AWS_SECRET_ACCESS_KEY` on the host leaks via Python path but not TS path.

**Fix (from Opus 94):** Convert Python to allowlist matching TS pattern.

## 👹 The Ugly

### 4. Regex recompilation inside loop
`core/keychain/manager.ts`, `scanForLeaks()`:
`new RegExp(pattern.regex).test(content)` is called on every file. With N files and M patterns → N×M regex compilations. Pre-compile outside the loop.

```typescript
// Pre-compile once:
const compiledPatterns = patterns.map(p => ({ re: new RegExp(p.regex), name: p.name }));
// Then in loop:
for (const { re, name } of compiledPatterns) {
  if (re.test(content)) { /* found */ }
}
```

### 5. Conflicting history truncation
`core/user_agent/agent.ts`: `MAX_HISTORY_ENTRIES = 50` but `truncateHistory()` hard-slices to last 10. The 50-item limit is dead code — array never grows past 10.

Fix: Either remove `MAX_HISTORY_ENTRIES` or align it with `truncateHistory()` slice value.

## 🔍 Unseen Problems

- **Watchdog race condition**: `watchdog.ts` reads `registry.json` and runs teardown. If a clone finishes exactly when watchdog is processing, both `teardown.ts` and `watchdog.ts` attempt `git worktree remove` simultaneously → git lock file errors + ghost branches.
- **Silent dependency failures**: `setup.sh` uses `&&` and `--quiet`. If `npm install` or `pip install` fails, the failure is silent and the clone proceeds with a broken environment → hallucinations, wasted tokens.

## 🍎 Low-Hanging Fruit

1. Delete dead code in `dispatcher.py` janitor_evaluate (lines 777–802)
2. Pre-compile regexes outside the `scanForLeaks` loop
3. Fix quarantine EXDEV with copy-then-delete fallback

## Priority Actions for V9

| Priority | Issue | File |
|----------|-------|------|
| 🔴 Critical | Quarantine EXDEV crash (lose forensic data) | `core/clones/lifecycle/teardown.ts` |
| 🔴 Critical | Dead code in Python Janitor | `brain/dispatcher.py` |
| 🟡 High | Python env blacklist → allowlist | `brain/dispatcher.py` |
| 🟡 High | Regex precompilation | `core/keychain/manager.ts` |
| 🟡 High | MAX_HISTORY_ENTRIES dead code | `core/user_agent/agent.ts` |
| 🟢 Low | Watchdog race condition | `core/clones/watchdog.ts` |
| 🟢 Low | Silent setup.sh failures | `core/clones/lifecycle/spawner.ts` |
