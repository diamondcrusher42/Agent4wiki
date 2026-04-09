# Janitor Opus Audit — v9 Post-Implementation Review

> Date: 2026-04-09
> Auditor: Janitor (Opus Tier 2, extended thinking)
> Commit: c881c27 (main)
> Scope: Full repo — focus on v9 changes in brain/dispatcher.py + test/test_dispatcher.py
> Previous score: 0 (initial baseline from .janitor-history.json)

---

## Summary

60/60 Python tests passing. No hardcoded secrets in production code. The v9 fixes (validate_handshake, context budget guard, objective mutation) are well-implemented and well-tested. The TS/Python Janitor decision trees are aligned. The codebase is significantly more mature than the previous audit baseline.

1 BLOCK finding (unfilled template variables reaching clones). 7 SUGGEST findings. 4 NOTE findings.

---

## BLOCK Findings

### B1. Unfilled Template Variables Reach Clone Prompts (dispatcher.py, lines 278-310)

**Severity: BLOCK**

The `assemble_context()` function for clone tasks replaces `{INJECT_SOUL_HERE}` and `{INJECT_TASK_HERE}` in the template. However, it does NOT replace `{INJECT_WIKI_CONTEXT_HERE}` or `{INJECT_ALLOWED_ENDPOINTS_HERE}`. The TS `PromptBuilder` (core/brain/prompt_builder.ts:44-48) replaces all 5 injection variables. The Python dispatcher only replaces 3 of 5.

This means every clone launched via the Python dispatcher receives a prompt containing literal `{INJECT_WIKI_CONTEXT_HERE}` and `{INJECT_ALLOWED_ENDPOINTS_HERE}` strings. The clone sees these as instructions it cannot parse, and the network scope restriction in the template (Section 2b) is rendered meaningless — the clone gets no endpoint whitelist.

The `{INJECT_ALLOWED_PATHS_HERE}` replacement happens later in `execute_task()` (line 506), so that one works. But the other two are simply never replaced.

**Evidence:**
- Template (`templates/code-clone-TASK.md`) declares 5 variables: `{INJECT_SOUL_HERE}`, `{INJECT_ALLOWED_PATHS_HERE}`, `{INJECT_ALLOWED_ENDPOINTS_HERE}`, `{INJECT_WIKI_CONTEXT_HERE}`, `{INJECT_TASK_HERE}`
- `dispatcher.py:290` replaces `{INJECT_SOUL_HERE}`
- `dispatcher.py:293` replaces `{INJECT_TASK_HERE}`
- `dispatcher.py:506` (in execute_task) replaces `{INJECT_ALLOWED_PATHS_HERE}`
- `{INJECT_WIKI_CONTEXT_HERE}` — NEVER replaced in the Python path. Wiki pages are appended as separate parts, not injected into the template placeholder.
- `{INJECT_ALLOWED_ENDPOINTS_HERE}` — NEVER replaced anywhere in dispatcher.py.

**Fix:** In `assemble_context()` for clone tasks, replace `{INJECT_WIKI_CONTEXT_HERE}` with the assembled wiki content (or empty string), and `{INJECT_ALLOWED_ENDPOINTS_HERE}` with the appropriate endpoint list (or a "none specified" fallback). Alternatively, scan the final assembled context for any remaining `{INJECT_*}` patterns and log a warning.

---

## SUGGEST Findings

### S1. validate_handshake() Is Advisory-Only — Invalid Handshakes Still Drive Decisions (dispatcher.py, lines 618-670)

**Severity: SUGGEST**

`validate_handshake()` returns `(valid, errors)` and the caller logs warnings but always proceeds. An invalid handshake (e.g., `status: "MAGIC_STATUS"`, missing `janitor_notes`) flows through to `janitor_evaluate()` which hits the fallback BLOCK. This is defensively correct — unknown status BLOCKs. But there is no test verifying that a handshake with `janitor_notes` missing still works correctly in the SUGGEST re-queue path, where `janitor_notes` is the "sole context for retries" (per the docstring). If a clone emits `{status: "COMPLETED", tests_passed: true}` without `janitor_notes`, it passes `janitor_evaluate` as NOTE, and the SUGGEST re-queue path would inject `"Janitor notes: none"` into the objective — a useless feedback loop.

**Fix:** Consider making `janitor_notes` absence degrade the directive (e.g., COMPLETED without notes -> SUGGEST "resubmit with janitor_notes"). Or at minimum, add a test for this edge case.

### S2. Context Budget Guard Token Estimation Inconsistency (dispatcher.py, lines 260 vs 330)

**Severity: SUGGEST**

`read_file_safe()` (line 260) uses `max_tokens * 4` (1 token ~ 4 chars) for its truncation estimate. The context budget guard (line 330) uses `len(full_text) // 3` (1 token ~ 3 chars, "code-heavy"). These two estimators disagree by 33%. A file truncated by `read_file_safe()` to 2000 tokens (8000 chars) will be estimated as 2666 tokens by the budget guard. This means the budget can be exceeded by up to 33% before the guard kicks in, or conversely, the guard may drop pages that would have fit.

**Fix:** Use a single consistent estimator. Since the code-heavy `//3` is the more conservative choice, use it in both places (or define a `estimate_tokens(text)` helper).

### S3. No Test Coverage for bridge.py (266 lines, 0 tests)

**Severity: SUGGEST**

`brain/bridge.py` is 266 lines with 12 methods including the critical `send()` fallback cascade and `broadcast()`. It has zero test coverage. The Bridge is Segment 7 — "the only way output reaches the user." A failure in the fallback cascade logic is invisible until all channels fail simultaneously.

**Fix:** Add `test/test_bridge.py` with mocked HTTP calls testing: send() cascade (Telegram fails -> email), broadcast() parallel delivery, chunking for messages > 4000 chars, BridgeError when all channels fail.

### S4. No Test Coverage for tools/benchmark_score.py (377 lines, 0 tests)

**Severity: SUGGEST**

`tools/benchmark_score.py` is 377 lines with scoring logic, JSONL parsing, and composite score calculation. No test file exists. The Forge relies on this scorer to make routing decisions.

### S5. process_task_file() Silent Success on Missing Handshake When returncode==0 (dispatcher.py, lines 872-885)

**Severity: SUGGEST**

When a clone session completes (returncode 0) but produces no JSON handshake, `process_task_file()` synthesizes a fake handshake with `tests_passed: True` and `janitor_notes: "No structured handshake — raw completion accepted."` This fake handshake always evaluates as NOTE (clean pass) and proceeds to merge. A clone that runs successfully but forgets to output its handshake JSON — or whose handshake is malformed — gets auto-approved.

**Evidence:** dispatcher.py line ~877: synthetic handshake with `tests_passed: True`.

**Fix:** Change the synthetic handshake to `tests_passed: null` and add a janitor_notes warning that triggers a SUGGEST verdict (e.g., include "workaround" in the notes to hit the warn_keywords check). This forces a re-run where the clone must produce a proper handshake.

### S6. Objective Mutation Grows Unboundedly on Repeated SUGGEST Retries (dispatcher.py, lines 910-920)

**Severity: SUGGEST**

Each SUGGEST re-queue appends a "Prior Attempt" block (~200-400 chars) to `task.objective`. After MAX_RETRIES=3 attempts, the objective has grown by ~600-1200 chars. While this is bounded by MAX_RETRIES (so 3 appends max), the growing objective is also fed back into `assemble_context()` which has a token budget. The budget guard only drops wiki pages — it never truncates the objective itself. A large initial objective + 3 retry blocks could push the context over budget with no wiki pages to drop.

**Fix:** Cap the total objective size, or have the budget guard account for objective growth. Alternatively, only keep the most recent prior attempt (not all of them).

### S7. dispatch_remote() Polls for 10 Minutes With No Circuit Breaker (dispatcher.py, lines 177-186)

**Severity: SUGGEST**

`dispatch_remote()` polls for a result file via SCP every 5 seconds for 120 iterations (10 minutes). This is blocking — the calling thread cannot do anything else. If the remote node is down, this burns 10 minutes per task. There is no exponential backoff, no health check of the remote node, and no early termination if the SCP connection itself fails (vs. file not found).

### S8. claim_task() Race Window on Non-Same-Filesystem Moves (dispatcher.py, line 962)

**Severity: SUGGEST**

The docstring says `os.rename()` is "atomic on the same filesystem." If INBOX and ACTIVE are on different filesystems (e.g., mounted volumes, Docker setups), `os.rename()` raises `OSError: [Errno 18] Invalid cross-device link` and the task is never claimed. The watch loop continues, but the task stays in inbox forever. The error is caught by the outer `except Exception` in watch() which just backs off — no log about the specific cross-device issue.

---

## NOTE Findings

### N1. Stale Comment in dispatcher.py Line 71

**Severity: NOTE**

`TEMPLATES = BASE_DIR / "templates"  # canonical until consolidated to core/clones/templates/` — the comment references a future migration that has not happened and may never happen. It is mildly confusing but harmless.

### N2. `_HEURISTICS_PATH` and `_CLONE_CONFIG_PATH` Use Different Import Patterns

**Severity: NOTE**

Line 57 imports `json as _json_h` to load heuristics, but line 78 uses the already-imported `json`. The `_json_h` alias is unnecessary since `json` is imported at the module level (line 36). Harmless but inconsistent.

### N3. bin/agent4.ts Has 3 Unimplemented CLI Stubs

**Severity: NOTE**

Previously flagged in the Haiku audit. The CLI entry point has stub commands that log "not implemented." This is expected for an MVP and not blocking.

### N4. wiki/decisions/plan-build-v1.md Contains Example Key String

**Severity: NOTE**

`sk-ant-api03-my-real-key` appears in test code examples within a wiki decision document. This is not a real key (it is clearly an example in a code block), but it triggers secret scanners. Previously flagged, acknowledged as non-blocking.

---

## Test Coverage Assessment

| File | Lines | Test File | Tests | Coverage |
|---|---|---|---|---|
| brain/dispatcher.py | 1071 | test/test_dispatcher.py | 60 | Good — all v9 features covered |
| brain/bridge.py | 266 | (none) | 0 | Missing (S3) |
| tools/benchmark_score.py | 377 | (none) | 0 | Missing (S4) |
| core/janitor/auditor.ts | ~170 | test/scythe.test.ts (partial) | partial | Partial — scythe tested, auditor not directly |
| core/clones/lifecycle/*.ts | ~400 | test/clone-lifecycle.test.ts | yes | Covered |
| core/keychain/manager.ts | 430 | test/keychain.test.ts | yes | Covered |

The v9-specific test additions are solid:
- `test_validate_handshake_*` (7 tests) — covers valid, invalid, edge cases
- `test_context_budget_constants_defined` — verifies brain > clone budget
- `test_suggest_requeue_objective_mutation` — verifies structured mutation
- `test_prompt_file_cleaned_*` — verifies B3 cleanup

**Weak assertions identified:**
- `test_suggest_requeue_objective_mutation` tests the mutation logic by re-implementing it inline rather than calling the actual code path in `process_task_file()`. It proves the string format is correct but does not test that `process_task_file()` actually performs the mutation and writes the re-queued file.
- `test_prompt_file_cleaned_on_exception` does not actually test `launch_session()` — it manually implements the try/finally pattern. The `test_prompt_file_cleaned_on_success` test is better because it calls the real function.

---

## Design Consistency Check: TS vs Python Janitor

The v9 changes successfully aligned the decision trees. Verified step by step:

| Step | auditor.ts | dispatcher.py | Match? |
|---|---|---|---|
| 1. Circuit breaker (retries >= max) | BLOCK | BLOCK | Yes |
| 2. BLOCKED_IMPOSSIBLE | BLOCK | BLOCK | Yes |
| 3. tests_passed === false | BLOCK | BLOCK | Yes |
| 4. FAILED_REQUIRE_HUMAN | BLOCK | BLOCK | Yes |
| 5. Scope creep | SUGGEST | SUGGEST | Yes |
| 6. Shared config | SUGGEST | SUGGEST | Yes |
| 7. Performance keywords | SUGGEST | SUGGEST | Yes |
| 8. Warn keywords (from heuristics.json) | SUGGEST | SUGGEST | Yes |
| 9. Clean COMPLETED | NOTE | NOTE | Yes |
| 10. FAILED_RETRY (retries left) | N/A (handled by clone_worker) | SUGGEST | Acceptable divergence |
| 11. Fallback | N/A | BLOCK | Yes (Python adds explicit fallback) |

One minor divergence: auditor.ts `detectStructuralIssue()` has a "missing tests" check (`sourceFiles > 0 && testFiles === 0 && tests_passed === false`) that dispatcher.py does not replicate. This is acceptable because tests_passed===false already BLOCKs at step 3, so this TS check is dead code in practice — it can never fire because step 3 returns BLOCK before step 5 runs.

---

## Health Score

Formula (from Soul.md Section 4):
- Start: 100
- BLOCK findings: 1 x -15 = -15
- SUGGEST findings: 7 x -5 = -35
- NOTE findings: 4 x -1 = -4
- Missing test files (>100 lines): 2 x -3 = -6

**Score: 100 - 15 - 35 - 4 - 6 = 40**

Previous score: 0 (initial baseline)
Delta: +40

Assessment: Below healthy threshold (75), but significantly improved from baseline. The single BLOCK (template variables) is the highest-impact fix available — resolving it alone would raise the score to 55. Resolving S3/S4 (missing tests) would add another 6 points.

---

## Recommended Fix Priority

1. **B1** (BLOCK) — Fix template variable replacement in `assemble_context()`. Highest impact, lowest effort.
2. **S5** — Change synthetic handshake to not auto-approve. Security-adjacent (bypasses Janitor).
3. **S2** — Unify token estimation. Correctness issue in the budget guard.
4. **S3** — Add bridge.py tests. Critical path, zero coverage.
5. **S1/S6** — Harden the SUGGEST re-queue path edges.
6. **S7/S8** — Operational robustness (remote polling, cross-device).
