# Build Plan V8 — Janitor Unification, Watch Concurrency, Shell Safety, Quarantine Mode

> Author: Kevin (agent orchestrator)
> Date: 2026-04-08
> Target: Opus 4.6, fresh session, opus-build branch
> Source reviews: [[review-opus-review94]] + [[review-gemini-review94]]
> Scope: Architecture correctness, reliability hardening, forensic preservation

## Context

Branch `opus-build` at commit after v7. 174 tests (138 Jest + 36 pytest), all green. TSC clean.
Read `wiki/decisions/build-state-2026-04-08-v7.md` for full picture.

**Do NOT touch** `wiki/`, `raw/`, `main` branch, or README.

Run after each phase:
```bash
cd /home/claudebot/clones/agent4wiki-opus-build-<date>
npx tsc --noEmit && npx jest && python3 -m pytest test/
```
All must stay green before proceeding.

---

## Phase A — Critical Correctness

### A1: Align Python Janitor decision tree exactly with auditor.ts — CRITICAL

**File:** `brain/dispatcher.py`, `janitor_evaluate()`

**Bug:** `{status: "COMPLETED", tests_passed: false}` gives different verdicts depending on entry path:
- TS `auditor.ts`: checks `BLOCKED_IMPOSSIBLE` before `tests_passed === false` → verdict = **BLOCK**
- Python `janitor_evaluate()`: enters the `COMPLETED` branch → verdict = **SUGGEST**

Identical handshake, different outcome. Whichever path the task enters determines the result.

**Fix (Option A — preferred):** Add a `core/janitor/cli.ts` entry point that accepts a handshake JSON path, runs `Janitor.evaluateMission()`, and prints the verdict as JSON to stdout. Then in `dispatcher.py` replace `janitor_evaluate()` entirely:

```python
import subprocess, json

def janitor_evaluate(handshake: dict, worktree_path: str) -> dict:
    """Delegate to the TypeScript auditor — single source of truth."""
    handshake_path = os.path.join(worktree_path, 'state', 'handshake_eval.json')
    with open(handshake_path, 'w') as f:
        json.dump(handshake, f)
    result = subprocess.run(
        ['npx', 'ts-node', 'core/janitor/cli.ts', handshake_path],
        capture_output=True, text=True, cwd=os.path.dirname(__file__)
    )
    if result.returncode != 0:
        return {'verdict': 'SUGGEST', 'notes': [f'TS auditor failed: {result.stderr[:200]}']}
    return json.loads(result.stdout)
```

**Fix (Option B — fallback if ts-node unavailable):** Replicate the exact TS decision order in Python:
```python
# Exact mirror of auditor.ts evaluateMission():
# 1. BLOCKED_IMPOSSIBLE check first
# 2. tests_passed === False check second  
# 3. COMPLETED branch last
if handshake.get('status') == 'BLOCKED_IMPOSSIBLE':
    return {'verdict': 'BLOCK', 'notes': ['Task marked impossible']}
if handshake.get('tests_passed') is False and handshake.get('source_files'):
    return {'verdict': 'SUGGEST', 'notes': ['Tests failed']}
if handshake.get('status') == 'COMPLETED':
    return {'verdict': 'COMPLETED', 'notes': []}
```

Use Option A if `ts-node` is available in the environment; Option B otherwise. Document the choice in a comment.

**Create `core/janitor/cli.ts`** (for Option A):
```typescript
import { Janitor } from './auditor';
import * as fs from 'fs';

const handshakePath = process.argv[2];
if (!handshakePath) { console.error('Usage: cli.ts <handshake.json>'); process.exit(1); }
const handshake = JSON.parse(fs.readFileSync(handshakePath, 'utf-8'));
const janitor = new Janitor();
const result = janitor.evaluateMission(handshake);
console.log(JSON.stringify(result));
```

**Tests:**
- `{status: "COMPLETED", tests_passed: false, source_files: ["a.ts"]}` → Python verdict matches TS verdict (both SUGGEST or both BLOCK — they must agree)
- `{status: "BLOCKED_IMPOSSIBLE"}` → both return BLOCK
- `{status: "COMPLETED", tests_passed: true}` → both return COMPLETED
- Python `janitor_evaluate` with missing `tests_passed` field → not SUGGEST (same as TS)

### A2: Fix git status rename parsing

**File:** `core/keychain/manager.ts`, `getModifiedFiles()`

**Bug:** `git status --porcelain` outputs renames as `R  old-name.ts -> new-name.ts`. The current `line.slice(3)` gives `old-name.ts -> new-name.ts` as a single string — not a valid path. The rename format should extract just the new filename.

**Fix:**
```typescript
const files = output.split('\n')
  .filter(line => line.trim().length > 0)
  .flatMap(line => {
    const status = line.slice(0, 2).trim();
    const rest = line.slice(3).trim();
    // Renames: "R  old -> new" or "R  old\0new" — extract the new filename
    if (status === 'R' || status === 'RM') {
      const arrowIdx = rest.indexOf(' -> ');
      return arrowIdx >= 0 ? [rest.slice(arrowIdx + 4)] : [rest];
    }
    return [rest];
  })
  .filter(f => f.length > 0);
```

**Tests:**
- Renamed file appears as the NEW filename only (not `old -> new`)
- Modified file still detected (regression)
- Staged rename (A → B) detected as B
- Clean worktree → empty list

### A3: Add SHELL and USER to REQUIRED_ENV_KEYS

**File:** `core/clones/clone_worker.ts`

**Bug:** `REQUIRED_ENV_KEYS = ['PATH', 'HOME', 'NODE_ENV', 'TMPDIR', 'LANG', 'LC_ALL']` is missing `SHELL` and `USER`. Some npm scripts and git operations expect these. Missing them causes silent failures inside worktrees.

**Fix:**
```typescript
const REQUIRED_ENV_KEYS = ['PATH', 'HOME', 'NODE_ENV', 'TMPDIR', 'LANG', 'LC_ALL', 'SHELL', 'USER'];
```

**Tests:**
- `buildCloneEnv()` result contains `SHELL` (if set on host)
- `buildCloneEnv()` result contains `USER` (if set on host)
- An arbitrary env var still not present (allowlist unchanged)

### A4: Symlink boundary check in scanForLeaks

**File:** `core/keychain/manager.ts`, `scanForLeaks()`

**Bug:** `fs.readFileSync` on a symlink pointing outside the worktree reads arbitrary host files. No boundary check.

**Fix:** Before reading each file, resolve its real path and verify it starts with the worktree path:
```typescript
import * as path from 'path';
import * as fs from 'fs';

// In the file scan loop:
const realPath = fs.realpathSync(filePath);
if (!realPath.startsWith(path.resolve(worktreePath) + path.sep)) {
  // Symlink escapes worktree — skip and log
  largeFilesSkipped.push(`SYMLINK_ESCAPE: ${filePath}`);
  continue;
}
```

**Tests:**
- Symlink pointing outside worktree → skipped, recorded in `largeFilesSkipped`
- Normal file inside worktree → scanned normally
- Symlink pointing to file inside worktree → scanned normally

After Phase A: run full suite, confirm green.

---

## Phase B — Reliability

### B1: Fix watch() sequential queue (dispatcher.py)

**File:** `brain/dispatcher.py`, `watch()`

**Bug:** `MAX_CONCURRENT = 3` but `watch()` calls `process_task_file(tasks[0])` synchronously. If the first task times out at 5 minutes, the queue is blocked for 5 minutes and MAX_CONCURRENT is never used.

**Fix:** Use `asyncio` or Python threads for real concurrency up to MAX_CONCURRENT:
```python
import threading

def watch(self):
    active_threads = []
    while True:
        # Prune finished threads
        active_threads = [t for t in active_threads if t.is_alive()]
        
        if len(active_threads) < MAX_CONCURRENT:
            tasks = self._get_pending_tasks()
            for task in tasks:
                if len(active_threads) >= MAX_CONCURRENT:
                    break
                t = threading.Thread(target=self.process_task_file, args=(task,), daemon=True)
                t.start()
                active_threads.append(t)
        
        time.sleep(POLL_INTERVAL)
```

**Tests:**
- Two tasks submitted simultaneously — both start within one poll interval (not sequential)
- Third task starts when one of the first two finishes
- MAX_CONCURRENT=1 reverts to sequential behavior (boundary test)

### B2: Fix shell injection in runner.ts

**File:** `core/clones/lifecycle/runner.ts`

**Bug:** `execAsync('bash "${setupScript}"')` uses string interpolation for a shell command. Should use `execFile` with array args to avoid shell escaping issues.

**Fix:**
```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

// Replace execAsync('bash "${setupScript}"') with:
await execFileAsync('bash', [setupScript], { cwd: worktreePath, env: cloneEnv });
```

**Tests:**
- Setup script with spaces in path executes correctly
- Setup script executes with correct environment (cloneEnv, not process.env)

### B3: Move confidence threshold and wiki pages to clone_config.json

**Files:** `core/config/clone_config.json`, `core/user_agent/agent.ts`, `core/brain/prompt_builder.ts`

**Bug (from Opus 94):** Confidence threshold `0.5` and wiki pages `['concept-routing-classifier', 'segment-brain']` are magic numbers/strings hardcoded in source. If pages don't exist, BRAIN_ONLY silently falls back to being identical to DIRECT.

**Fix:** Add to `core/config/clone_config.json`:
```json
{
  "maxRetries": 3,
  "timeoutMs": 300000,
  "watchdogMaxAgeMinutes": 30,
  "confidenceGateThreshold": 0.5,
  "brainWikiPages": ["concept-routing-classifier", "segment-brain"],
  "maxWikiContextChars": 2000
}
```

In `agent.ts`, read `cloneConfig.confidenceGateThreshold` instead of `0.5`.
In `prompt_builder.ts` / `agent.ts`, read `cloneConfig.brainWikiPages`.

Also suppress the raw confidence float from user-facing messages (Opus 94 finding):
```typescript
// Before:
return `I'm not confident... (confidence: ${brief.confidence})`
// After:
return `I'm not confident I understood your request correctly. Could you rephrase? Here's what I understood: ${brief.objective}`
```

**Tests:**
- Changing `confidenceGateThreshold` in config affects gating behavior
- `brainWikiPages` from config is used in `routeToBrain`
- Clarification message does NOT contain raw confidence float
- Missing wiki page → loadWikiContext returns empty string (not a crash)

After Phase B: run full suite, confirm green.

---

## Phase C — Quality

### C1: Quarantine mode for blocked worktrees

**File:** `core/clones/lifecycle/teardown.ts`

**Bug (Gemini 94):** When a clone BLOCKs, `teardown.ts` removes the entire worktree. All forensic evidence (logs, partial code, state files) is destroyed.

**Fix:** Move the worktree to `state/worktrees/quarantine/<cloneId>-<timestamp>/` instead of deleting:
```typescript
import * as fs from 'fs';
import * as path from 'path';

async function quarantineWorktree(worktreePath: string, cloneId: string): Promise<void> {
  const quarantineDir = path.join(process.cwd(), 'state', 'worktrees', 'quarantine');
  fs.mkdirSync(quarantineDir, { recursive: true });
  const dest = path.join(quarantineDir, `${cloneId}-${Date.now()}`);
  fs.renameSync(worktreePath, dest);
  // Remove from git worktree registry without deleting files
  await execFileAsync('git', ['worktree', 'prune']);
}
```

On BLOCK verdict: call `quarantineWorktree()` instead of the normal `removeWorktree()`.
On COMPLETED/SUGGEST: teardown proceeds normally.

**Tests:**
- BLOCK verdict → worktree moved to `state/worktrees/quarantine/`, not deleted
- Quarantine directory contains the full worktree state
- COMPLETED verdict → normal teardown (not quarantined)

### C2: Fix context truncation to slice at line boundary

**File:** `core/brain/prompt_builder.ts`, `loadWikiContext()`

**Bug (Gemini 94):** `content.slice(0, 800)` can cut mid-JSON, mid-table, mid-code-fence. LLM sees broken syntax.

**Fix:** Slice at the last newline before the 800-char boundary:
```typescript
function truncateAtLineBoundary(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const truncated = content.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  return lastNewline > 0 ? truncated.slice(0, lastNewline) + '\n...' : truncated + '...';
}
```

**Tests:**
- Content shorter than limit → returned unchanged
- Content cut mid-JSON-line → truncated at last `\n` before limit, no broken JSON visible
- Content exactly at limit → no truncation

### C3: Rename compressHistory → truncateHistory

**File:** `core/user_agent/agent.ts`

**Bug (Gemini 94):** `compressHistory()` is just `.slice(-5)` (or similar). The name implies semantic compression (Haiku/BitNet call), which doesn't happen. Misleads developers into assuming smarter compression.

**Fix:** Rename the method to `truncateHistory()` throughout the file and add a comment explaining the current behavior:
```typescript
private truncateHistory(history: ConversationTurn[]): ConversationTurn[] {
  // Simple recency truncation — not semantic compression.
  // TODO: wire to Haiku for summarization when history > N turns.
  return history.slice(-10);
}
```

**Tests:**
- `truncateHistory` keeps at most 10 most recent turns
- Older turns are discarded
- Result is the same turns as before (behavior unchanged, name changed)

---

## Execution Rules

1. **Branch**: `opus-build` only.
2. **Language**: TypeScript for `core/`. Python for `brain/`.
3. **No new npm dependencies.**
4. **All tests green** after each phase.
5. **Phase order**: A → B → C. Complete fully before proceeding.
6. **Do not refactor** code not mentioned in this plan.
7. **Janitor A1**: Try Option A (ts-node CLI) first. Fall back to Option B only if `npx ts-node` fails.

## Verification

```bash
npx tsc --noEmit          # must exit 0
npx jest                  # 174+ tests green
python3 -m pytest test/   # 36+ tests green
```

## Expected Final State

| Phase | Changes | New Tests |
|-------|---------|-----------|
| A: Critical | Janitor unification, rename parsing, SHELL/USER, symlink guard | +8 |
| B: Reliability | Watch concurrency, shell safety, config externalization | +6 |
| C: Quality | Quarantine mode, line-boundary truncation, method rename | +4 |
| **Total** | **~13 files changed** | **+18 tests → ~192 total** |
