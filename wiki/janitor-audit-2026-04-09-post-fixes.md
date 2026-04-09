# Janitor Opus Tier 2 Re-Audit: Post-Fixes Health Check

> Date: 2026-04-09
> Commit: 444feec (main)
> Previous audit: c881c27 (score 40/100, 1 BLOCK, 7 SUGGEST, 4 NOTE)
> Auditor: Janitor Opus Tier 2 (extended thinking)
> Tests: 100/100 passing

---

## Executive Summary

All 5 targeted fixes (B1, S2, S3, S4, S5) are verified as correctly implemented. The critical BLOCK (unfilled template variables) is resolved. Test coverage jumped from 60 to 100 tests. No new BLOCKs introduced. 3 remaining SUGGESTs and 3 NOTEs, all low-severity. Health score: **82/100** (+42 from previous 40).

---

## Fix Verification

### B1 (BLOCK -> RESOLVED): Unfilled Template Variables

**Previous finding:** `{INJECT_WIKI_CONTEXT_HERE}` and `{INJECT_ALLOWED_ENDPOINTS_HERE}` were never replaced in the Python dispatcher clone path, causing clones to receive literal placeholder strings.

**Verification:** Lines 319-350 of `brain/dispatcher.py` now replace all 5 template variables:
1. `{INJECT_SOUL_HERE}` -- line 319, from `read_file_safe(SOUL_MD)`
2. `{INJECT_TASK_HERE}` -- line 322, from `task.objective`
3. `{INJECT_ALLOWED_ENDPOINTS_HERE}` -- line 326, from `_SKILL_ENDPOINTS` (loaded from scopes.yaml at startup, fallback `api.anthropic.com`)
4. `{INJECT_WIKI_CONTEXT_HERE}` -- line 350, from wiki pages with 500-token budget matching TS PromptBuilder
5. `{INJECT_ALLOWED_PATHS_HERE}` -- line 564, from worktree path in `execute_task()`

**Test coverage:** `test_assemble_context_no_unfilled_placeholders` (line 898) confirms 4 of 5 variables are replaced in `assemble_context()` and documents that the 5th is replaced in `execute_task()`. `test_skill_endpoints_loaded_for_known_skills` and `test_skill_endpoints_fallback_for_unknown_skill` verify scopes.yaml loading.

**Verdict: RESOLVED.** No unfilled placeholders reach clones.

### S2 (SUGGEST -> RESOLVED): Token Estimation Inconsistency

**Previous finding:** `read_file_safe()` used `chars // 4` while the budget guard used `chars // 3`.

**Verification:** Line 270: `max_chars = max_tokens * 3`. Unified with budget guard. Comment says "1 token ~ 3 chars (code-heavy content)".

**Verdict: RESOLVED.**

### S3 (SUGGEST -> RESOLVED): No bridge.py Tests

**Previous finding:** `brain/bridge.py` (380 lines) had zero tests.

**Verification:** `test/test_bridge.py` contains 13 tests covering:
- Init with/without channels
- send() cascade (Telegram success, Discord fallback, all-fail BridgeError)
- broadcast() result recording and failure tracking
- ping() success/failure
- `_send_telegram()` internals: not-configured guard, message chunking (>4000 chars), API error handling
- `get_bridge()` singleton behavior

Test quality: Good. Uses proper mocking (`patch.dict`, `patch.object`), tests edge cases (chunking, all-fail), verifies error types. No obvious gaps in the public API surface.

**Verdict: RESOLVED.**

### S4 (SUGGEST -> RESOLVED): No benchmark_score.py Tests

**Previous finding:** `tools/benchmark_score.py` (377 lines) had zero tests.

**Verification:** `test/test_benchmark_score.py` contains 24 tests covering:
- `parse_session()` -- valid JSONL, invalid lines (graceful skip), empty file
- `extract_metrics()` -- token sums, zero tokens, read-before-edit tracking (100%, 0%, mixed), human corrections, duration
- `compute_scores()` -- read_before_edit, autonomy (0/3 corrections), token efficiency (no baseline)
- `composite_score()` -- all-tens, all-zeros, partial-None, all-None
- `check_task_a()` -- correct fix, band-aid, wrong fix, file-not-found
- `find_latest_session()` -- most recent, empty dir

Test quality: Good. Uses `tmp_path` fixture correctly, tests boundary conditions. Minor gap: no test for `compute_scores()` with a real token baseline, but this is low risk since baseline comparison is task-specific.

**Verdict: RESOLVED.**

### S5 (SUGGEST -> RESOLVED): Synthetic Handshake Auto-Approval

**Previous finding:** Clones exiting without handshake JSON were silently auto-approved with a synthetic NOTE directive.

**Verification:** Lines 938-965 now:
1. Log error with explicit message explaining what happened
2. If retries remain: re-queue with objective mutation explaining handshake requirement, notify SUGGEST
3. If MAX_RETRIES exhausted: move to failed, notify BLOCK
4. No synthetic handshake is created at any point

The objective mutation (line 952) clearly instructs the clone to output `{"status": "COMPLETED", "janitor_notes": "...", "tests_passed": true}` as the last line of stdout.

**Verdict: RESOLVED.**

---

## Remaining Findings

### S8 (SUGGEST): Stale TASK.md at Repo Root

**File:** `/TASK.md` -- identical copy of `templates/code-clone-TASK.md` (both 3760 bytes)
**Impact:** Confusion trap. A developer or clone might read `./TASK.md` thinking it's their task brief, but it's an unreplaced template with literal `{INJECT_*}` placeholders. The real templates live in `templates/`.
**Fix:** Delete `./TASK.md` or add it to `.gitignore`.

### S9 (SUGGEST): Silent scopes.yaml Load Failure

**File:** `brain/dispatcher.py` line 114
**Code:** `except Exception: _SKILL_ENDPOINTS = {}`
**Impact:** If `scopes.yaml` is malformed, missing, or has a parsing error, no log message is emitted. The fallback to `_DEFAULT_ENDPOINTS` (`api.anthropic.com`) is reasonable, but the failure is invisible. This could mask configuration drift between TS and Python paths.
**Fix:** Add `log.warning(f"Failed to load scopes.yaml: {e}")` to the except block. Requires changing to `except Exception as e:`.

### S10 (SUGGEST): TASK.md Written with Unreplaced INJECT_ALLOWED_PATHS_HERE

**File:** `brain/dispatcher.py` lines 560-564
**Code:** TASK.md is written to worktree (line 562) BEFORE `{INJECT_ALLOWED_PATHS_HERE}` is replaced (line 564). The `context` variable is updated after the write.
**Impact:** The TASK.md file in the worktree contains the literal string `{INJECT_ALLOWED_PATHS_HERE}`. If the clone reads TASK.md (some templates include a "Did I stay within {INJECT_ALLOWED_PATHS_HERE}?" self-check), it sees an unreplaced placeholder. The `context` passed to `launch_session()` IS correctly replaced, so the clone's initial prompt is correct. The checklist line in TASK.md is cosmetic only.
**Risk:** Low. The clone receives the correct context via stdin/prompt. TASK.md is a reference copy.
**Fix:** Move the `.replace()` call to before the `task_md.write_text()` call.

### N1 (NOTE): S1 Still Absent -- Advisory-Only Validation

**Previous S1:** Janitor SUGGEST directives produce advisory feedback but don't structurally validate the feedback content. A SUGGEST with empty janitor_notes passes through.
**Status:** Still absent. Low risk -- empty notes produce a benign re-queue.

### N2 (NOTE): S6 Still Absent -- Objective Growth Unbounded

**Previous S6:** Each retry appends to `task.objective`, growing it without bound.
**Status:** Still absent. Low risk in practice -- MAX_RETRIES caps growth to ~3 mutations. Context budget guard truncates overflow.

### N3 (NOTE): S7 Still Absent -- Remote Dispatch No Backoff

**Previous S7:** `dispatch_remote()` has no exponential backoff or circuit breaker.
**Status:** Still absent. Low risk -- single-attempt with 15s timeout, then falls back to local. No retry loop.

---

## Secrets Scan

Full scan of all `.py`, `.ts`, `.yaml`, `.json`, `.md`, `.sh` files (excluding `test/`, `raw/`, `wiki/janitor*`).

**Results:**
- `sk-ant-` pattern: found only in documentation examples and pattern definition files (`core/keychain/config/patterns.yaml`, `wiki/decisions/plan-build-v1.md`). All are clearly example/documentation strings, not real keys.
- No `ghp_`, `AKIA`, `Bearer`, `eyJ` patterns in non-documentation code.
- No `.env` files committed.
- `SENSITIVE_ENV_KEYS` set in dispatcher correctly strips vault credentials from clone environments.

**Verdict:** Clean. No real secrets in codebase.

---

## Test Quality Assessment

| File | Tests | Source Lines | Coverage Assessment |
|---|---|---|---|
| test/test_dispatcher.py | 63 | 1139 (dispatcher.py) | Good. Covers Janitor evaluate, handshake extraction/validation, task loading, worktree creation, env stripping, claim atomicity, context assembly, endpoint loading. |
| test/test_bridge.py | 13 | 380 (bridge.py) | Good. All public methods covered. Edge cases for fallback cascade, chunking, singleton. |
| test/test_benchmark_score.py | 24 | 377 (benchmark_score.py) | Good. All exported functions tested. Minor gap: token_efficiency with real baseline. |
| **Total** | **100** | **1896** | |

All 100 tests pass in 7.64 seconds.

---

## Health Score

| Category | Count | Deduction |
|---|---|---|
| BLOCK | 0 | 0 |
| SUGGEST | 3 (S8, S9, S10) | -15 |
| NOTE | 3 (N1, N2, N3) | -3 |
| Missing tests for >100-line source | 0 | 0 |
| Secrets | 0 | 0 |
| **Total** | | **82/100** |

**Delta:** +42 from previous score (40).

---

## Summary Table

| ID | Severity | Status | Description |
|---|---|---|---|
| B1 | ~~BLOCK~~ | RESOLVED | Template variables now injected in Python path |
| S2 | ~~SUGGEST~~ | RESOLVED | Token estimation unified to chars//3 |
| S3 | ~~SUGGEST~~ | RESOLVED | 13 tests for bridge.py |
| S4 | ~~SUGGEST~~ | RESOLVED | 24 tests for benchmark_score.py |
| S5 | ~~SUGGEST~~ | RESOLVED | Synthetic handshake auto-approval removed |
| S8 | SUGGEST | NEW | Stale TASK.md at repo root |
| S9 | SUGGEST | NEW | Silent scopes.yaml load failure |
| S10 | SUGGEST | NEW | TASK.md written with unreplaced INJECT_ALLOWED_PATHS_HERE |
| N1 | NOTE | CARRIED | Advisory validation still absent (S1) |
| N2 | NOTE | CARRIED | Objective growth unbounded (S6) |
| N3 | NOTE | CARRIED | Remote dispatch no backoff (S7) |
