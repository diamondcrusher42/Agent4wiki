# Opus Review 88 — Phase 5-7 Deep Code Review (5-Role Audit)

> Source: raw/opus-review88-phase57-deep-review.md
> Date: 2026-04-08
> Model: Opus 4.6 (5-role structured review)
> Scores: Brain 7/10 | User Agent 4/10 | Clone 5/10 | Forge 3/10 | Janitor 6/10 | Docs 9/10

---

## 🧠 Brain (7/10)

**Good:** Brain-never-executes enforced. TS↔Python inbox/active/completed filesystem is debuggable. Tiered routing saves tokens.

**Bad:**
- `planner.ts` static confidence score `0.8` — never actually evaluates confidence
- No validation that Haiku returns a valid skill type (hallucinated skill surfaces in router.ts, far from origin)
- No MemPalace context in planner — every plan starts from zero

**Critical debt:** Dual pipeline duplication. TypeScript (`UserAgent → BrainPlanner → CloneWorker`) and Python (`dispatcher.py → execute_task()`) both handle worktree creation, keychain provisioning, Janitor evaluation, context assembly — with subtly different implementations. `janitor_evaluate()` in Python is an MVP mirror of `auditor.ts` that will drift.

**Fix:** Pick one pipeline. Python dispatcher should call TypeScript via `ts-node` or REST, not reimplement it.

---

## 👤 User Agent (4/10)

**Bad:**
- `executeDirect()` and `routeToBrain()` return hardcoded strings — no real response
- "clone a git repo" → FULL_PIPELINE (keyword "clone" matches). No disambiguation step.
- `conversationHistory: any[]` — no schema, no size limit, lost on crash

**Bad:** `compressHistory()` just truncates to last 5 entries — BitNet local model integration is aspirational only.

**Unproven:** No integration test sends real prompts through `handleUserInput()` and validates routing. DIRECT path has never produced a real response.

**Fix order:** Wire `executeDirect()` to call Claude API directly (no clone). Add confidence threshold to classifier. Add conversation history size limit.

---

## 🧬 Clone (5/10)

**Good:** Spawner → runner → teardown lifecycle is clean. Reverse-line-iteration for handshake parsing is robust. Teardown fallback (`rmSync`) if git worktree fails.

**Bad:**
- `claude --print --dangerously-skip-permissions` — flag itself is a warning sign
- `scopes.yaml` allowed endpoints are honor-system only — nothing blocks network calls
- `setup.sh` hardcoded — ignores skill type (Python task still runs `npm install`)

**Ugly:**
- Debug logs after JSON breaks handshake parser
- Regex fallback `r'\{[^{}]*"status"[^{}]*\}'` breaks on nested JSON (`files_modified: [...]`)
- `noLeaks` is logged but never forces a BLOCK — leak detection is silent

**Unproven:** Entire lifecycle tested with mocks only. No test creates a real worktree, runs a real Claude session, parses a real handshake.

---

## 🔥 Forge (3/10)

**Bad:**
- Evaluator sees tokens/duration/janitor notes only — not actual code output. A variant that produces garbage faster wins.
- `ShadowRunner` sets `tokensConsumed: 0` — the main metric the evaluator judges on
- Scores hardcoded (70/30 win, 50/50 tie) — no calibration

**Ugly:**
- `promote()` creates Janitor inline with fake handshake (`tokens: 0, tests_passed: true`) — always passes. Safety gate is theater.
- `execSync('git tag ...')` with no shell escaping on timestamp string

**Unproven:** Everything. `forge/events.jsonl` is empty. No shadow run ever executed.

**Fix:** Evaluator must compare actual code/diff output, not just metrics. ShadowRunner must capture real token count from handshake. Fake handshake in ratchet must use real test.

---

## 🧹 Janitor (6/10)

**Good:** Structural checks are useful (scope creep, missing tests, shared config mutation). Circuit breaker (3 failures → human) is correct. AES-256-GCM vault + scrypt KDF properly implemented.

**Bad:**
- `patterns.yaml` parsed with hand-rolled line-by-line YAML — breaks on multiline, anchors, edge comments
- `getScopeKeys()` has a different hand-rolled YAML parser with different bugs
- `getModifiedFiles()` fallback only scans top-level — leaks in `src/deep/file.ts` go undetected

**Ugly:**
- `Bridge` singleton created at module import — any import triggers credential loading
- `urllib.parse` import at bottom of file (works but a maintenance trap)

---

## 🔴 Critical Security (fix before any production use)

| # | Finding | Severity | File |
|---|---------|----------|------|
| S1 | `dispatch_remote()` SSH injection — `echo '{task_json}'` — single quote in objective breaks/executes arbitrary commands on remote node | CRITICAL | `brain/dispatcher.py` |
| S2 | Clones inherit full `process.env` including `VAULT_MASTER_PASSWORD` — a clone can decrypt the entire vault | CRITICAL | `core/clones/clone_worker.ts` |
| S3 | `noLeaks` result ignored — `scanForLeaks()` result logged but never forces BLOCK | HIGH | `core/clones/clone_worker.ts` |
| S4 | Clone stdout is captured and stored — a clone that reads and prints `.env` contents exfiltrates credentials | HIGH | `core/clones/runner.ts` |

---

## Priority Fix Order (combined Gemini + Opus)

| Priority | Finding | File | Effort |
|----------|---------|------|--------|
| 1 | **S1: SSH injection** — use `shlex.quote()` or pass JSON via temp file, not inline | `dispatcher.py` | 30min |
| 2 | **S2: VAULT_MASTER_PASSWORD in clone env** — strip sensitive keys before passing `process.env` to clone | `clone_worker.ts` | 30min |
| 3 | **S3: noLeaks not enforced** — if `!noLeaks`, force handshake to BLOCK | `clone_worker.ts` | 15min |
| 4 | **C1: stdout JSON parsing** — write handshake to `state/handshake/<task_id>.json`, dispatcher reads file | `runner.ts` + `dispatcher.py` | 1h |
| 5 | **B3: orphaned worktree watchdog** — cron scans registry, teardown stale worktrees | new file | 1h |
| 6 | Replace hand-rolled YAML with `js-yaml` / `PyYAML` | `manager.ts`, `dispatcher.py` | 30min |
| 7 | Wire `executeDirect()` to real Claude API call | `user_agent/handler.ts` | 1h |
| 8 | Evaluator: compare code output not just metrics | `forge/evaluator.ts` | 2h |
| 9 | B1: Docker `--network=none` sandbox flag | `clone_worker.ts` | 2h |
| 10 | Integration test: real worktree → real Claude → real handshake | `test/integration/` | 2h |
