# Forge Improvement Log

Append-only log of every improvement proposed, tested, and its outcome.

---

## [2026-04-08] Effort routing decision

**Proposed by:** Forge Phase 1 benchmark
**Change:** Default model strategy: max for security/precision, medium for general, Haiku for classification
**Outcome:** Promoted. `decision-effort-level-routing.md` + `clone_config.json` updated.
**Impact:** Estimated 30-40% token cost reduction vs always using max.

---

## [2026-04-08] Forge scheduling — token reset timing

**Proposed by:** Phase 2 benchmark analysis
**Change:** Schedule Forge shadow runs at token reset window (midnight UTC) for $0 marginal cost
**Outcome:** Promoted. `plan-forge-benchmarking.md` documents scheduling approach.
**Impact:** Forge runs no longer compete with production token budget.

---

## [2026-04-08] OOM guard in scanForLeaks

**Proposed by:** Gemini review-92 (MED finding)
**Change:** Files >1MB flagged for manual review, not silently skipped or Node-crash-inducing
**Outcome:** Promoted in plan-build-v6. +1 test. No regressions.

---

## [2026-04-08] execFileAsync array form in runner.ts

**Proposed by:** Gemini review-93 / Opus review-93
**Change:** runSetup() uses execFileAsync(['bash', setupScript]) instead of execAsync('bash "${script}"')
**Outcome:** Promoted in plan-build-v7. runRepomix() missed — fixed in v9 (plan-build-v9 B1).

---

## [2026-04-08] Confidence gate externalized

**Proposed by:** Gemini review-93
**Change:** `confidenceGateThreshold` moved to `clone_config.json` (was hardcoded 0.7)
**Outcome:** Promoted in plan-build-v7. Now configurable without code change.

---

## [2026-04-08] TS/Python Janitor decision tree unification

**Proposed by:** Opus review-94 (CRIT finding)
**Change:** Python janitor_evaluate() now mirrors TS evaluateMission() exactly: BLOCKED_IMPOSSIBLE → BLOCK, tests_passed is False → SUGGEST, COMPLETED → NOTE
**Outcome:** Promoted in plan-build-v8. +8 tests covering cross-path parity.
**Impact:** Forge data now consistent regardless of which path handles the task.

---

## [2026-04-08] Quarantine mode on BLOCK

**Proposed by:** Gemini review-94
**Change:** BLOCK verdict moves worktree to state/worktrees/quarantine/ instead of deleting it
**Outcome:** Promoted in plan-build-v8. Forensic evidence preserved. EXDEV fix needed (in progress).

---

## [2026-04-09] TOCTOU fix in scanForLeaks

**Proposed by:** Opus review-95 (CRIT-2)
**Change:** openSync → realpathSync → fstatSync → readFileSync all on same fd. Eliminates race window.
**Outcome:** Promoted in plan-build-v9. Existing symlink tests passed without modification.

---

## [2026-04-09] ForgeRecord write policy unification

**Proposed by:** Opus review-95 (HIGH-1)
**Change:** auditor.ts now writes ForgeRecord for ALL verdicts (was: only NOTE). Consistent with dispatcher.py.
**Outcome:** Promoted in plan-build-v9. Forge now gets complete data from all paths.
**Impact:** Forge evaluation quality improves — BLOCK and SUGGEST runs now in metrics DB.

---

## [2026-04-09] Janitor false positive reduction

**Proposed by:** First real scan of claude-agent-template
**Changes:** high_entropy_base64 threshold 40→60, generic_password_assignment excludes $VAR refs, Python dead code uses indentation check, exclude_path_patterns for .claude/skills
**Outcome:** Promoted in agent-janitor v1.0.1. 61+47 findings → 13+8 findings.
**Impact:** Janitor viable for CI gate without excessive noise.

---

## Pending proposals

| # | Proposal | Source | Status |
|---|---|---|---|
| 1 | 2-tier Janitor (Haiku/Sonnet vs Opus+extended) | Jure 2026-04-09 | Queued for benchmark |
| 2 | Brief optimization (structured vs narrative) | Forge Q3 | Blocked — needs data |
| 3 | Confidence gate threshold tuning | Forge Q4 | Blocked — needs data |
| 4 | Wiki context budget 2k→4k | Gemini review-95 MED-1 | Low priority |
