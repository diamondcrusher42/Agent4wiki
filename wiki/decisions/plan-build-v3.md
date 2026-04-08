# Build Plan V3 — Security Fixes + Quality Improvements

> Author: Kevin (agent orchestrator)
> Date: 2026-04-08
> Target: Opus 4.6, fresh session, opus-build branch
> Source reviews: [[review-gemini-review88]] + [[review-opus-review88]]
> Scope: Security fixes, quality improvements, no new features

## Context

Branch `opus-build` at commit `2960b4d`. 84 tests, all green. Read `wiki/decisions/build-state-2026-04-08-phase57.md` for full picture.

**Do NOT touch** `wiki/`, `raw/`, `main` branch, or README.

Run after each phase:
```bash
cd /home/claudebot/clones/agent4wiki-opus-build-20260408
npx tsc --noEmit && npx jest && python3 -m pytest test/
```
All must stay green before proceeding.

---

## Phase A — Critical Security Fixes (do these first, together)

### A1: SSH Injection in dispatch_remote() — CRITICAL

**File:** `brain/dispatcher.py`, function `dispatch_remote()` (~line 97)

**Current bug:**
```python
task_json = json.dumps(task)
ssh_cmd = [..., f"echo '{task_json}' > ~/agent4/brain/inbox/{task['id']}.json"]
```
A single quote in `task_json` breaks the shell command. An adversarial objective can execute arbitrary commands on the remote node.

**Fix:** Write task JSON to a local temp file, then `scp` it to the remote node:
```python
import tempfile, shlex

def dispatch_remote(task: dict, node: dict) -> dict:
    task_id = task['id']
    
    # Write to temp file — no shell escaping needed
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(task, f)
        tmp_path = f.name
    
    try:
        remote_inbox = f"{node['user']}@{node['host']}:~/agent4/brain/inbox/{task_id}.json"
        subprocess.run(["scp", "-i", node["ssh_key"], tmp_path, remote_inbox],
                       check=True, timeout=15)
    finally:
        os.unlink(tmp_path)
    
    # Poll for result (unchanged)
    ...
```

Also: validate `task['id']` contains only alphanumeric/dash chars before using in path — `re.match(r'^[\w-]+$', task_id)`.

**Tests:** Add to `test/test_dispatcher.py`:
- Task with single quotes in objective does not cause SSH error
- Task ID with special chars raises ValueError

### A2: VAULT_MASTER_PASSWORD leaked to clone process — CRITICAL

**File:** `core/clones/clone_worker.ts`

**Current bug:** `CloneRunner.run()` passes `process.env` to the spawned `claude` subprocess. This includes `VAULT_MASTER_PASSWORD`, giving every clone the ability to decrypt the entire vault.

**Fix:** Strip sensitive keys before passing env to clone. Add this helper to `clone_worker.ts`:
```typescript
const SENSITIVE_ENV_KEYS = [
  'VAULT_MASTER_PASSWORD',
  'ANTHROPIC_API_KEY',  // injected per-task via keychain, not globally
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
];

function buildCloneEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !SENSITIVE_ENV_KEYS.includes(k)) {
      env[k] = v;
    }
  }
  return env;
}
```

Pass `buildCloneEnv()` instead of `process.env` wherever the claude subprocess is spawned. Find the spawn call in `core/clones/lifecycle/` (the runner that calls `claude --print`).

**Tests:** Add to `test/clone-lifecycle.test.ts`:
- `buildCloneEnv()` strips VAULT_MASTER_PASSWORD
- `buildCloneEnv()` preserves non-sensitive keys (PATH, HOME)

### A3: noLeaks result ignored — HIGH

**File:** `core/clones/clone_worker.ts` (~line 73)

**Current bug:**
```typescript
const noLeaks = await this.keychain.revokeEnvironment(handle.path);
if (!noLeaks) {
  console.error(`[CLONE_WORKER] SECURITY: Credential leak detected...`);
  // BUG: execution continues, handshake is returned normally
}
```

**Fix:** When a leak is detected, override the handshake to BLOCK before returning:
```typescript
const noLeaks = await this.keychain.revokeEnvironment(handle.path);
if (!noLeaks) {
  console.error(`[CLONE_WORKER] SECURITY: Credential leak detected in ${handle.path} — forcing BLOCK`);
  return {
    directive: AuditDirective.BLOCK,
    feedback: 'SECURITY HALT: Credential leak detected in worktree after revoke. Task output discarded.',
    escalate_to_human: true,
    retries_used: retries,
  };
}
```
Place this check immediately after the `finally` block, before calling `this.janitor.evaluateMission()`.

**Tests:** Add to `test/keychain.test.ts`:
- When `revokeEnvironment()` returns false, `execute()` returns BLOCK directive

---

## Phase B — Reliability Fixes

### B1: File-based handshake (eliminates fragile stdout parsing)

**Files:** `core/clones/lifecycle/runner.ts` (or wherever `claude --print` is called) + `brain/dispatcher.py`

**Current problem:** Both the TS runner and Python dispatcher try to parse JSON from the claude CLI's stdout. Debug logs after the JSON break parsing. Regex fallback `r'\{[^{}]*"status"[^{}]*\}'` can't handle nested JSON.

**Fix — TS side:** After running the clone, write the handshake to a dedicated file:
```typescript
// In runner: after executing claude session, write parsed handshake to file
const handshakePath = path.join(process.cwd(), 'state', 'handshakes', `${cloneId}.json`);
fs.mkdirSync(path.dirname(handshakePath), { recursive: true });
fs.writeFileSync(handshakePath, JSON.stringify(handshake));
```

**Fix — Python side:** In `execute_task()`, after the clone completes, read from the handshake file instead of parsing stdout:
```python
handshake_path = f"state/handshakes/{task_id}.json"
if os.path.exists(handshake_path):
    with open(handshake_path) as f:
        handshake = json.load(f)
    os.unlink(handshake_path)  # clean up
else:
    # fallback to stdout parsing (keep existing logic as backup)
```

Clean up `state/handshakes/` in teardown.

**Tests:**
- Runner writes handshake JSON to correct path
- Dispatcher reads from file when present, falls back to stdout when not

### B2: Replace hand-rolled YAML parsers with js-yaml + PyYAML

**Files:** `core/keychain/manager.ts` (patterns.yaml, scopes.yaml) + `brain/dispatcher.py`

Add `js-yaml` to `package.json` dependencies. It's already likely installed (check `node_modules/`); if not, `npm install js-yaml @types/js-yaml`.

**In manager.ts**, find the hand-rolled YAML readers for `patterns.yaml` and `scopes.yaml` (`getScopeKeys()` ~line 200, `scanForLeaks()` ~line 238). Replace with:
```typescript
import yaml from 'js-yaml';
// ...
const raw = fs.readFileSync(yamlPath, 'utf-8');
const parsed = yaml.load(raw) as Record<string, any>;
```

**In dispatcher.py**, if any YAML is read: `import yaml` (PyYAML — already in stdlib-adjacent, or `pip install pyyaml`). Replace line-by-line parsing with `yaml.safe_load(f)`.

**Tests:**
- `getScopeKeys('code')` returns correct keys from a multi-line YAML with comments
- `scanForLeaks()` loads patterns correctly from YAML with nested structure

### B3: getModifiedFiles() fallback scans subdirectories

**File:** `core/keychain/manager.ts`, `getModifiedFiles()` (~line 310)

**Current bug:** Fallback (when git not available) only scans top-level files — leaks in `src/deep/file.ts` go undetected.

**Fix:** Replace `fs.readdirSync(worktreePath)` with a recursive walk:
```typescript
private getAllFilesRecursive(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      files.push(...this.getAllFilesRecursive(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}
```

**Tests:**
- `getModifiedFiles()` fallback finds a file nested 3 directories deep

### B3b: loadWikiContext() misses wiki subdirectories

**File:** `core/brain/prompt_builder.ts`, `loadWikiContext()` (~line where wiki pages are loaded)

**Current bug:** Looks for wiki pages at `wiki/${pageName}.md` only — silently misses pages in `wiki/decisions/`, `wiki/segments/`, `wiki/concepts/` etc. Clones receive empty wiki context for most domain knowledge pages.

**Fix:** Replace direct path lookup with a recursive search:
```typescript
private findWikiPage(pageName: string): string | null {
  const wikiRoot = path.join(process.cwd(), 'wiki');
  return this.findFileRecursive(wikiRoot, `${pageName}.md`);
}

private findFileRecursive(dir: string, filename: string): string | null {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = this.findFileRecursive(full, filename);
      if (found) return found;
    } else if (entry.name === filename) {
      return full;
    }
  }
  return null;
}
```

Replace any `wiki/${pageName}.md` path construction with `this.findWikiPage(pageName)`.

**Tests:**
- `loadWikiContext(['segment-brain'])` finds `wiki/segments/segment-brain.md` correctly
- `loadWikiContext(['nonexistent'])` returns empty string without throwing

### B4: Orphaned worktree watchdog

**New file:** `core/clones/watchdog.ts`

Problem: OOM or SIGKILL kills the Node process. `try/finally` doesn't run. `.env` files sit on orphaned worktrees with credentials.

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { CloneTeardown } from './lifecycle/teardown';
import { AuditDirective } from '../janitor/auditor';

const REGISTRY_PATH = 'state/worktrees/registry.json';
const MAX_AGE_MINUTES = 30;

export async function runWatchdog(): Promise<void> {
  if (!fs.existsSync(REGISTRY_PATH)) return;
  
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')) as Record<string, { created_at: string; path: string }>;
  const now = Date.now();
  const teardown = new CloneTeardown();
  
  for (const [cloneId, entry] of Object.entries(registry)) {
    const age = (now - new Date(entry.created_at).getTime()) / 60000;
    if (age > MAX_AGE_MINUTES) {
      console.warn(`[WATCHDOG] Stale worktree ${cloneId} (${age.toFixed(0)}min) — forcing teardown`);
      try {
        await teardown.teardown({ id: cloneId, path: entry.path }, AuditDirective.BLOCK);
      } catch (err) {
        console.error(`[WATCHDOG] Teardown failed for ${cloneId}: ${err}`);
        // Still try to delete .env directly
        const envPath = path.join(entry.path, '.env');
        if (fs.existsSync(envPath)) {
          fs.unlinkSync(envPath);
          console.warn(`[WATCHDOG] Force-deleted .env from ${entry.path}`);
        }
      }
    }
  }
}

// Run if invoked directly (from cron or CLI)
if (require.main === module) {
  runWatchdog().catch(console.error);
}
```

Also add a cron entry to `scripts/` or document in README that this must run every 5 minutes:
```
*/5 * * * * node /path/to/core/clones/watchdog.ts >> /var/log/agent4-watchdog.log 2>&1
```

**Tests:**
- Watchdog identifies worktrees older than MAX_AGE_MINUTES
- Watchdog force-deletes .env when teardown fails

---

## Phase C — Quality Improvements

### C1: Wire executeDirect() to real Anthropic API call

**File:** `core/user_agent/agent.ts` (~line 70)

**Current:**
```typescript
private async executeDirect(prompt: string): Promise<string> {
  return "Direct response placeholder";
}
```

**Fix:** Call the Anthropic API directly with Haiku (zero-cost, fast):
```typescript
private async executeDirect(prompt: string): Promise<string> {
  const response = await this.anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: 'You are a helpful assistant. Answer directly and concisely.',
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content.filter(b => b.type === 'text').map(b => b.text).join('');
}
```

Inject `Anthropic` client in constructor (already imported in the file).

Also fix `routeToBrain()` — wake a Brain session with L0 MemPalace context + prompt, without spawning a clone. Use `BrainPlanner.plan()` output as the response for now.

**Tests:**
- `executeDirect()` calls `anthropic.messages.create` with haiku model
- Response is returned as string (mock the client)

### C2: conversationHistory size limit

**File:** `core/user_agent/agent.ts`

**Current:** `conversationHistory: any[]` — unbounded, lost on crash.

**Fix:**
```typescript
private readonly MAX_HISTORY_ENTRIES = 50;

// After pushing to history:
if (this.conversationHistory.length > this.MAX_HISTORY_ENTRIES) {
  this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY_ENTRIES);
}
```

Also add token-based flush trigger (from plan-build-v2 edge case):
```typescript
private readonly TOKEN_FLUSH_THRESHOLD = 4000;
// Estimate tokens: rough ~4 chars per token
const estimatedTokens = this.conversationHistory
  .map(h => (h.content || '').length / 4)
  .reduce((a, b) => a + b, 0);
if (estimatedTokens > this.TOKEN_FLUSH_THRESHOLD) {
  await this.flushState();
}
```

**Tests:**
- History is truncated at MAX_HISTORY_ENTRIES
- flushState() is called when estimated tokens exceed threshold

### C3: Forge evaluator compares real output

**File:** `core/forge/evaluator.ts`

**Current problem:** Evaluator prompt only shows token counts + janitor notes. `ShadowRunner` sets `tokensConsumed: 0`. Evaluator can't assess correctness.

**Fix 1 — ShadowRunner must capture real metrics:**
In `shadow_runner.ts`, the `CloneWorker.execute()` result includes the handshake. Extract `tokens_consumed` and `files_modified` from the handshake and populate `ShadowResult`:
```typescript
shadowResult.tokensConsumed = result.tokensConsumed || 0;
shadowResult.filesModified = result.filesModified || [];
```
(Add these fields to `ShadowResult` interface.)

**Fix 2 — Evaluator prompt includes code diff:**
Add `codePreview` field to `ShadowResult`: a truncated git diff (max 500 chars) of what the clone produced:
```typescript
// In ShadowRunner, after run:
const diffOutput = execSync(`git -C ${shadowBrief.worktreePath} diff HEAD --stat`, { encoding: 'utf-8' });
shadowResult.codePreview = diffOutput.slice(0, 500);
```

Update evaluator prompt to include `codePreview` for both variants.

**Fix 3 — Ratchet fake handshake:** Replace the synthetic `testHandshake` in `promote()` with a real test: read the most recent `forge/events.jsonl` evaluation result and use that as evidence instead of manufacturing a fake NOTE.

**Tests:**
- `ShadowRunner` populates `tokensConsumed` from handshake (not 0)
- Evaluator prompt includes `codePreview` field
- Ratchet reads real forge events instead of fake handshake

---

## Execution Rules

1. **Branch**: `opus-build` only. Never commit to `main`.
2. **Language**: TypeScript for `core/`. Python for `brain/dispatcher.py`.
3. **No new npm dependencies** except `js-yaml` (and `@types/js-yaml`).
4. **All tests must stay green** after each phase. Run full suite.
5. **Phase order**: A (security) → B (reliability) → C (quality). Do not skip ahead.
6. **Staged output**: complete Phase A fully (all 3 fixes + tests passing) before starting Phase B.
7. Do not refactor code not mentioned in this plan.

## Verification

```bash
npx tsc --noEmit          # must exit 0
npx jest                  # 84+ tests green
python3 -m pytest test/   # 23+ tests green
```

## Expected Final State

| Phase | Changes | New Tests |
|-------|---------|-----------|
| A: Security | SSH fix, env strip, noLeaks block | +5 |
| B: Reliability | File handshake, js-yaml, recursive scan, wiki path fix, watchdog | +10 |
| C: Quality | executeDirect, history limit, Forge metrics | +5 |
| **Total** | **11 files changed** | **+20 tests → 104 total** |
