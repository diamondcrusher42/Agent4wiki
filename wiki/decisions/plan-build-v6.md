# Build Plan V6 — Registry Fix, OOM Guard, Supply Chain, Soul TTL

> Author: Kevin (agent orchestrator)
> Date: 2026-04-08
> Target: Opus 4.6, fresh session, opus-build branch
> Source reviews: [[review-opus-review92]] + [[review-gemini-review92]]
> Scope: Silent bugs, security hardening, UX polish

## Context

Branch `opus-build` at commit `83e6ba8`. 140 tests (110 Jest + 30 pytest), all green. TSC clean.
Read `wiki/decisions/build-state-2026-04-08-v5.md` for full picture.

**Do NOT touch** `wiki/`, `raw/`, `main` branch, or README.

Run after each phase:
```bash
cd /home/claudebot/clones/agent4wiki-opus-build-<date>
npx tsc --noEmit && npx jest && python3 -m pytest test/
```
All must stay green before proceeding.

---

## Phase A — Critical Silent Bugs (do first)

### A1: cleanupStaleWorktrees() registry format mismatch — CRITICAL

**File:** `core/user_agent/agent.ts`, `cleanupStaleWorktrees()`

**Bug:** `spawner.ts` writes `registry.json` as an **object** keyed by cloneId:
```json
{ "clone-abc": { "id": "clone-abc", "path": "...", "created_at": "..." } }
```
But `cleanupStaleWorktrees()` reads it as an **array**: `data.map(e => e.id || e.taskId)`. This always returns `[]` (empty), so `registeredIds` is always empty → `active_worktrees` is cleared on every startup. Every session restart wipes the running task list.

**Fix:** Parse registry as object and extract keys:
```typescript
const registry = JSON.parse(raw) as Record<string, { id: string }>;
const registeredIds = Object.keys(registry);
```

**Tests:**
- `cleanupStaleWorktrees()` with object-format registry keeps IDs that are registered
- `cleanupStaleWorktrees()` removes IDs not present in the registry
- Empty registry → clears all active_worktrees (existing test should still pass)

### A2: dispatcher.py create_worktree() missing task ID validation

**File:** `brain/dispatcher.py`, `create_worktree()`

**Bug:** `create_worktree()` uses `task['id']` in `git worktree add -b task/${task['id']}` without validation. The B1 fix in `spawner.ts` added `/^[\w-]+$/` validation, but the Python path was missed. Same shell injection vector.

**Fix:** At the top of `create_worktree()`, add:
```python
task_id = task['id']
validate_task_id(task_id)  # already exists — just call it here too
```
`validate_task_id()` already exists from plan-build-v3 A1. Just call it in `create_worktree()` as well.

**Tests (Python):**
- `create_worktree({'id': 'valid-task'})` proceeds normally
- `create_worktree({'id': 'evil; rm -rf /'})` raises `ValueError`

### A3: scanForLeaks() file size OOM guard

**File:** `core/keychain/manager.ts`, `scanForLeaks()`

**Bug:** `fs.readFileSync(resolved, 'utf-8')` on a 2GB file causes Node OOM or `ERR_FS_FILE_TOO_LARGE`. Wrapped in `try/catch { continue }` → silently skips → returns `true` (no leak found). A rogue clone could hide a key in a large file to bypass scanning.

**Fix:** Check file size before reading. Skip files above a threshold and log a warning:
```typescript
const MAX_SCAN_FILE_BYTES = 1 * 1024 * 1024; // 1MB

const stat = fs.statSync(resolved);
if (stat.size > MAX_SCAN_FILE_BYTES) {
  console.warn(`[KEYCHAIN] Skipping large file (${stat.size} bytes): ${resolved}`);
  continue;
}
```

Also skip binary files by extension:
```typescript
const BINARY_EXTENSIONS = new Set(['.png','.jpg','.jpeg','.gif','.ico','.woff','.ttf','.eot','.pdf','.zip','.gz','.tar','.bin','.exe','.dll','.so','.node']);
const ext = path.extname(resolved).toLowerCase();
if (BINARY_EXTENSIONS.has(ext)) continue;
```

**Tests:**
- File over 1MB is skipped with warning (not OOM crashed)
- `.png` file is skipped by extension
- Normal .ts file under 1MB is still scanned

After Phase A: run full suite, confirm green.

---

## Phase B — Security

### B1: scythe.ts getGitMtime() filePath sanitization

**File:** `core/janitor/scythe.ts` (or wherever `getGitMtime()` is defined)

**Bug:** `execSync(\`git log --format=%ct -1 "${filePath}"\`)` — `filePath` is not sanitized. A wiki page named `evil"; rm -rf /"` would execute arbitrary commands.

**Fix:** Validate the filename contains only safe characters before shelling out, OR use the array form of execSync to avoid shell interpretation:
```typescript
import { execFileSync } from 'child_process';

private getGitMtime(filePath: string): Date {
  try {
    const output = execFileSync('git', ['log', '--format=%ct', '-1', filePath], {
      encoding: 'utf-8',
      cwd: this.wikiRoot,
    });
    const epoch = parseInt(output.trim(), 10);
    return isNaN(epoch) ? new Date(0) : new Date(epoch * 1000);
  } catch {
    return new Date(0);
  }
}
```
`execFileSync` (array form) never invokes a shell — arguments are passed directly to the process.

**Tests:**
- `getGitMtime('normal-page.md')` returns a Date
- `getGitMtime('evil"; rm -rf /".md')` does NOT execute the shell command (verify by ensuring no side effect, and that it returns `new Date(0)`)

### B2: setup.sh supply chain hardening

**File:** `setup.sh` (in the clone worktree root, plus any copy in `scripts/`)

**Bug:** `npm install --prefer-offline` still runs post-install scripts. A clone hallucinating (or maliciously writing) a `package.json` with a backdoored dependency could execute arbitrary code on the host machine during install.

**Fix:** Add `--ignore-scripts` flag:
```bash
npm install --prefer-offline --no-audit --no-fund --ignore-scripts
```

**Note:** `--ignore-scripts` may break packages that legitimately require post-install steps (e.g., `better-sqlite3` native bindings). If tests fail, use `npm ci --ignore-scripts` instead and pre-build native deps in the base repo.

**Tests:**
- Full test suite passes after setup.sh change (regression check)

After Phase B: run full suite, confirm green.

---

## Phase C — Quality

### C1: planner.ts JSON parse retry

**File:** `core/brain/planner.ts`, `plan()`

**Bug:** If Haiku returns markdown-wrapped JSON (` ```json\n{...}\n``` `) and the regex stripping fails on an edge case, the JSON.parse throws and crashes. No retry, no fallback.

**Fix:** Add 1 retry with a stricter extraction prompt, then fall back to a default brief:
```typescript
private parseMissionBrief(raw: string): MissionBrief {
  // Try 1: strip markdown fences and parse
  const stripped = raw.replace(/```(?:json)?\n?/g, '').trim();
  try { return JSON.parse(stripped); } catch {}
  
  // Try 2: extract first {...} block
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  
  // Fallback: safe default brief
  console.error('[PLANNER] Failed to parse MissionBrief — using default');
  return {
    objective: raw.slice(0, 200),
    skill: 'code',
    reasoning: 'Failed to parse structured plan — proceeding with raw objective',
    confidence: 0.3,
  };
}
```

**Tests:**
- Markdown-wrapped JSON (`\`\`\`json\n{...}\n\`\`\``) is parsed correctly
- Completely invalid response returns default brief (no throw)
- Valid JSON parses on first try

### C2: loadSoul() TTL cache invalidation

**File:** `core/user_agent/agent.ts`, `loadSoul()`

**Bug:** `soulContent` cached on first load, never invalidated. Soul.md edit during dev requires full agent restart to take effect.

**Fix:**
```typescript
private soulContent: string | null = null;
private soulLoadedAt: number = 0;
private readonly SOUL_TTL_MS = 60_000; // 60 seconds

private loadSoul(): string {
  const now = Date.now();
  if (this.soulContent !== null && (now - this.soulLoadedAt) < this.SOUL_TTL_MS) {
    return this.soulContent;
  }
  // ... existing load logic ...
  this.soulLoadedAt = now;
  return this.soulContent ?? '';
}
```

**Tests:**
- Soul content is re-read after TTL expires (mock Date.now())
- Soul content is cached within TTL (file read only called once for rapid calls)

### C3: routeToBrain() remove double API call

**File:** `core/user_agent/agent.ts`, `routeToBrain()`

**Bug:** Currently calls `planner.plan()` (Haiku → MissionBrief JSON) then throws away the JSON structure and calls Haiku again with `plan.reasoning` as context. Two API calls, double latency, double cost for every BRAIN_ONLY query.

**Fix:** Replace `planner.plan()` call with a single direct Haiku call using Soul.md + wiki context + conversation history:
```typescript
private async routeToBrain(prompt: string): Promise<string> {
  try {
    const soul = this.loadSoul();
    const history = this.conversationHistory.slice(-11, -1).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));
    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: soul || 'You are a helpful assistant.',
      messages: [...history, { role: 'user', content: prompt }],
    });
    return response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  } catch (err) {
    return `I encountered an error: ${(err as Error).message}. Please try again.`;
  }
}
```

**Tests:**
- `routeToBrain()` makes exactly 1 API call (not 2)
- Returns content from Haiku response
- Includes conversation history in the call

---

## Execution Rules

1. **Branch**: `opus-build` only.
2. **Language**: TypeScript for `core/`. Python for `brain/`.
3. **No new npm dependencies.**
4. **All tests green** after each phase.
5. **Phase order**: A → B → C. Complete fully before proceeding.
6. **Do not refactor** code not mentioned in this plan.

## Verification

```bash
npx tsc --noEmit          # must exit 0
npx jest                  # 140+ tests green
python3 -m pytest test/   # 30+ tests green
```

## Expected Final State

| Phase | Changes | New Tests |
|-------|---------|-----------|
| A: Critical | Registry fix, dispatcher validation, OOM guard | +7 |
| B: Security | scythe sanitization, setup.sh --ignore-scripts | +3 |
| C: Quality | Planner retry, soul TTL, routeToBrain single call | +6 |
| **Total** | **~10 files changed** | **+16 tests → ~156 total** |
