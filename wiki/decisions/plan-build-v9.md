# Build Plan V9 — Dead Code, EXDEV Quarantine, Python Allowlist, Threading Lock

> Author: Kevin (agent orchestrator)
> Date: 2026-04-09
> Target: Opus 4.6, fresh session, opus-build branch
> Source reviews: [[review-gemini-review95]] + [[review-janitor-audit3]]
> Scope: Critical bugs before testing, reliability hardening, code hygiene

## Context

Branch `opus-build` at commit `2db5381`. 198 tests (156 Jest + 42 pytest), all green. TSC clean.
Read `wiki/decisions/build-state-2026-04-08-v8.md` for full picture.

**Do NOT touch** `wiki/`, `main` branch, or README (unless explicitly listed below).

Run after each phase:
```bash
cd /home/claudebot/clones/agent4wiki-opus-build-20260408
npx tsc --noEmit && npx jest && python3 -m pytest test/
```
All must stay green before proceeding.

---

## Phase A — Critical (must fix before integration testing)

### A1: Delete dead code block in `janitor_evaluate()` — confirmed by BOTH reviews

**File:** `brain/dispatcher.py`, `janitor_evaluate()`

**Bug (confirmed Gemini 95 + Janitor audit 3):** After the new V2 logic ends with `return "BLOCK"` (around line 671), there is an entire orphaned copy of the V1 evaluation logic (~30 lines) that can never execute. V1 uses `handshake.get("tests_passed", False)` (wrong — treats `None` as falsy) vs V2's correct `handshake.get("tests_passed") is False`. A developer editing the dead block thinking it's live will be confused when nothing changes.

**Fix:** Find and delete the unreachable block. The function should end cleanly after the V2 logic. Pattern to find and remove:
```python
# Dead code starts after a `return "BLOCK"` that already exits the function.
# The dead block looks like:
    if status == "BLOCKED_IMPOSSIBLE":
        return "BLOCK"
    if status == "FAILED_REQUIRE_HUMAN":
        return "BLOCK"
    ...
```
Delete everything after the last reachable `return` statement in `janitor_evaluate()`.

**Tests:**
- `{status: "BLOCKED_IMPOSSIBLE"}` → `"BLOCK"` (unchanged)
- `{status: "COMPLETED", tests_passed: False}` → `"SUGGEST"` (V2 logic is correct)
- `{tests_passed: None}` → NOT SUGGEST (V2 correctly treats None as absent)
- Function has no unreachable lines after fix (verify with coverage or manual inspection)

### A2: Fix quarantine EXDEV crash — cross-filesystem rename

**File:** `core/clones/lifecycle/teardown.ts`, `quarantineWorktree()`

**Bug (Gemini 95 critical):** `fs.renameSync(worktreePath, dest)` throws `EXDEV` if the worktree (e.g., `/tmp`) and the quarantine dir (`state/worktrees/quarantine/`) are on different filesystem partitions. Node silently falls back and **deletes the worktree** — losing all forensic data without any indication.

**Fix:** Catch `EXDEV` and fall back to copy-then-delete:
```typescript
async function quarantineWorktree(worktreePath: string, cloneId: string, repoRoot: string): Promise<void> {
  const quarantineDir = path.join(repoRoot, 'state', 'worktrees', 'quarantine');
  fs.mkdirSync(quarantineDir, { recursive: true });
  const dest = path.join(quarantineDir, `${cloneId}-${Date.now()}`);
  
  try {
    fs.renameSync(worktreePath, dest);
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      // Cross-device move — copy then delete
      fs.cpSync(worktreePath, dest, { recursive: true });
      fs.rmSync(worktreePath, { recursive: true, force: true });
    } else {
      throw err; // Re-throw unexpected errors
    }
  }
  
  // Prune dangling worktree reference from git
  await execFileAsync('git', ['worktree', 'prune'], { cwd: repoRoot }).catch(() => {});
}
```

**Tests:**
- EXDEV error → worktree contents preserved at dest, source removed
- Normal rename (same filesystem) → still works
- BLOCK verdict → quarantine runs, not delete

### A3: Convert Python `build_clone_env()` from blacklist to allowlist

**File:** `brain/dispatcher.py`, `build_clone_env()`

**Bug (Gemini 95 + Opus 94 recurring):** TypeScript `buildCloneEnv()` uses a strict allowlist (`REQUIRED_ENV_KEYS`). Python `build_clone_env()` uses a blacklist (`SENSITIVE_ENV_KEYS` strip). A new credential like `AWS_SECRET_ACCESS_KEY` on the host leaks via Python path but not TS path. Two different security postures for the same operation.

**Fix:** Replace the blacklist approach with an allowlist matching TS:
```python
REQUIRED_ENV_KEYS = {
    'PATH', 'HOME', 'NODE_ENV', 'TMPDIR', 'LANG', 'LC_ALL', 'SHELL', 'USER'
}

def build_clone_env(extra: dict | None = None) -> dict:
    """Allowlist-based env — only safe system keys + task-scoped keys."""
    env = {k: os.environ[k] for k in REQUIRED_ENV_KEYS if k in os.environ}
    if extra:
        env.update(extra)
    return env
```

Remove `SENSITIVE_ENV_KEYS` entirely — no longer needed.

**Tests:**
- `build_clone_env()` only contains keys from REQUIRED_ENV_KEYS + extra
- `AWS_SECRET_ACCESS_KEY` on host → NOT in clone env
- `VAULT_MASTER_PASSWORD` on host → NOT in clone env (was in blacklist, still excluded by allowlist)
- `PATH` and `HOME` present (safe system keys)
- `extra={'TASK_KEY': 'val'}` → preserved

### A4: Add `threading.Lock` to inbox scan in `watch()`

**File:** `brain/dispatcher.py`, `watch()`

**Bug (Janitor audit 3, S1):** `process_task_file()` does `shutil.move()` on shared directories (inbox → active → completed/failed) without locking. Two threads could race on the same task file if the timing is tight.

**Fix:** Use an atomic rename + `FileNotFoundError` catch pattern (or a Lock):
```python
_inbox_lock = threading.Lock()

def watch(self):
    active_threads = []
    while True:
        active_threads = [t for t in active_threads if t.is_alive()]
        
        if len(active_threads) < MAX_CONCURRENT:
            with _inbox_lock:
                tasks = self._get_pending_tasks()
                active_names = {t.name for t in active_threads}
                new_tasks = [t for t in tasks if str(t) not in active_names]
                to_start = new_tasks[:MAX_CONCURRENT - len(active_threads)]
            
            for task in to_start:
                thread = threading.Thread(
                    target=self.process_task_file,
                    args=(task,),
                    name=str(task),
                    daemon=True
                )
                thread.start()
                active_threads.append(thread)
        
        time.sleep(POLL_INTERVAL)
```

**Tests:**
- Two threads don't pick up the same task file (add `FileNotFoundError` guard in `process_task_file` if moved already)
- Lock doesn't prevent genuine concurrency (different task files still process in parallel)

After Phase A: run full suite, confirm green.

---

## Phase B — Reliability

### B1: Precompile regex patterns in `scanForLeaks()`

**File:** `core/keychain/manager.ts`, `scanForLeaks()`

**Bug (Gemini 95):** `new RegExp(pattern.regex).test(content)` is called inside the per-file loop. With N files and M patterns → N×M regex compilations. Should compile once before the file loop.

**Fix:**
```typescript
// Before file loop:
const compiledPatterns = patterns.map(p => ({
  name: p.name,
  re: new RegExp(p.regex),
}));

// In file loop:
for (const { name, re } of compiledPatterns) {
  if (re.test(content)) {
    leaks.push({ file: filePath, pattern: name });
  }
}
```

**Tests:**
- Leak detected correctly (regression)
- Performance: no correctness change, just order of operations

### B2: Fix `MAX_HISTORY_ENTRIES` dead code

**File:** `core/user_agent/agent.ts`

**Bug (Gemini 95):** `MAX_HISTORY_ENTRIES = 50` but `truncateHistory()` slices to last 10. The array never reaches 50. The constant is dead code that misleads readers about the actual limit.

**Fix:** Either remove `MAX_HISTORY_ENTRIES` and document the slice count directly in `truncateHistory()`, or align both to the same value:
```typescript
private truncateHistory(history: ConversationTurn[]): ConversationTurn[] {
  // Keeps the 10 most recent turns. TODO: wire to Haiku for summarisation.
  const MAX_TURNS = 10;
  return history.slice(-MAX_TURNS);
}
```
Remove the separate `MAX_HISTORY_ENTRIES = 50` constant entirely.

**Tests:**
- History with 15 turns → returns last 10
- History with 5 turns → returned unchanged
- No reference to removed constant anywhere (grep check)

### B3: Verify and fix template variable names

**Files:** `templates/code-clone-TASK.md`, `core/brain/prompt_builder.ts`

**Bug (Janitor audit 3, B3):** Templates may still use old variable names (`{INJECT_SOUL_MD_HERE}`, `{INJECT_BRAIN_DELEGATED_TASK_HERE}`) while `prompt_builder.ts` uses standardised names (`{INJECT_SOUL_HERE}`, `{INJECT_TASK_HERE}`). Silent failure — placeholder string stays in the prompt.

**Fix:** Read `templates/code-clone-TASK.md` and verify it uses exactly:
```
{INJECT_SOUL_HERE}
{INJECT_ALLOWED_PATHS_HERE}
{INJECT_ALLOWED_ENDPOINTS_HERE}
{INJECT_WIKI_CONTEXT_HERE}
{INJECT_TASK_HERE}
```
Update any that don't match. These are the canonical names in `prompt_builder.ts`.

**Tests:**
- `promptBuilder.build(template, vars)` with the template — no `{INJECT_` strings remain in output
- All 5 injection points are replaced

### B4: Add fallback default in `clone_config.json` import

**File:** `core/clones/clone_worker.ts`

**Bug (Janitor audit 3, minor):** `clone_config.json` import has no fallback. If the JSON file is missing, the import fails and the worker crashes instead of using sane defaults.

**Fix:**
```typescript
let cloneConfig = { maxRetries: 3, timeoutMs: 300000, watchdogMaxAgeMinutes: 30,
                    confidenceGateThreshold: 0.5, brainWikiPages: ['concept-routing-classifier', 'segment-brain'],
                    maxWikiContextChars: 2000 };
try {
  cloneConfig = { ...cloneConfig, ...require('../config/clone_config.json') };
} catch {
  console.warn('clone_config.json not found — using defaults');
}
```

**Tests:**
- Missing config file → worker uses defaults, doesn't crash
- Present config file → values from file override defaults

After Phase B: run full suite, confirm green.

---

## Phase C — Polish

### C1: Clean up `raw/dispatcher.py` header

**File:** `raw/dispatcher.py`

Add comment at top:
```python
# ARCHIVED — do not run.
# This is the original design document (pre-implementation).
# Active version: brain/dispatcher.py
# Paths here reference agent-v4/ (old) not the current repo structure.
```
No other changes to the file.

### C2: Fix `urllib.parse` import position in `bridge.py`

**File:** `brain/bridge.py`

Move `import urllib.parse` from inside/after the `Bridge` class definition to the top of the file with other imports. No functional change — Python resolves it either way, but placing imports after class definitions is unconventional and fails style checks.

### C3: Delete stray `test-output.txt`

**File:** `test-output.txt` (opus-build root)

```bash
git rm test-output.txt
```

### C4: Document `.env`-on-disk tradeoff

**File:** `core/keychain/manager.ts`, `provisionEnvironment()` — add comment

The original design stated "credentials exist only in process memory". The implementation writes a `.env` file to the worktree (mode `0o600`), deleted by `revokeEnvironment()` in a `finally` block. Add a comment documenting this as an intentional tradeoff:
```typescript
// Note: writes a temporary .env file to the worktree (mode 0o600).
// This departs from the "process memory only" design goal but is required
// for Python/shell clone compatibility. revokeEnvironment() deletes it
// unconditionally in a finally block. Watchdog cleans up any stale .env
// files from crashed clones. Risk: crash between provision and revoke
// leaves credentials on disk until watchdog runs.
```

After Phase C: run full suite, confirm green.

---

## Execution Rules

1. **Branch**: `opus-build` only.
2. **Language**: TypeScript for `core/`. Python for `brain/`.
3. **No new npm dependencies.**
4. **All tests green** after each phase.
5. **Phase order**: A → B → C.
6. **Do not refactor** code not mentioned in this plan.

## Verification

```bash
npx tsc --noEmit          # must exit 0
npx jest                  # 198+ tests green
python3 -m pytest test/   # 42+ tests green
```

## Expected Final State

| Phase | Changes | New Tests |
|-------|---------|-----------|
| A: Critical | Dead code deleted, EXDEV fix, Python allowlist, threading lock | +8 |
| B: Reliability | Regex precompile, history constant, template fix, config fallback | +6 |
| C: Polish | Header comment, import fix, delete stray file, .env comment | +2 |
| **Total** | **~12 files changed** | **+16 tests → ~214 total** |
