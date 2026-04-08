# Opus Review 91 — Full 5-Perspective Code Review (Post plan-build-v4)

> Date: 2026-04-08
> Model: Opus 4.6 (5-role structured review)
> Codebase: agent4wiki-repomix-v4.xml (post plan-build-v4 fixes applied)
> Scores: Security 7/10 | Reliability 7/10 | Test Coverage 6.5/10 | Architecture 7.5/10 | Production Readiness 5.5/10

---

## 🧠 Brain (Planner + Router + PromptBuilder)

### Good
- **A1 classifier rewrite is the single biggest improvement across v3→v4.** 2-pass architecture: hardcoded regex for unambiguous DIRECT/FULL_PIPELINE, Haiku fallback for everything ambiguous. The old substring-match false positives ("run", "test", "clone") are gone.
- Classifier system prompt is well-constrained: one-word reply, clear definitions, "when in doubt prefer BRAIN_ONLY" — conservative routing prevents expensive FULL_PIPELINE misroutes.
- **BrainPlanner now accepts injected `Anthropic` client** (B2 fix). Singleton pattern shared across UserAgent, Classifier, and Planner. No more per-call instantiation.
- `routeToBrain()` now produces a real answer: plans first, then uses reasoning as context for a Haiku answer call. No longer echoes the objective back.
- `loadSoul()` caching via `this.soulContent` — reads Soul.md once, reuses for all subsequent calls.

### Bad
- **Classifier Haiku fallback has no caching or deduplication.** If a user sends the same message twice (common in Telegram with connection retries), two Haiku calls fire. A simple LRU cache (last 20 classifications, TTL 60s) would eliminate duplicate API calls.
- **`routeToBrain()` makes TWO API calls** for every BRAIN_ONLY request: one `planner.plan()` (Haiku) + one answer generation (Haiku). The planning call produces a MissionBrief JSON — structured output designed for the clone pipeline, not for answering questions. For BRAIN_ONLY, the planner step is wasted work. A single Haiku call with Soul.md + wiki context would be faster, cheaper, and produce better answers.
- `loadWikiContext()` in `prompt_builder.ts` still has no token budget enforcement. The 500-token budget exists only in a comment. A wiki with 50 pages will exceed any reasonable context window.
- **`confidence` field removed from `MissionBrief`** — good cleanup, but `ThinkingResult.confidence` still exists and is always `0.8`. Dead field persists one level up.

### Ugly
- **FULL_PIPELINE_UNAMBIGUOUS regex can still false-positive on quoted text.** User says: `"My friend told me to 'build a script' but I don't know what that means"` → FULL_PIPELINE (matches `build a script`). The regex has no awareness of quotation or hypothetical framing. The Haiku fallback would handle this correctly, but Pass 1 intercepts first.
- The classifier is now `async` (returns `Promise<TaskComplexity>`), which was a breaking change — every call site needed updating. This was handled correctly in `agent.ts`, but any future caller must remember to `await` it.

### Untested
- No test for classifier caching/deduplication (because it doesn't exist).
- No test for `routeToBrain()` producing a *good* answer — tests only verify it doesn't throw and returns a string. No quality assertion.
- No test for `loadWikiContext()` exceeding token budget.
- No test for quoted/hypothetical text in Pass 1 regexes.
- No test for `classify()` latency — if Haiku is slow (>2s), the user waits with no feedback.

---

## 👤 User Agent

### Good
- **`conversationHistory` is now typed:** `Array<{role: string; content: string; timestamp: string}>`. The `any[]` is gone. Compile-time safety restored.
- **`executeDirect()` now loads Soul.md + last 10 conversation history entries.** Users get consistent personality across DIRECT and BRAIN_ONLY paths. The split-personality UX is fixed.
- **`triggerFullPipeline()` has try/catch** (B3 fix). API failures return a user-facing error message instead of crashing the process. Same for `routeToBrain()` and `executeDirect()`.
- **`active_worktrees` cleanup:** `cleanupStaleWorktrees()` runs on startup, removes IDs not in registry.json. `removeCompletedWorktree()` removes individual IDs when tasks complete. The unbounded growth is fixed.
- Single `Anthropic` client shared across UserAgent → Classifier → Planner. Clean dependency injection chain.

### Bad
- **`loadSoul()` caches forever.** If Soul.md is edited while the agent is running (common during development), the agent serves stale personality until restart. Should cache with a TTL (60s) or check mtime.
- **`executeDirect()` passes the raw `prompt` as the last message** but also has it in `conversationHistory` (pushed earlier in `handleUserInput()`). The history slice includes the current prompt, and then `prompt` is appended again as the final message. **The user's message appears twice** in the API call — once in history, once as the explicit final message. This wastes tokens and may confuse the model.
- `cleanupStaleWorktrees()` parses `registry.json` with `data.map((e: any) => e.id || e.taskId || '')` — the `any` cast means this silently returns empty strings for any schema mismatch. If the registry format changes, cleanup stops working silently.
- Error messages from catch blocks expose internal error details to the user: `"I encountered an error processing your request: Cannot read properties of undefined (reading 'content')"`. Should sanitize.

### Ugly
- **`routeToBrain()` doesn't pass conversation history.** `executeDirect()` includes the last 10 turns, but `routeToBrain()` only passes the single `contextPrompt`. A user asking "explain what I just described" in BRAIN_ONLY mode has no prior context. The two paths have different context awareness — a subtler version of the split-personality bug.
- `compressHistory()` comment still references "BitNet 2B local model" — aspirational architecture documented as real. Misleading breadcrumb for any new contributor.

### Untested
- No test for the duplicate-message bug in `executeDirect()` (prompt appearing in both history and explicit message).
- No test for `routeToBrain()` with conversation history (because it doesn't use it).
- No test for `loadSoul()` cache invalidation (because there is none).
- No test for `cleanupStaleWorktrees()` with a malformed registry.json.
- No test for `handleUserInput()` end-to-end with all three routes exercised in sequence.

---

## 🧬 Clone (Lifecycle: Spawner → Runner → Teardown)

### Good
- **`CloneResult` interface now includes `tokensConsumed` and `filesModified`** (C4 fix). ShadowRunner reads these directly — no more `(result as any)` cast. Type safety restored across the Forge pipeline.
- `buildCloneEnv()` remains solid — strips sensitive keys, tested, no regressions.
- Watchdog still in place, scanning for stale worktrees >30min.
- File-based handshake (B1 from v3) still operational as primary parse path.

### Bad
- **`spawner.ts` still doesn't validate `cloneId`** before using it in `execSync(\`git worktree add "${worktreePath}" -b "${branch}"\`)`. A malicious or buggy task ID containing shell metacharacters (`; rm -rf /`) would execute arbitrary commands. The dispatcher validates `task_id` with `validate_task_id()`, but the spawner trusts its caller. Defense-in-depth demands validation at the point of use.
- **`setup.sh` still runs `npm install` + `pip install` in every worktree** — no `--prefer-offline`, no shared cache. Three parallel clones = three thrashing disk I/O installs.
- `parseHandshake()` stdout fallback still breaks on multi-line (pretty-printed) JSON. The file-based handshake is the primary path now, but the fallback is still the safety net for edge cases.
- **Watchdog `MAX_AGE_MINUTES = 30` is still hardcoded.** A legitimate long-running clone (complex refactor, 60min timeout in brief) gets killed. The watchdog should respect the task's `timeoutMinutes`.

### Ugly
- **Python `dispatcher.py` is still a 33KB monolith.** It reimplements worktree creation, handshake extraction, and the full clone lifecycle independently of the TS `CloneWorker`. The A2 heuristic unification (shared `heuristics.json`) partially addresses the janitor divergence, but the *structural* duplication remains. Two complete implementations of the same workflow, maintained in different languages, with subtle behavioral differences beyond just warn keywords.

### Untested
- No integration test for the full clone lifecycle (spawner → runner → janitor → teardown → worktree removal from active_worktrees).
- No test for `cloneId` injection in spawner.
- No test for parallel clone execution (race conditions in registry.json concurrent writes).
- No test for watchdog vs. long-running legitimate clones.
- No test for `dispatcher.py` reading `heuristics.json` from the correct path relative to its own location (path resolution depends on `__file__`).

---

## 🔥 Forge (Shadow Runner → Evaluator → Ratchet)

### Good
- **A3 cost cap landed.** `ShadowRunner` checks `getTotalTokensThisCycle()` against `maxShadowBudgetTokens` (default 50000) before launching variant B. Budget exceeded → returns `null` → evaluator skips. No more unbounded spend.
- **`getTotalTokensThisCycle()`** sums from `metrics` table since midnight UTC. Clean daily reset without explicit cycle management.
- **C4 fix landed.** `ShadowRunner` reads `result.tokensConsumed` directly from `CloneResult` — no `any` cast, no fallback to 0. Token tracking is real.
- `ShadowRunner` constructor accepts optional `metricsDb` and `maxBudgetTokens` — injectable for testing, configurable for production.

### Bad
- **Budget cap uses `ESTIMATED_TOKENS_PER_RUN = 5000` as a static constant.** If real runs consume 20000 tokens, the budget allows 10 runs (50000/5000) but only 2.5 runs would fit. The estimate should be derived from recent `metrics` table averages, not hardcoded.
- **`promote()` still reads last line of `events.jsonl`** without type filtering. A `shadow_result` event with `directive: "BLOCK"` could be used as promotion evidence. Should filter for `type: "evaluation"` events only.
- **Ratchet creates a new `Janitor()` instance** inside `promote()` instead of receiving one via constructor injection. This bypasses any configuration the main Janitor instance has, and creates a fresh instance that may or may not load `heuristics.json` correctly depending on working directory.
- `ForgeEvaluator` still uses `claude-sonnet-4-6` for every judgment. No fallback to Haiku for trivially clear outcomes (e.g., one variant BLOCKED, the other NOTE).

### Ugly
- **Token budget counts from `metrics` table, but shadow runs write to `events.jsonl` — not to `metrics`.** The `ShadowRunner` writes a `shadow_result` record to `events.jsonl` with `tokensConsumed`, but `getTotalTokensThisCycle()` queries the `metrics` table. Unless someone inserts into `metrics` during the shadow run, **the budget cap never increments and is effectively disabled.** Shadow tokens are invisible to the budget system.
- This means the cost cap is **structurally broken**: it checks a table that shadow runs don't write to.

### Untested
- **No test verifies that shadow run tokens are counted toward the budget.** The budget test mocks `getTotalTokensThisCycle()` to return a fixed number — it doesn't test the actual data flow (shadow run → token tracking → budget check on next run).
- No test for the `events.jsonl` vs `metrics` table disconnect (because it's a design bug, not a test gap).
- No test for `promote()` using a BLOCK event as promotion evidence.
- No test for concurrent shadow runs racing on `events.jsonl` append.
- No test for Forge evaluator cost optimization (Haiku for obvious cases).

---

## 🧹 Janitor (Auditor + Scythe + Keychain)

### Good
- **A2 heuristic unification landed.** Both `auditor.ts` and `dispatcher.py` load `warn_keywords` from `core/janitor/config/heuristics.json`. Fallback lists are identical in both languages. Same handshake → same verdict regardless of entry path.
- **C1 `exactMatchSecrets` population landed.** Both `.env` and vault-decrypted secrets are pushed to `exactMatchSecrets` during `loadMasterVault()`. The strongest leak detection layer is now populated for production use.
- **C1 short-secret threshold lowered from 17 to 8 characters.** 12-char and 16-char API keys are now detectable. Values under 8 chars ("true", "1234") are excluded to avoid false positives.
- **C5 WikiScythe confirmation gate landed.** `runFullAuditCycle()` writes to `archive-queue.md` instead of auto-archiving. `processArchiveQueue()` only moves items marked `[x]`. Stable pages are safe.

### Bad
- **`heuristics.json` loading has inconsistent error handling.** `auditor.ts` catches the error and falls back silently. `dispatcher.py` catches `FileNotFoundError, KeyError, json.JSONDecodeError` — but the import is `_json_h`, and `json.JSONDecodeError` references the module-level `json` (not `_json_h`). If `heuristics.json` is malformed, the Python side may raise an unhandled `_json_h.JSONDecodeError` depending on import ordering.
- **`exactMatchSecrets` can contain duplicates.** If a secret appears in both `.env` and the encrypted vault (common during migration), it's pushed twice. Each duplicate doubles the scan work. Should use a `Set<string>`.
- **`addSecret()` has inconsistent behavior:** secrets under 8 chars are added to `exactMatchSecrets` (exact match scan) but the warning message says "too short for leak detection" — misleading, since they ARE being detected via exact match.
- `scanForLeaks()` reads files with `utf-8` encoding — binary files (images, compiled assets) will throw or produce garbled results. Should skip non-text files.

### Ugly
- **The Python `dispatcher.py` opens `heuristics.json` without closing it:** `_json_h.load(open(_HEURISTICS_PATH))`. The file handle leaks. Should use `with open(...) as f`. In CPython this is cleaned up by GC, but in PyPy or long-running processes it may exhaust file descriptors.
- **`processArchiveQueue()` parses markdown checkboxes with regex.** This is fragile — any deviation from the exact `- [x] pagename (last modified: ...)` format breaks parsing. A structured format (JSON) would be more reliable.

### Untested
- No test for `heuristics.json` being malformed JSON (parse error handling).
- No test for `exactMatchSecrets` deduplication (because dedup doesn't exist).
- No test for `scanForLeaks()` on binary files.
- No test for Bridge cascade fallback (Telegram down → email).
- No test for `processArchiveQueue()` with malformed markdown entries.
- No test for `dispatcher.py` file handle leak (hard to test, but worth noting).

---

## 📊 Scorecard

| Dimension | Score | Δ from Review 90 | Notes |
|---|---|---|---|
| Security | 7/10 | +1.5 | exactMatchSecrets populated, short-secret threshold fixed, heuristics unified. Remaining: spawner cloneId injection, binary file scan skip |
| Reliability | 7/10 | +1.5 | Classifier rewrite eliminates misrouting, try/catch on all paths, active_worktrees cleanup. Remaining: Forge token budget structurally broken, loadSoul no TTL |
| Test Coverage | 6.5/10 | +0.5 | ~120 tests. Good unit coverage on new classifier, keychain, forge budget. Still zero integration tests. Key flows untested end-to-end |
| Architecture | 7.5/10 | +0.5 | DI chain (client sharing), heuristics.json as shared config, confirmation gates. dispatcher.py monolith still unreformed |
| Production Readiness | 5.5/10 | +2.0 | Classifier works, executeDirect has personality, all paths have error handling. Forge budget structurally broken, duplicate message bug, no health endpoint |

---

## 🏆 Top 5 Priorities for plan-build-v5

| # | Finding | Impact | Effort |
|---|---------|--------|--------|
| 1 | **Forge budget structurally broken** — `getTotalTokensThisCycle()` reads `metrics` table, but shadow runs write to `events.jsonl`, not `metrics`. Budget cap never increments. Cost control is illusory | CRITICAL | Low — insert metric row in ShadowRunner after run |
| 2 | **`executeDirect()` duplicate message** — prompt appears in both `conversationHistory` slice and as explicit final message. Wastes tokens, may confuse model | HIGH | Low — slice history to `-10` excluding current turn |
| 3 | **`routeToBrain()` missing conversation history** — doesn't pass prior turns, so context-dependent BRAIN_ONLY queries fail. Inconsistent with `executeDirect()` which does pass history | HIGH | Low — add history to messages array |
| 4 | **Spawner `cloneId` injection** — no validation before `execSync`. Shell metacharacters in task ID = arbitrary command execution. Dispatcher validates, but spawner should too (defense-in-depth) | HIGH | Low — `if (!/^[\w-]+$/.test(cloneId)) throw` |
| 5 | **`routeToBrain()` double API call** — planner.plan() produces MissionBrief JSON (wrong format for answering), then a second Haiku call answers. Single call with Soul.md + wiki context would be faster and cheaper | MEDIUM | Medium — needs routing refactor |

### Additional candidates for plan-build-v5

- Forge `promote()` event type filtering (only `evaluation`, not `shadow_result`)
- Forge Ratchet Janitor instantiation (inject instead of `new Janitor()`)
- Classifier LRU cache for Haiku fallback (dedup retries)
- `loadSoul()` TTL-based cache invalidation (stale during dev)
- `exactMatchSecrets` deduplication (`Set<string>` instead of `string[]`)
- `scanForLeaks()` skip binary files
- dispatcher.py file handle leak (`with open(...)`)
- dispatcher.py monolith decomposition
- `compressHistory()` BitNet comment cleanup
- `ThinkingResult.confidence` dead field removal
- `processArchiveQueue()` structured format (JSON instead of markdown checkboxes)
- First integration test: full clone lifecycle end-to-end
- Watchdog respect task `timeoutMinutes` instead of hardcoded 30min
- `setup.sh` `--prefer-offline` for npm install
