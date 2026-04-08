# Opus Review 90 — Full 5-Perspective Code Review (Post Phase 5-7, Post plan-build-v3)

> Date: 2026-04-08
> Model: Opus 4.6 (5-role structured review)
> Codebase: agent4wiki-repomix-v3.xml (post plan-build-v3 fixes applied)
> Scores: Security 5.5/10 | Reliability 5.5/10 | Test Coverage 6/10 | Architecture 7/10 | Production Readiness 3.5/10

---

## 🧠 Brain (Planner + Router + PromptBuilder)

### Good
- Clean three-file separation: `planner.ts` thinks, `router.ts` dispatches, `prompt_builder.ts` assembles. No role bleed.
- Template injection variables (`{INJECT_SOUL_HERE}`, `{INJECT_WIKI_CONTEXT_HERE}` etc.) are a sound contract between Brain and Clones.
- Soul.md + soul-private.md layering gives committed identity + gitignored personalization. Smart.
- Wiki context injection with `findWikiPage()` recursive search (B3b fix) now correctly resolves subdirectories.

### Bad
- **`BrainPlanner.plan()` creates a new `Anthropic()` client on every call.** No connection reuse, no singleton. 100 plans = 100 fresh HTTP clients. Should accept an injected client in the constructor (UserAgent already has one).
- **Confidence hardcoded to `0.8`** in `MissionBrief` — nothing downstream reads it. Dead field polluting the interface. Either wire it to the classifier or remove it.
- **`routeToBrain()` in `agent.ts` returns `plan.objective`** — the user asked a question and gets back the Brain's *restated objective*, not an answer. This is the BRAIN_ONLY equivalent of the old `executeDirect()` placeholder. Still broken.
- `loadWikiContext()` has a 500-token budget comment but no actual enforcement — it loads full page content and concatenates. A 50-page wiki blows the context window.

### Ugly
- **ComplexityClassifier is pure regex keyword matching.** "Can you run me through photosynthesis?" → FULL_PIPELINE (keyword: "run"). "Clone my recipe collection" → FULL_PIPELINE (keyword: "clone"). "What should I test next?" → FULL_PIPELINE (keyword: "test"). Every second conversational sentence triggers the full clone pipeline. This makes the system **unusable as a chatbot** — the most basic interaction is misrouted. The classifier needs at minimum: (a) phrase-level matching not substring, (b) a negation layer ("explain how to run" ≠ "run this script"), or (c) a cheap Haiku fallback for ambiguous cases.
- The `fullPipelineKeywords` list includes `'run'`, `'test'`, `'fetch'`, `'search'`, `'create a file'` — these are conversation-frequency words. The false positive rate in production will be extreme.

### Untested
- `BrainPlanner.plan()` has zero tests against a real or mocked Anthropic client. If Haiku returns markdown-wrapped JSON (`\`\`\`json\n{...}\n\`\`\``), the regex stripping may fail on edge cases.
- No test for `loadWikiContext()` exceeding the 500-token budget — what happens when 20 wiki pages are requested?
- No test for `routeToBrain()` producing a useful response.
- `findWikiPage()` has no test for name collisions (e.g., `wiki/concepts/brain.md` vs `wiki/segments/brain.md`).

---

## 👤 User Agent

### Good
- C2 fix applied: `MAX_HISTORY_ENTRIES = 50` cap + token-based flush trigger at 4000 estimated tokens. History no longer grows unbounded.
- `flushState()` writes `state.json` periodically. State survives clean restarts.
- Task file IPC to `brain/inbox/` as the TS→Python bridge — crash-resilient, inspectable, debuggable.
- `directCount` modular flush every 5 DIRECT interactions prevents state staleness during casual conversation.

### Bad
- **`conversationHistory: any[]`** — still untyped. The `any` means no compile-time safety on what goes in or comes out. Should be `Array<{role: string; content: string; timestamp: string}>`.
- **`active_worktrees` in state grows forever.** Clones push IDs into this array, but no code ever removes completed task IDs. After 100 tasks, state.json carries 100 stale worktree references.
- **`compressHistory()` references "BitNet 2B local model"** in comments — this doesn't exist in the codebase. Aspirational architecture documented as if it's real. Misleading for any new contributor.
- Token estimation (`content.length / 4`) is rough but acceptable for a flush trigger. However, it doesn't account for the `role` and `timestamp` fields also consuming tokens in context.

### Ugly
- **`executeDirect()` now calls Haiku** (C1 fix), but with a hardcoded system prompt `'You are a helpful assistant. Answer directly and concisely.'` This ignores Soul.md, conversation history, user state, and wiki context. The "direct" path produces a response from a blank-slate Haiku with zero personality or memory. Users will get split-personality behavior: casual questions answered by generic Haiku, complex questions answered by a fully-contextualized clone.
- **`triggerFullPipeline()`** still has no try/catch. If `this.planner.plan()` throws (network timeout, malformed response, API key expired), the entire UserAgent crashes. No error message to the user, no state save.

### Untested
- No test for `active_worktrees` cleanup (because cleanup doesn't exist).
- No test for `triggerFullPipeline` error handling (because error handling doesn't exist).
- No test for `executeDirect()` actually producing a Haiku response — the test only verifies `anthropic.messages.create` is called with the right model string.
- No test for `handleUserInput()` end-to-end with a mocked classifier + planner.

---

## 🧬 Clone (Lifecycle: Spawner → Runner → Teardown)

### Good
- Worktree isolation with `clone/<id>` branches is solid. Each clone gets its own filesystem, its own git branch, its own .env.
- **A2 fix applied:** `buildCloneEnv()` strips `VAULT_MASTER_PASSWORD`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` from the subprocess environment. Tests confirm sensitive keys are removed and non-sensitive keys preserved.
- Teardown in try/finally ensures worktree cleanup even on error.
- Registry in `state/worktrees/registry.json` enables the watchdog to find orphans.
- **B4 watchdog added:** `runWatchdog()` finds stale worktrees >30min and forces teardown, including force-deleting `.env` if teardown fails.

### Bad
- **`parseHandshake()` reverse-iterates for last JSON line** — works for single-line JSON but fails on pretty-printed (multi-line) JSON objects. If a Claude session outputs `{\n  "status": "COMPLETED",\n  ...}`, only the closing `}` line is captured. The B1 file-based handshake fix addresses this in theory, but the stdout fallback still has this bug.
- **`setup.sh` runs `npm install` + `pip install` in every worktree.** Three parallel clones = three thrashing disk I/O installs. No `--prefer-offline`, no shared cache directory, no lockfile-only mode. This adds 30-60s of overhead per clone for zero benefit (the deps are identical to the parent repo).
- **`spawner.ts` doesn't validate `cloneId`** before using it in `execSync(\`git worktree add "${worktreePath}" -b "${branch}"\`)`. A cloneId containing `"; rm -rf /` would execute arbitrary commands. The dispatcher validates `task_id`, but the spawner trusts its caller blindly.
- Watchdog `MAX_AGE_MINUTES = 30` is hardcoded. A legitimate long-running clone (large refactor) would be killed. Should be configurable or read from the task brief's `timeoutMinutes`.

### Ugly
- **Python `dispatcher.py` independently reimplements** worktree creation, handshake extraction, and janitor evaluation. The TS `CloneWorker` does the same thing. Same handshake, two parsers, two janitor evaluation paths. The TS Janitor checks for `"temporary"` keywords, the Python janitor checks for `"todo:"` — the same handshake gets different verdicts depending on which entry path invoked the clone.
- `dispatcher.py` is 33KB — it's a monolith containing fleet routing, task validation, worktree management, handshake parsing, janitor integration, bridge notifications, event logging, and watch mode. This should be 5-6 focused modules.

### Untested
- **No integration test runs the full clone lifecycle** (spawner → runner → janitor → teardown). All tests mock at least one layer.
- No test for timeout SIGKILL + cleanup (what happens to .env when the process is killed?).
- No test for the B1 file-based handshake read path in the Python dispatcher (`read_handshake_file()`).
- No test for parallel clone execution (race conditions in registry.json writes).
- `watchdog.ts` test only checks the identification logic, not the actual teardown execution.

---

## 🔥 Forge (Shadow Runner → Evaluator → Ratchet)

### Good
- 5-win ratchet with git tags for rollback — conservative promotion that requires consistent evidence.
- JSONL append-only event log — auditable, replayable, no data loss.
- SQLite `ForgeMetricsDb` with `getWinStreak()` — proper persistence, survives restarts.
- **C3 partial fix:** Evaluator prompt now includes `codePreview` field (truncated git diff). The judge has *some* evidence beyond just token counts.
- Ratchet now reads the most recent `forge/events.jsonl` entry instead of manufacturing a fully synthetic handshake. Progress.

### Bad
- **`ShadowRunner` still casts to `any` to extract `tokensConsumed`:** `(result as any).tokensConsumed || 0`. The `CloneResult` interface doesn't include these fields, so this cast always falls through to `0`. The C3 fix description says to add fields to `ShadowResult`, but `CloneResult` (what `execute()` returns) was never updated. **Tokens are still zero.**
- **ForgeEvaluator's prompt is still thin.** It gets: token count (zero), duration, janitor notes (one sentence), and a `--stat` diff (file names + line counts). No actual code content, no test output, no error messages. The LLM judge is making decisions based on almost no evidence.
- `promote()` reads the last line of `events.jsonl` — this could be a `shadow_result`, an `evaluation`, or any other event type. No type filtering. A shadow result with `directive: "BLOCK"` could be used as promotion evidence.

### Ugly
- **ShadowRunner runs Variant B through `CloneWorker.execute()` — full lifecycle.** Real worktree, real credentials (from Keychain), real Claude session. No mock mode, no dry-run, no cost cap. A weekly Forge cycle with 10 templates = 10 additional full Claude sessions at production cost. **There is no `max_shadow_budget_per_cycle` config.** A runaway Forge loop has unbounded token spend.
- The evaluator uses `claude-sonnet-4-6` — a premium model — for every A/B judgment. At scale (10 evaluations/week), this is significant cost for what amounts to comparing two near-identical outputs.

### Untested
- No test verifies that a broken promotion triggers git revert. The rollback path (`git tag`) exists but has never been exercised.
- Test comment in `forge.test.ts` literally admits: `"The Janitor won't actually BLOCK this clean handshake."` The promotion gate test is a tautology.
- No test for concurrent shadow run failures (two orphaned worktrees with leaked credentials).
- No test for `events.jsonl` corruption (truncated write, concurrent append).
- No test for Forge cost tracking or budget enforcement (because none exists).

---

## 🧹 Janitor (Auditor + Scythe + Keychain)

### Good
- **A3 fix applied:** `noLeaks` result now forces `BLOCK` directive when a credential leak is detected. Previously logged-and-ignored, now the clone output is discarded and human escalation is triggered.
- Defense-in-depth leak scanning: exact vault matches + regex pattern scan. Circuit breaker at 3 retries → human escalation.
- `WikiScythe` health score formula (`25 − 3×contradictions − 1×orphans − 0.5×stale`) is a reasonable quality metric.
- Bridge cascade (Telegram → Email → Discord → Slack → SMS) with fallback ensures alerts reach a human.
- **B2 fix applied:** `js-yaml` replaces hand-rolled YAML parsing in `manager.ts`. Handles inline comments, multi-line strings, anchors correctly.

### Bad
- **`scanForLeaks()` still skips secrets shorter than 17 chars.** A 16-character API key passes undetected. The threshold exists to reduce false positives on short strings, but 16 chars of high entropy is absolutely a secret. Consider lowering to 8 or using entropy analysis instead of length.
- **`exactMatchSecrets` is only populated by `addSecret()`.** Secrets loaded from `.env` during `loadMasterVault()` or decrypted from `vault.enc` during `unlockVault()` are never added to `exactMatchSecrets`. The exact-match defense layer is empty for all production secrets unless `addSecret()` is explicitly called somewhere (it isn't).
- **`getModifiedFiles()` B3 recursive fix** skips directories starting with `.` and `node_modules`, but doesn't skip `state/`, `forge/`, or other internal directories. A leaked secret in `forge/events.jsonl` (which logs janitor notes that could contain secret fragments) would be caught, but scanning these dirs adds noise and latency.
- Janitor's `evaluateMission()` has no awareness of *what* the clone actually produced. It reads the handshake (self-reported by the clone) and trusts it. A malicious or buggy clone can report `tests_passed: true` when tests actually failed.

### Ugly
- **`WikiScythe.runFullAuditCycle()` auto-archives wiki pages with git mtime >90 days, no human confirmation.** A stable, correct page that nobody touched for 3 months gets silently moved to an archive. Critical reference pages (Soul.md, architecture decisions) would be destroyed. This needs a confirmation gate or a protected-pages list.
- The TS Janitor and Python janitor evaluate differently. TS checks `handshake.janitor_notes` for keywords like `"temporary"`. Python checks for `"todo:"`. Same clone output, different verdicts depending on which code path invoked it. This is not a theoretical problem — the dispatcher.py watch mode and the TS CloneWorker are both active entry points.

### Untested
- No test for the short-secret bypass interaction with `initVault()` — secrets added via vault init are invisible to exact-match scanning.
- No test for Bridge cascade when Telegram is down (does it actually fall through to email?).
- No test for WikiScythe not archiving critical pages (because the protection doesn't exist).
- No test for `scanForLeaks()` against real-world secret formats: AWS keys (20 chars), GitHub tokens (40 chars), Stripe keys (32 chars), short API keys (16 chars).
- No test for Janitor handling a handshake where `tests_passed` is a lie.

---

## 📊 Scorecard

| Dimension | Score | Δ from Review 89 | Notes |
|---|---|---|---|
| Security | 5.5/10 | +1.5 | A1 SSH fix, A2 env strip, A3 noLeaks block all landed. But: short-secret bypass, empty exactMatchSecrets, spawner cloneId injection, no Forge cost cap |
| Reliability | 5.5/10 | +0.5 | B2 yaml fix, B3/B3b recursive scan, B4 watchdog. But: stdout parsing fallback still fragile, TS/Python janitor divergence, setup.sh thrashing |
| Test Coverage | 6/10 | ±0 | Good unit coverage on Keychain, Janitor, MetricsDb. Zero integration tests. Key paths (full lifecycle, error handling, concurrent clones) untouched |
| Architecture | 7/10 | ±0 | Clean segment separation. TS/Python split is principled. But dispatcher.py is a 33KB monolith and duplicates TS logic entirely |
| Production Readiness | 3.5/10 | +0.5 | executeDirect() no longer returns placeholder. But: classifier misroutes everything, routeToBrain() useless, no health checks, no cost controls, no graceful degradation |

---

## 🏆 Top 5 Priorities for plan-build-v4

| # | Finding | Impact | Effort |
|---|---------|--------|--------|
| 1 | **2-pass classifier** — phrase-level regex for obvious cases + cheap Haiku call for ambiguous. Current false-positive rate on "run/test/clone/search/fetch" makes the system unusable as a chatbot | CRITICAL | Medium |
| 2 | **Unify TS/Python Janitor** — `"todo:"` vs `"temporary"` heuristic divergence means same handshake gets different verdict depending on entry path. Pick one, delete the other | HIGH | Low |
| 3 | **Wire `executeDirect()` to Soul.md + conversation history** — current implementation calls blank-slate Haiku, producing split-personality UX | HIGH | Low |
| 4 | **Forge cost cap** — add `max_shadow_budget_per_cycle` config field. Without it, weekly Forge cycle has unbounded token spend. Also: ShadowRunner token extraction is still broken (`(result as any).tokensConsumed` always returns 0) | HIGH | Low |
| 5 | **`exactMatchSecrets` population gap** — secrets from `.env` and `vault.enc` never enter the exact-match scan list. Production secrets are invisible to the strongest leak detection layer | HIGH | Low |

### Additional candidates for plan-build-v4

- `active_worktrees` never pruned from state.json
- `BrainPlanner` Anthropic client reuse (inject singleton, don't create per-call)
- `setup.sh` npm/pip caching (`--prefer-offline`, shared `node_modules/` symlink)
- WikiScythe auto-archive needs human confirmation gate or protected-pages list
- `scanForLeaks()` short-secret bypass (17-char floor) — lower to 8 or use entropy scoring
- `triggerFullPipeline()` needs try/catch wrapping with user-facing error message
- `spawner.ts` cloneId validation before shell execution
- `loadWikiContext()` needs actual 500-token budget enforcement
- `dispatcher.py` monolith decomposition (33KB → 5-6 focused modules)
- Integration test: full clone lifecycle spawner → runner → janitor → teardown
- `promote()` event type filtering (only use `evaluation` events, not `shadow_result`)
- `routeToBrain()` needs to actually answer the user's question, not echo the plan objective
