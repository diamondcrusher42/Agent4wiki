# Build Plan V5 — Forge Fix, Context Safety, Security Hardening

> Author: Kevin (agent orchestrator)
> Date: 2026-04-08
> Target: Opus 4.6, fresh session, opus-build branch
> Source reviews: [[review-opus-review91]] + [[review-gemini-review91]]
> Scope: Critical bug fixes, security hardening, context safety

## Context

Branch `opus-build` at commit `af40e52`. 126 tests (96 Jest + 30 pytest), all green. TSC clean.
Read `wiki/decisions/build-state-2026-04-08-v4.md` for full picture.

**Do NOT touch** `wiki/`, `raw/`, `main` branch, or README.

Run after each phase:
```bash
cd /home/claudebot/clones/agent4wiki-opus-build-<date>
npx tsc --noEmit && npx jest && python3 -m pytest test/
```
All must stay green before proceeding.

---

## Phase A — Critical Fixes (do first)

### A1: Forge budget table disconnect — CRITICAL

**File:** `core/forge/shadow_runner.ts` + `core/forge/metrics_db.ts`

**Bug:** `getTotalTokensThisCycle()` reads the `metrics` table. But `ShadowRunner` writes to `events.jsonl`, not `metrics`. Budget cap never increments — cost control is illusory.

**Fix:** After each shadow run completes, insert a row into the `metrics` table so the budget system sees it:
```typescript
// In ShadowRunner, after shadow run completes (before null check):
await this.metricsDb.recordMetric({
  run_id: `shadow-${Date.now()}`,
  tokens_consumed: shadowResult.tokensConsumed,
  duration_ms: shadowResult.durationMs,
  model: 'shadow',
  task_type: 'shadow_run',
});
```
Verify `ForgeMetricsDb` has a `recordMetric()` method. If not, add it (insert into `metrics` table).

**Tests:**
- After a shadow run, `getTotalTokensThisCycle()` returns the tokens consumed (not still 0)
- Budget cap blocks second shadow run when first consumed enough tokens

### A2: executeDirect() duplicate message

**File:** `core/user_agent/agent.ts`, `executeDirect()`

**Bug:** `handleUserInput()` pushes the user prompt to `conversationHistory`, then `executeDirect()` slices the last 10 entries (including current prompt) AND appends the same prompt as the explicit final message. The user's message appears twice. Wastes tokens, may confuse the model.

**Fix:** Slice history excluding the last entry (the current turn), then let the explicit `messages` param be the canonical final message:
```typescript
// Use slice(-11, -1) to get the 10 entries BEFORE the current one
const history = this.conversationHistory.slice(-11, -1).map(h => ({
  role: h.role as 'user' | 'assistant',
  content: h.content,
}));
```

**Tests:**
- `executeDirect("hello")` with 5-entry history → API called with 5 history entries + 1 explicit message (not 6 + 1)
- User message does NOT appear twice in the messages array

### A3: routeToBrain() missing conversation history

**File:** `core/user_agent/agent.ts`, `routeToBrain()`

**Bug:** `executeDirect()` passes last 10 history entries to Haiku. `routeToBrain()` only passes a single `contextPrompt` with the plan reasoning. User asking "explain what I just described" in BRAIN_ONLY mode has zero prior context.

**Fix:** Apply the same history injection as `executeDirect()` — pass the last 10 turns (excluding current) in the messages array before the final question:
```typescript
const history = this.conversationHistory.slice(-11, -1).map(h => ({
  role: h.role as 'user' | 'assistant',
  content: h.content,
}));
// Include history in messages: [...history, { role: 'user', content: contextPrompt }]
```

**Tests:**
- `routeToBrain()` includes conversation history in API call
- Context-dependent query ("explain what I just described") receives prior turns

---

## Phase B — Security

### B1: spawner.ts cloneId validation

**File:** `core/clones/lifecycle/spawner.ts` (or wherever `createWorktree()` lives)

**Bug:** `cloneId` used directly in `execSync(\`git worktree add "${worktreePath}" -b "${branch}"\`)` without validation. Dispatcher validates `task_id`, but spawner trusts its caller. Shell metacharacters in cloneId = arbitrary command execution.

**Fix:** Add at the top of `createWorktree()`:
```typescript
if (!/^[\w-]+$/.test(cloneId)) {
  throw new Error(`[SPAWNER] Invalid cloneId "${cloneId}" — must match ^[\\w-]+$`);
}
```

**Tests:**
- `createWorktree("valid-clone-id")` proceeds normally
- `createWorktree("evil; rm -rf /")` throws Error without executing the shell command
- `createWorktree("../path-traversal")` throws Error

### B2: loadWikiContext() total budget cap

**File:** `core/brain/prompt_builder.ts`, `loadWikiContext()`

**Bug:** Individual files truncated to 800 chars per page, but no cap on total pages. 30 pages × 800 chars = 24,000 chars — blows the context window silently.

**Fix:** Add cumulative budget counter:
```typescript
const MAX_TOTAL_CHARS = 2000; // ~500 tokens
let totalChars = 0;

for (const pageName of requestedPages) {
  const filePath = this.findWikiPage(pageName);
  if (!filePath) continue;
  const content = fs.readFileSync(filePath, 'utf-8');
  const excerpt = content.slice(0, 800);
  if (totalChars + excerpt.length > MAX_TOTAL_CHARS) {
    console.warn(`[PROMPT_BUILDER] Wiki budget reached at ${pageName} — truncating context`);
    break;
  }
  sections.push(`## ${pageName}\n${excerpt}`);
  totalChars += excerpt.length;
}
```

**Tests:**
- Requesting 30 pages returns content capped at MAX_TOTAL_CHARS, not 30 × 800
- Warning is logged when budget is hit
- Requesting 2 pages under budget returns both in full

---

## Phase C — Quality

### C1: promote() event type filtering

**File:** `core/forge/ratchet.ts`, `promote()`

**Bug:** Reads last line of `events.jsonl` without type filtering. Could be a `shadow_result` with `directive: "BLOCK"` or any other event type — used as promotion evidence.

**Fix:** Parse the file and filter for the most recent event with `type === "evaluation"`:
```typescript
const lines = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n');
const evaluationEvent = lines
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean)
  .reverse()
  .find(e => e.type === 'evaluation');

if (!evaluationEvent) {
  throw new Error('[RATCHET] No evaluation event found in events.jsonl — cannot promote');
}
```

**Tests:**
- `promote()` uses evaluation event, not shadow_result
- `promote()` throws when events.jsonl contains only shadow_result entries

### C2: setup.sh dependency caching

**File:** `core/clones/lifecycle/spawner.ts` and/or `scripts/setup.sh`

**Bug:** Every clone worktree runs full `npm install` + `pip install`. Three parallel clones = 3× disk I/O for identical deps.

**Fix option A (spawner.ts):** After `git worktree add`, copy deps from parent:
```typescript
const baseNodeModules = path.join(baseRepoPath, 'node_modules');
const cloneNodeModules = path.join(worktreePath, 'node_modules');
if (fs.existsSync(baseNodeModules)) {
  execSync(`cp -r "${baseNodeModules}" "${cloneNodeModules}"`);
}
```

**Fix option B (setup.sh, simpler):** Replace `npm install` with `npm install --prefer-offline --no-audit --no-fund`. Keep pip install but add `--no-deps` if packages are already installed in the venv.

Implement option B as it's lower risk (no path assumptions).

**Tests:**
- setup.sh completes faster when node_modules already cached (manual verification note in test comment is acceptable)
- No regression: test suite passes after setup.sh change

### C3: exactMatchSecrets deduplication + dispatcher.py file handle

**File:** `core/keychain/manager.ts` + `brain/dispatcher.py`

**Bug 1:** `exactMatchSecrets` is a `string[]` — duplicates accumulate when a secret appears in both `.env` and vault. Each duplicate doubles scan work.

**Fix 1:** Change `exactMatchSecrets` from `string[]` to `Set<string>`. Update `addSecret()` to call `.add()` instead of `.push()`. Update `scanForLeaks()` to iterate with `this.exactMatchSecrets.forEach(...)`.

**Bug 2:** `dispatcher.py` opens `heuristics.json` without closing: `_json_h.load(open(_HEURISTICS_PATH))`. File handle leaks.

**Fix 2:**
```python
with open(_HEURISTICS_PATH) as f:
    WARN_KEYWORDS = _json_h.load(f)['warn_keywords']
```

**Tests:**
- Adding same secret twice results in single entry in exactMatchSecrets
- scanForLeaks() still detects the secret after deduplication

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
npx jest                  # 126+ tests green
python3 -m pytest test/   # 30+ tests green
```

## Expected Final State

| Phase | Changes | New Tests |
|-------|---------|-----------|
| A: Critical | Forge budget fix, duplicate message, routeToBrain history | +6 |
| B: Security | spawner validation, wiki budget cap | +5 |
| C: Quality | promote() filter, setup.sh cache, exactMatchSecrets dedup, py file handle | +4 |
| **Total** | **~9 files changed** | **+15 tests → ~141 total** |
