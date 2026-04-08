# Build Plan V4 — Classifier, Janitor Unification, Forge Cost Cap

> Author: Kevin (agent orchestrator)
> Date: 2026-04-08
> Target: Opus 4.6, fresh session, opus-build branch
> Source reviews: [[review-opus-review89]] + [[review-opus-review90]]
> Scope: Correctness, production readiness, cost control

## Context

Branch `opus-build` at commit `3b5513e`. 103 tests (76 Jest + 27 pytest), all green.
Read `wiki/decisions/build-state-2026-04-08-v3.md` for full picture.

**Do NOT touch** `wiki/`, `raw/`, `main` branch, or README.

Run after each phase:
```bash
cd /home/claudebot/clones/agent4wiki-opus-build-<date>
npx tsc --noEmit && npx jest && python3 -m pytest test/
```
All must stay green before proceeding.

---

## Phase A — High Impact (do first)

### A1: 2-pass ComplexityClassifier

**File:** `core/brain/router.ts` (or wherever `ComplexityClassifier` lives)

**Current bug:** Pure regex keyword matching. "clone my recipe collection" → FULL_PIPELINE (keyword: "clone"). "run me through photosynthesis" → FULL_PIPELINE (keyword: "run"). False-positive rate makes the system unusable in production.

**Fix — 2-pass approach:**
```typescript
async classify(input: string): Promise<RouteDecision> {
  const lower = input.toLowerCase();

  // Pass 1: unambiguous fast-path (existing regex — keep as-is)
  if (DIRECT_PATTERNS.some(p => p.test(lower))) return RouteDecision.DIRECT;
  if (FULL_PIPELINE_UNAMBIGUOUS.some(p => p.test(lower))) return RouteDecision.FULL_PIPELINE;

  // Pass 2: ambiguous — ask Haiku
  const response = await this.anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    system: 'Classify the user request. Reply with exactly one word: DIRECT, BRAIN_ONLY, or FULL_PIPELINE.\nDIRECT = simple question or greeting\nBRAIN_ONLY = planning or explanation, no code execution\nFULL_PIPELINE = requires writing files, running code, or using external tools',
    messages: [{ role: 'user', content: input }],
  });
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  return (RouteDecision as any)[text] ?? RouteDecision.BRAIN_ONLY;
}
```

Move the current unambiguous FULL_PIPELINE patterns (e.g. "write a script", "create a file", "implement") to `FULL_PIPELINE_UNAMBIGUOUS`. Everything else falls through to Haiku.

**Tests:**
- "clone my recipe collection" → DIRECT or BRAIN_ONLY (not FULL_PIPELINE)
- "write a Python script to parse CSV" → FULL_PIPELINE
- "hello" → DIRECT
- Haiku returns unexpected value → defaults to BRAIN_ONLY (safe fallback)

### A2: Unify TS/Python Janitor heuristics

**Files:** `core/janitor/auditor.ts` + `brain/dispatcher.py`

**Current bug:** TS Janitor checks for `"temporary"` in janitor_notes, Python checks for `"todo:"`. Same handshake can get SUGGEST from one path and NOTE from the other depending on entry point.

**Fix:** Extract canonical bad-signal list to a shared config file `core/janitor/config/heuristics.json`:
```json
{
  "warn_keywords": ["todo:", "hacky", "tech debt", "temporary", "fragile", "slow", "fixme", "workaround"]
}
```

**In `auditor.ts`:** Load from `heuristics.json` instead of hardcoded string.

**In `dispatcher.py`:** Load same file:
```python
import json, os
_heuristics_path = os.path.join(os.path.dirname(__file__), '../core/janitor/config/heuristics.json')
WARN_KEYWORDS = json.load(open(_heuristics_path))['warn_keywords']
```

**Tests:**
- Both TS and Python evaluate same handshake with "todo: fix later" → both return SUGGEST (not NOTE)
- Both evaluate clean handshake → both return NOTE

### A3: Forge cost cap

**File:** `core/forge/shadow_runner.ts` + `core/forge/config.ts` (or wherever Forge config lives)

**Current bug:** Each shadow run spawns a full CloneWorker.execute() — real worktree, real credentials, real Claude session. Weekly Forge cycle with 10 templates = 10 unbounded Claude sessions.

**Fix:** Add `maxShadowBudgetTokens` to Forge config (default: 50000):
```typescript
// In shadow_runner.ts, before launching variant B:
const currentSpend = await this.metricsDb.getTotalTokensThisCycle();
if (currentSpend + ESTIMATED_TOKENS_PER_RUN > this.config.maxShadowBudgetTokens) {
  console.warn(`[FORGE] Budget cap reached (${currentSpend} tokens). Skipping shadow run.`);
  return null; // evaluator treats null as skip
}
```

Add `getTotalTokensThisCycle()` to `ForgeMetricsDb` — sums `tokens_consumed` from `metrics` table for entries since last cycle reset (daily).

**Tests:**
- Shadow run skipped when budget cap exceeded
- `getTotalTokensThisCycle()` sums correctly across multiple runs

---

## Phase B — Reliability

### B1: Prune active_worktrees from state.json

**File:** `core/user_agent/agent.ts` or wherever `active_worktrees` is written

**Current bug:** `active_worktrees` accumulates every task ID ever dispatched — never pruned. Over time becomes a list of thousands of completed tasks.

**Fix:** After a clone completes (when reading its result from `brain/completed/`), remove its ID from `active_worktrees`:
```typescript
// After reading completed task result:
this.state.active_worktrees = this.state.active_worktrees.filter(id => id !== taskId);
await this.flushState();
```

Also add a startup cleanup: on init, remove any IDs from `active_worktrees` that have no corresponding entry in `state/worktrees/registry.json`.

**Tests:**
- `active_worktrees` shrinks when task completes
- Startup cleanup removes IDs missing from registry

### B2: BrainPlanner Anthropic client singleton

**File:** `core/brain/planner.ts`

**Current bug:** `BrainPlanner.plan()` creates `new Anthropic()` on every call. In a task loop processing dozens of requests, this creates unnecessary overhead.

**Fix:** Move client to constructor:
```typescript
export class BrainPlanner {
  private readonly anthropic: Anthropic;

  constructor(private config: BrainConfig, anthropic?: Anthropic) {
    this.anthropic = anthropic ?? new Anthropic();
  }
}
```

**Tests:**
- Constructor injection works (existing tests should pass)
- Single Anthropic instance reused across multiple `plan()` calls

### B3: triggerFullPipeline try/catch

**File:** `core/user_agent/agent.ts`, `triggerFullPipeline()` method

**Current bug:** No error handling. API failure (network timeout, rate limit, malformed response) crashes the entire user agent process.

**Fix:**
```typescript
private async triggerFullPipeline(prompt: string): Promise<string> {
  try {
    const brief = await this.planner.plan(prompt);
    // ... existing pipeline logic
  } catch (err) {
    console.error('[USER_AGENT] Pipeline error:', err);
    return `I encountered an error processing your request: ${(err as Error).message}. Please try again.`;
  }
}
```

Same pattern for `routeToBrain()`.

**Tests:**
- `triggerFullPipeline` returns error string (not throw) when `planner.plan()` throws
- `routeToBrain` returns error string when plan fails

---

## Phase C — Quality

### C1: exactMatchSecrets population gap + short-secret bypass

**File:** `core/keychain/manager.ts`, `scanForLeaks()` + `initVault()` + `unlockVault()`

**Current bugs (two related issues):**
1. `exactMatchSecrets` only populated by `addSecret()`. Secrets loaded from `.env` during `loadMasterVault()` or decrypted from `vault.enc` during `unlockVault()` are **never added to `exactMatchSecrets`**. The strongest detection layer is empty for all production secrets.
2. `scanForLeaks()` skips secrets shorter than 17 chars — a 16-char API key passes undetected.

**Fix:**
1. In `loadMasterVault()`, `unlockVault()`, and anywhere `.env` values are loaded: call `this.addSecret(key, value)` for each entry so they enter `exactMatchSecrets`
2. Lower the length floor from 17 to 8 characters minimum (below 8 = too many false positives on values like "true", "1234")

**Tests:**
- Secret loaded from `.env` via `loadMasterVault()` IS detected in `scanForLeaks()`
- Secret decrypted from vault via `unlockVault()` IS detected in `scanForLeaks()`
- 12-char secret is detected (previously bypassed by 17-char floor)
- 5-char value ("true", "1234") does NOT trigger false positive

### C2: executeDirect() — inject Soul.md + conversation history

**File:** `core/user_agent/agent.ts`, `executeDirect()`

**Current bug (introduced by plan-build-v3 C1):** `executeDirect()` calls Haiku with a hardcoded generic system prompt. It ignores Soul.md, conversation history, and user state. Users get split-personality UX: simple questions answered by a blank-slate Haiku, complex questions by a fully-contextualized clone.

**Fix:** Load Soul.md content and prepend to system prompt. Pass recent conversation history:
```typescript
private async executeDirect(prompt: string): Promise<string> {
  const soul = this.loadSoul(); // read soul.md + soul-private.md, cached
  const history = this.conversationHistory.slice(-10).map(h => ({
    role: h.role as 'user' | 'assistant',
    content: h.content,
  }));
  const response = await this.anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: soul || 'You are a helpful assistant. Answer directly and concisely.',
    messages: [...history, { role: 'user', content: prompt }],
  });
  return response.content.filter(b => b.type === 'text').map(b => b.text).join('');
}
```

Also fix `routeToBrain()` — currently returns `plan.objective` (echoes back the user's question). Should return `plan.reasoning` or run a Haiku call with the plan as context to produce a proper answer.

**Tests:**
- `executeDirect()` uses Soul.md content as system prompt when available
- `executeDirect()` includes last 10 conversation history entries
- `routeToBrain()` returns reasoning/answer, not the echoed objective

### C4: ShadowRunner tokensConsumed still broken

**File:** `core/forge/shadow_runner.ts`

**Current bug:** Despite the plan-build-v3 C3 fix, `ShadowRunner` still casts to `any` to extract `tokensConsumed`: `(result as any).tokensConsumed || 0`. The `CloneResult` interface was never updated to include this field, so the cast always falls through to 0. The Forge evaluator cannot compare token efficiency — every evaluation is based on zero tokens for both variants.

**Fix:** Add `tokensConsumed` and `filesModified` to the `CloneResult` interface in `core/clones/clone_worker.ts`:
```typescript
export interface CloneResult {
  directive: AuditDirective;
  feedback: string;
  escalate_to_human: boolean;
  retries_used: number;
  tokensConsumed: number;     // ADD
  filesModified: string[];    // ADD
}
```

Populate these from the parsed handshake in `CloneWorker.execute()`. Then remove the `any` cast in `shadow_runner.ts`.

**Tests:**
- `CloneResult` includes `tokensConsumed` field (type check)
- `ShadowRunner` populates `tokensConsumed` from real handshake value (not 0)
- Forge evaluator prompt includes non-zero token counts when handshake reports them

### C5: WikiScythe confirmation gate for archival

**File:** `core/janitor/wiki_scythe.ts`, `runFullAuditCycle()`

**Current bug:** Auto-archives wiki pages with git mtime >90 days with no human confirmation. A stable, correct, untouched reference page gets silently destroyed.

**Fix:** Instead of deleting/archiving directly, write candidates to a `wiki/archive-queue.md` file for human review:
```typescript
// Instead of moving to archive:
const queuePath = path.join(wikiRoot, 'archive-queue.md');
const entry = `- [ ] ${page} (last modified: ${mtime.toISOString()}, age: ${ageDays}d)\n`;
fs.appendFileSync(queuePath, entry);
console.warn(`[SCYTHE] Queued for archival (not yet archived): ${page}`);
```

Actual archival only happens when a human edits `archive-queue.md` and marks items `[x]`. Add a `processArchiveQueue()` method that reads `[x]` items and moves them.

**Tests:**
- Pages older than 90 days appear in `archive-queue.md`, not in `wiki/archive/`
- `processArchiveQueue()` only moves `[x]` marked items

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
npx jest                  # 103+ tests green
python3 -m pytest test/   # 27+ tests green
```

## Expected Final State

| Phase | Changes | New Tests |
|-------|---------|-----------|
| A: High Impact | 2-pass classifier, Janitor unification, Forge cost cap | +8 |
| B: Reliability | active_worktrees prune, client singleton, try/catch | +6 |
| C: Quality | exactMatchSecrets fix, executeDirect Soul.md, WikiScythe gate, ShadowRunner tokens | +9 |
| **Total** | **~13 files changed** | **+23 tests → ~126 total** |
