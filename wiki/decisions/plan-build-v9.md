# Build Plan V9 — Stripped to What's Actually Missing

> Author: Kevin (agent orchestrator)
> Date: 2026-04-09
> Target: Opus 4.6, fresh session, opus-build branch
> Source reviews: [[review-gemini-review95]] + [[review-janitor-audit3]] + [[review-opus-review95]]
> Scope: 6 targeted fixes — everything else from prior plan is already done

## Context

Branch `opus-build` at commit `2db5381`. 198 tests (156 Jest + 42 pytest), all green. TSC clean.
Read `wiki/decisions/build-state-2026-04-08-v8.md` for full picture.

**Critical note from Opus review:** A2, A3, A4, B2, B3, C1, C2, C3 from plan-build-v8 are **already implemented**. Do NOT re-implement them. Read the code before writing anything.

**Do NOT touch** `wiki/`, `main` branch.

Run after each phase:
```bash
cd /home/claudebot/clones/agent4wiki-opus-build-20260408
npx tsc --noEmit && npx jest && python3 -m pytest test/
```
All must stay green before proceeding.

---

## Phase A — Critical (5-minute fixes + security)

### A1: Delete dead code in `janitor_evaluate()` — confirmed by ALL THREE reviews

**File:** `brain/dispatcher.py`, `janitor_evaluate()`

**Bug:** After the live V2 logic ends with `return "BLOCK"` (~line 375), there are ~40 lines of orphaned V1 evaluation logic. V1 returns SUGGEST on failed tests; V2 correctly returns BLOCK. If someone edits the dead block, nothing changes and they don't know why.

**Fix:** Read the function. Find the last reachable `return` statement in the V2 logic. Delete everything after it. The cleaned function should have:
```python
def janitor_evaluate(handshake: dict, worktree_path: str = '') -> str:
    # V2 logic only:
    if handshake.get('status') == 'BLOCKED_IMPOSSIBLE':
        return 'BLOCK'
    if handshake.get('tests_passed') is False and handshake.get('source_files'):
        return 'SUGGEST'
    if handshake.get('status') == 'COMPLETED':
        # warn_keywords check
        ...
        return 'NOTE'
    return 'SUGGEST'
    # NOTHING BELOW THIS LINE
```

**Tests:**
- `{status: 'BLOCKED_IMPOSSIBLE'}` → `'BLOCK'`
- `{status: 'COMPLETED', tests_passed: False, source_files: ['a.py']}` → `'SUGGEST'`
- `{status: 'COMPLETED', tests_passed: None}` → NOT SUGGEST (None is not False)
- `{status: 'COMPLETED', tests_passed: True}` → `'NOTE'`

### A2: Fix TOCTOU race in symlink boundary check

**File:** `core/keychain/manager.ts`, `scanForLeaks()`

**Bug (Opus CRIT-2):** Current code calls `fs.realpathSync(filePath)` then `fs.readFileSync(resolved)` as separate syscalls. Between them, an attacker controlling the worktree could swap the symlink target. For a credential scanner this is a real exploit path.

**Fix — open fd first, then check, then read from same fd:**
```typescript
let fd: number | null = null;
try {
  fd = fs.openSync(filePath, 'r');
  const realPath = fs.realpathSync(filePath);
  const resolvedWorktree = path.resolve(worktreePath);
  if (!realPath.startsWith(resolvedWorktree + path.sep) && realPath !== resolvedWorktree) {
    largeFilesSkipped.push(`SYMLINK_ESCAPE: ${filePath}`);
    continue;
  }
  const stat = fs.fstatSync(fd);
  if (stat.size > MAX_FILE_SIZE) {
    largeFilesSkipped.push(filePath);
    continue;
  }
  const content = fs.readFileSync(fd, 'utf-8');
  // scan content...
} catch {
  // File unreadable — skip
} finally {
  if (fd !== null) fs.closeSync(fd);
}
```

**Tests:**
- Symlink pointing outside worktree at scan time → SYMLINK_ESCAPE (still caught)
- Normal file scanned correctly (regression)
- Large file → in largeFilesSkipped

### A3: Fix `watch()` task pickup race — atomic rename instead of thread-name tracking

**File:** `brain/dispatcher.py`, `watch()` and `process_task_file()`

**Bug (Opus HIGH-5, Gemini S1):** Thread name tracking (`active_names`) prevents the same task from being queued twice but doesn't prevent two threads from seeing the same file before either moves it to `active/`.

**Fix:** Use atomic `os.rename()` on pickup. Only the thread that succeeds the rename processes the task:
```python
def _claim_task(self, task_path: Path) -> bool:
    """Atomically claim a task file. Returns True if this thread claimed it."""
    active_path = self.active_dir / task_path.name
    try:
        os.rename(task_path, active_path)
        return True
    except FileNotFoundError:
        return False  # Another thread already claimed it

def watch(self):
    active_threads = []
    while True:
        active_threads = [t for t in active_threads if t.is_alive()]
        
        if len(active_threads) < MAX_CONCURRENT:
            tasks = list(self.inbox_dir.glob('*.json'))
            for task in tasks:
                if len(active_threads) >= MAX_CONCURRENT:
                    break
                if not self._claim_task(task):
                    continue  # Already claimed by another thread
                active_path = self.active_dir / task.name
                thread = threading.Thread(
                    target=self._process_active_task,
                    args=(active_path,),
                    daemon=True
                )
                thread.start()
                active_threads.append(thread)
        
        time.sleep(POLL_INTERVAL)
```

**Tests:**
- Two threads claiming the same task: only one succeeds
- Second `_claim_task` on same file → returns False (FileNotFoundError caught)
- Task eventually processed exactly once

After Phase A: run full suite, confirm green.

---

## Phase B — Reliability

### B1: Fix `runRepomix()` shell interpolation

**File:** `core/clones/lifecycle/runner.ts`, `runRepomix()`

**Bug (Opus HIGH-6):** `runSetup()` was fixed to use `execFileAsync('bash', [setupScript])` but `runRepomix()` still uses `execAsync('npx repomix --output repomix.txt')` with shell interpolation.

**Fix:**
```typescript
await execFileAsync('npx', ['repomix', '--output', 'repomix.txt'], {
  cwd: worktreePath,
  env: cloneEnv,
});
```

**Tests:**
- Repomix runs correctly with array form
- Path with spaces doesn't break execution

### B2: Unify ForgeRecord write policy

**File:** `core/janitor/auditor.ts`, `evaluateMission()`

**Bug (Opus HIGH-1):** `auditor.ts` only writes ForgeRecord on NOTE. `dispatcher.py` calls `write_forge_record()` on ALL directives. Forge gets different data depending on which path the task took.

**Fix:** Write ForgeRecord for all directives in `auditor.ts`, include the verdict:
```typescript
// Write ForgeRecord regardless of verdict (NOTE, SUGGEST, or BLOCK)
const forgeRecord: ForgeRecord = {
  task_id: mission.task_id,
  skill: mission.skill ?? 'unknown',
  directive: verdict,  // NOTE / SUGGEST / BLOCK
  tokens_consumed: mission.tokens_consumed ?? 0,
  duration_seconds: mission.duration_seconds ?? 0,
  files_modified: mission.files_modified ?? [],
  timestamp: new Date().toISOString(),
};
this.writeForgeRecord(forgeRecord);
```

**Tests:**
- NOTE verdict → ForgeRecord written
- SUGGEST verdict → ForgeRecord written  
- BLOCK verdict → ForgeRecord written
- Python path also writes ForgeRecord for all directives (verify in existing pytest)

### B3: Fix `.dispatcher-prompt.md` not cleaned on all error paths

**File:** `brain/dispatcher.py`, `_process_active_task()` or `launch_session()`

**Bug (Opus HIGH-4):** `.dispatcher-prompt.md` is unlinked on success but an exception in `assemble_context()` before the try/finally can leave it in the worktree on crash.

**Fix:** Move the prompt file write inside the try block, and ensure the finally block always deletes it:
```python
prompt_file = worktree_path / '.dispatcher-prompt.md'
try:
    context = assemble_context(task, worktree_path)
    prompt_file.write_text(context)
    result = launch_session(worktree_path, prompt_file)
    return result
finally:
    if prompt_file.exists():
        prompt_file.unlink()
```

**Tests:**
- Exception in `assemble_context` → prompt file does not persist in worktree
- Successful run → prompt file removed
- Crash mid-launch → prompt file removed by finally

After Phase B: run full suite, confirm green.

---

## Execution Rules

1. **Branch**: `opus-build` only.
2. **Read the code before writing anything.** Several items from prior plans are already done.
3. **No new npm dependencies.**
4. **All tests green** after each phase.
5. **Phase order**: A → B.
6. **Do not re-implement** A2-A4, B2, B3, C1-C3 from plan-build-v8 — already done.

## Verification

```bash
npx tsc --noEmit          # must exit 0
npx jest                  # 198+ tests green (target ~212)
python3 -m pytest test/   # 42+ tests green
git log --oneline -5      # 2-3 commits on opus-build
```

## Expected Final State

| Phase | Changes | New Tests |
|-------|---------|-----------|
| A: Critical | Dead code, TOCTOU atomic fd, atomic task rename | +8 |
| B: Reliability | runRepomix array form, ForgeRecord unified, prompt file cleanup | +6 |
| **Total** | **~8 files changed** | **+14 tests → ~212 total** |
