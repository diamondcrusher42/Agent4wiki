# Opus Review 89 — Full 5-Perspective Code Review (Post Phase 5-7)

> Date: 2026-04-08
> Model: Opus 4.6 (5-role structured review)
> Scores: Security 4/10 | Reliability 5/10 | Test Coverage 6/10 | Architecture 7/10 | Production Readiness 3/10

---

## 🧠 Brain (Planner + Router)

**Good:** Clean separation: planner.ts thinks, router.ts dispatches, prompt_builder.ts assembles. No role bleed. Wiki context injection with subdirectory resolution is pragmatic. Planning system prompt is well-constrained.

**Bad:**
- `BrainPlanner.plan()` creates new `Anthropic()` client on every call — no reuse, no connection pooling
- Confidence hardcoded to `0.8` — nothing reads this value, dead architecture
- `routeToBrain()` in `agent.ts` returns a string literal — BRAIN_ONLY tasks return nothing useful

**Ugly:** ComplexityClassifier is regex keyword matching only. "run me through photosynthesis" → FULL_PIPELINE. "clone my recipe collection" → FULL_PIPELINE (keyword: "clone"). Will misroute constantly in production.

**Untested:** `BrainPlanner.plan()` has zero tests against real/mocked Anthropic client. If Haiku returns markdown-wrapped JSON, regex stripping may fail on edge cases (triple-backtick + language hint + trailing whitespace).

---

## 👤 User Agent

**Good:** State persistence with `flushState()`. Task JSON to `brain/inbox/` as TS→Python bridge — file-based IPC that survives crashes.

**Bad:**
- `conversationHistory: any[]` — unbounded, untyped, lost on crash (type `any` remains even after C2 size fix)
- `compressHistory()` is naive truncation; "BitNet 2B local model" in comments doesn't exist in codebase — aspirational architecture documented as real
- `active_worktrees` in state grows forever — no code ever removes completed task IDs

**Ugly:** `executeDirect()` returns `"Direct response placeholder"` — users get this for simple greetings. System literally cannot say hello.

**Untested:** No test for `active_worktrees` cleanup. No test for `planner.plan()` throwing (network error, malformed response). `triggerFullPipeline` has no try/catch — API failure crashes entire user agent.

---

## 🧬 Clone (Lifecycle)

**Good:** Worktree isolation with `clone/<id>` branches is solid. Teardown in try/finally. Prompt written to file (avoids `/proc/<pid>/cmdline` exposure). Registry in `state/worktrees/registry.json`.

**Bad:**
- `runner.ts` passes `process.env` directly to spawned claude subprocess (A2 bug) — scoped .env is security theater when full env is also passed
- `parseHandshake()` reverse-iterates for last JSON line — fails on multi-line (pretty-printed) JSON objects, captures only closing `}` line
- `setup.sh` runs `npm install` + `pip install` in every worktree — 3 parallel clones = 3 thrashing disk I/O installs, no `--prefer-offline`

**Ugly:** Python `dispatcher.py` independently reimplements worktree creation, handshake extraction, and janitor evaluation. TS Janitor checks for `"temporary"`, Python checks for `"todo:"` — same handshake gets different verdicts depending on entry path.

**Untested:** No integration test runs full clone lifecycle (spawner → runner → janitor → teardown). No test for timeout SIGKILL + cleanup.

---

## 🔥 Forge

**Good:** 5-win ratchet with git tags for rollback. JSONL append-only events. SQLite win streak with getWinStreak().

**Bad:**
- `ShadowRunner` hardcodes `tokensConsumed: 0` — evaluator cannot compare token efficiency (C3 fixes this)
- ForgeEvaluator prompt only shows token counts + janitor notes — no code diff, no test results, LLM judge has almost no evidence
- `promote()` uses synthetic handshake with `tokens_consumed: 0, tests_passed: true` — bypasses Janitor structural checks, a promotion that breaks tests still passes the gate

**Ugly:** ShadowRunner runs variant B through full CloneWorker.execute() — real worktree, real credentials, real Claude session. No mock mode, no dry-run, no cost cap. Weekly Forge cycle with 10 templates = 10 additional Claude sessions at production cost.

**Untested:** No test verifies broken promotion triggers git revert. Test comment admits: "The Janitor won't actually BLOCK this clean handshake." No test for concurrent shadow run failures (orphaned worktree × 2 = credential leak × 2).

---

## 🧹 Janitor (Auditor + Scythe + Keychain)

**Good:** Defense in depth: exact vault matches + regex pattern scan. Circuit breaker at 3 retries → human escalation. WikiScythe health score formula (25 − 3×contradictions − 1×orphans − 0.5×stale). Bridge cascade (Telegram → Email → Discord → Slack → SMS).

**Bad:**
- `noLeaks` result logged but ignored (A3 bug) — leaked credentials get merged to main
- `getModifiedFiles()` fallback only scans top-level (B3 bug)
- `scanForLeaks()` skips secrets shorter than 17 chars — 16-char API key passes undetected. `exactMatchSecrets` only populated by `addSecret()` — secrets loaded from `.env` or vault directly are invisible

**Ugly:**
- Hand-rolled YAML parser in `getScopeKeys()` + `scanForLeaks()` — breaks on inline comments, multi-line strings, anchors (B2 fixes this)
- `WikiScythe.runFullAuditCycle()` auto-archives wiki pages with git mtime >90 days, no human confirmation — a stable, correct page untouched for 3 months gets silently destroyed

**Untested:** No test for short-secret bypass interaction with `initVault()`. No test for Bridge cascade when Telegram is down. No test for WikiScythe not archiving critical pages.

---

## 📊 Scorecard

| Dimension | Score | Notes |
|---|---|---|
| Security | 4/10 | SSH injection, env leak, noLeaks ignored, shallow scan |
| Reliability | 5/10 | Fragile stdout parsing, hand-rolled YAML, no orphan cleanup |
| Test Coverage | 6/10 | Good unit coverage on Keychain+Janitor; zero integration tests |
| Architecture | 7/10 | Clean segments, TS/Python split principled, but Python dispatcher duplicates TS logic |
| Production Readiness | 3/10 | executeDirect() placeholder, classifier misroutes, no health checks |

---

## Top 3 Beyond plan-build-v3

| # | Finding | Impact |
|---|---------|--------|
| 1 | **Unify TS/Python Janitor** — "todo:" vs "temporary" heuristic divergence means same handshake gets different verdict depending on entry path | HIGH |
| 2 | **2-pass classifier** — fast regex for obvious cases + cheap Haiku call for ambiguous. Current false-positive rate on "run/test/clone" makes system unusable in production | HIGH |
| 3 | **Forge cost cap** — `max_shadow_budget_per_cycle` config field. Without it, weekly Forge cycle has unbounded token spend | MEDIUM |

### Additional candidates for plan-build-v4

- `active_worktrees` never pruned from state.json
- `BrainPlanner` Anthropic client reuse (singleton or per-session)
- `setup.sh` npm/pip caching (`--prefer-offline`, shared cache dir)
- WikiScythe auto-archive requires human confirmation gate
- `scanForLeaks()` short-secret bypass (17-char floor) — consider lowering or removing
- `triggerFullPipeline` try/catch for API failures
