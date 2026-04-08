# Build Plan V7 — Vault Leak, Scanner Gaps, Env Allowlist, Brain Differentiation

> Author: Kevin (agent orchestrator)
> Date: 2026-04-08
> Target: Opus 4.6, fresh session, opus-build branch
> Source reviews: [[review-opus-review93]] + [[review-gemini-review93]]
> Scope: Security critical, scanner hardening, architecture quality

## Context

Branch `opus-build` at commit `d9ac4ba`. 157 tests (125 Jest + 32 pytest), all green. TSC clean.
Read `wiki/decisions/build-state-2026-04-08-v6.md` for full picture.

**Do NOT touch** `wiki/`, `raw/`, `main` branch, or README.

Run after each phase:
```bash
cd /home/claudebot/clones/agent4wiki-opus-build-<date>
npx tsc --noEmit && npx jest && python3 -m pytest test/
```
All must stay green before proceeding.

---

## Phase A — Critical Security

### A1: Vault password leak via Python path — CRITICAL

**File:** `brain/dispatcher.py`, `launch_session()`

**Bug:** `launch_session()` passes `os.environ` directly (or a copy) to the subprocess. `buildCloneEnv()` in TypeScript strips `VAULT_MASTER_PASSWORD`, but the Python path does not. Every Python-dispatched clone inherits the vault master password.

**Fix:** Strip sensitive keys before building the subprocess env in Python:
```python
SENSITIVE_ENV_KEYS = {
    'VAULT_MASTER_PASSWORD',
    'ANTHROPIC_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
}

def build_clone_env(extra: dict | None = None) -> dict:
    env = {k: v for k, v in os.environ.items() if k not in SENSITIVE_ENV_KEYS}
    if extra:
        env.update(extra)
    return env
```

Use `build_clone_env(scoped_env)` instead of `os.environ` in `launch_session()`.

**Tests:**
- `build_clone_env()` strips VAULT_MASTER_PASSWORD
- `build_clone_env({'TASK_KEY': 'value'})` preserves injected task-scoped keys
- subprocess launched in `launch_session()` does not receive VAULT_MASTER_PASSWORD

### A2: scanForLeaks() git diff blind spot

**File:** `core/keychain/manager.ts`, `getModifiedFiles()`

**Bug:** Uses `git diff HEAD --name-only` which misses untracked files. A clone writing a secret to a new file (never staged, never committed) bypasses detection entirely.

**Fix:** Replace `git diff HEAD` with `git status --porcelain` which covers both modified AND untracked files:
```typescript
const output = execFileSync('git', ['status', '--porcelain'], {
  encoding: 'utf-8',
  cwd: worktreePath,
});
// Parse lines: "?? newfile.ts", " M modified.ts", "A  staged.ts"
const files = output.split('\n')
  .filter(line => line.trim().length > 0)
  .map(line => line.slice(3).trim()) // strip status prefix
  .filter(f => f.length > 0);
```

**Tests:**
- Untracked file with a secret IS detected (not just modified files)
- Modified file with a secret still detected (regression check)
- Clean worktree returns empty list

### A3: auditor.ts tests_passed undefined false positive

**File:** `core/janitor/auditor.ts`, structural check for missing tests

**Bug:** Check is `handshake.tests_passed !== true` — but if `tests_passed` is `undefined` (field omitted from handshake), `undefined !== true` evaluates to `true`. This creates false SUGGEST directives for tasks that had no tests at all.

**Fix:** Use strict false check:
```typescript
// Before:
handshake.tests_passed !== true
// After:
handshake.tests_passed === false
```
Only flag SUGGEST when tests explicitly failed, not when the field is absent.

**Tests:**
- Handshake with `tests_passed: false` + source files → SUGGEST
- Handshake with `tests_passed: undefined` + source files → not SUGGEST
- Handshake with `tests_passed: true` → not SUGGEST

### A4: 1MB scanner loophole — flag large files for manual review

**File:** `core/keychain/manager.ts`, `scanForLeaks()`

**Bug:** Files over 1MB are silently skipped. A compromised clone can pad a file to 1.1MB to bypass scanner entirely, then hide a secret in a section past the first megabyte.

**Fix:** Instead of silently skipping, add the file to a `largeFilesSkipped` list and include it in the scan result. The Janitor can flag SUGGEST when large files are present:
```typescript
// In scan result:
return {
  clean: noLeaksFound,
  largeFilesSkipped: skippedFiles, // array of paths
};

// In auditor.ts: if result.largeFilesSkipped.length > 0 → add note to janitor_notes
```

Update `ScanResult` interface to include `largeFilesSkipped: string[]`.

**Tests:**
- Scan result includes large file in `largeFilesSkipped` (not silently discarded)
- Janitor notes mention skipped files when present

After Phase A: run full suite, confirm green.

---

## Phase B — Security Hardening

### B1: Clone env allowlist (invert from blacklist)

**File:** `core/clones/clone_worker.ts`, `buildCloneEnv()`

**Current approach:** Copy `process.env` and strip a hardcoded deny-list of 4 keys. Any new secret added to the host env but missed in the list leaks silently.

**Fix:** Invert to allowlist — only pass keys that are explicitly needed:
```typescript
const REQUIRED_ENV_KEYS = ['PATH', 'HOME', 'NODE_ENV', 'TMPDIR', 'LANG', 'LC_ALL'];

function buildCloneEnv(scopedEnv: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  // Allow only safe system keys
  for (const key of REQUIRED_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key]!;
    }
  }
  // Merge task-scoped keys from Keychain
  return { ...env, ...scopedEnv };
}
```

**Tests:**
- `buildCloneEnv()` only contains keys from REQUIRED_ENV_KEYS + scoped keys
- An arbitrary env var on the host (`MY_SECRET=xyz`) is NOT present in clone env
- PATH and HOME are present

### B2: spawner.ts generated setup.sh also needs --ignore-scripts

**File:** `core/clones/lifecycle/spawner.ts` (wherever it writes setup.sh into worktrees)

**Bug:** The B2 fix in plan-build-v6 added `--ignore-scripts` to the root `setup.sh`, but `spawner.ts` generates its own `setup.sh` in each worktree. This generated script may not have the flag.

**Fix:** Find the `npm install` command in the spawner-generated setup.sh template and add `--ignore-scripts --prefer-offline --no-audit --no-fund`.

**Tests:**
- Spawner-generated setup.sh contains `--ignore-scripts` in npm install command

After Phase B: run full suite, confirm green.

---

## Phase C — Architecture Quality

### C1: MAX_RETRIES to shared config

**Files:** `core/clones/clone_worker.ts` + `brain/dispatcher.py`

**Bug:** `MAX_RETRIES = 3` hardcoded in both files independently. If one is changed and the other isn't, circuit breaker behavior diverges between paths.

**Fix:** Create `core/config/clone_config.json`:
```json
{
  "maxRetries": 3,
  "timeoutMs": 300000,
  "watchdogMaxAgeMinutes": 30
}
```

In `clone_worker.ts`: `import cloneConfig from '../config/clone_config.json'` and use `cloneConfig.maxRetries`.

In `dispatcher.py`:
```python
import json
_clone_config = json.load(open(os.path.join(os.path.dirname(__file__), '../core/config/clone_config.json')))
MAX_RETRIES = _clone_config['maxRetries']
```

**Tests:**
- Both TS and Python read MAX_RETRIES from the same file
- Changing the config file value is reflected in both (test by reading and asserting the value)

### C2: Differentiate BRAIN_ONLY from DIRECT

**File:** `core/user_agent/agent.ts`, `routeToBrain()`

**Bug (introduced by plan-build-v6 C3):** After the single-call refactor, `routeToBrain()` and `executeDirect()` are identical except for `max_tokens`. The classifier distinguishes 3 tiers but 2 behave the same. BRAIN_ONLY routing adds no value.

**Fix:** Give BRAIN_ONLY actual differentiation — inject relevant wiki context:
```typescript
private async routeToBrain(prompt: string): Promise<string> {
  try {
    const soul = this.loadSoul();
    // BRAIN_ONLY gets wiki context (DIRECT does not)
    const wikiContext = await this.promptBuilder.loadWikiContext(['concept-routing-classifier', 'segment-brain']);
    const systemPrompt = [soul, wikiContext ? `\n\n## Knowledge\n${wikiContext}` : '']
      .filter(Boolean).join('');
    const history = this.conversationHistory.slice(-11, -1).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));
    const response = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [...history, { role: 'user', content: prompt }],
    });
    return response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  } catch (err) {
    return `I encountered an error: ${(err as Error).message}. Please try again.`;
  }
}
```

**Tests:**
- `routeToBrain()` includes wiki context in system prompt
- `executeDirect()` does NOT include wiki context (remains fast/cheap)

### C3: Wire confidence into execution gating

**File:** `core/clones/clone_worker.ts` OR `core/user_agent/agent.ts`

**Bug:** `MissionBrief.confidence` is set to `0.3` on fallback parse, `0.8` normally — but nothing reads it. A low-confidence plan executes identically to a high-confidence one.

**Fix:** In `triggerFullPipeline()`, check confidence before dispatching:
```typescript
const brief = await this.planner.plan(prompt);
if (brief.confidence < 0.5) {
  return `I'm not confident I understood your request correctly (confidence: ${brief.confidence}). Could you rephrase? Here's what I understood: ${brief.objective}`;
}
// proceed with dispatch
```

**Tests:**
- `confidence: 0.3` brief → returns clarification request, does NOT dispatch clone
- `confidence: 0.8` brief → dispatches normally

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
npx jest                  # 157+ tests green
python3 -m pytest test/   # 32+ tests green
```

## Expected Final State

| Phase | Changes | New Tests |
|-------|---------|-----------|
| A: Critical | Python vault leak, git status scan, tests_passed fix, large file flag | +8 |
| B: Security | Env allowlist, spawner setup.sh fix | +4 |
| C: Quality | MAX_RETRIES config, BRAIN_ONLY wiki, confidence gate | +6 |
| **Total** | **~11 files changed** | **+18 tests → ~175 total** |
