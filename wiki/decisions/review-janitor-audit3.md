# Janitor Audit 3 — Full Repo + Branch Comparison (2026-04-09)

> Source: Opus acting as Janitor, 2026-04-09
> Scope: main branch + opus-build branch
> Verdict: SUGGEST — significant issues found, none fatal. Fix before testing.

## Executive Summary

| Component | main | opus-build | Status |
|-----------|------|------------|--------|
| Bridge | Complete | Complete | ✅ Ready |
| Dispatcher | Working | + Janitor + Fleet + Threading | ⚠️ Dead code (B1) |
| Planner | Stub | Haiku API call | ✅ Ready |
| Clone lifecycle | All stubs | All implemented | ✅ Ready |
| Janitor Auditor | Working | + shared heuristics | ✅ Ready |
| Forge | All stubs | All implemented | ✅ Ready |
| Tests | None | ~3500 lines, 198 passing | ✅ Good |

## 🚫 Blocking Issues

### B1. Dead code in `dispatcher.py` — `janitor_evaluate()`
Lines ~671+: after `return "BLOCK"`, entire duplicate of V1 evaluation logic (~30 lines) is unreachable. V1 uses `handshake.get("tests_passed", False)` vs V2's correct `handshake.get("tests_passed") is False`. Confirmed by Gemini review 95.
**Fix:** Delete dead block (lines 777–802 per Gemini, ~671+ per this audit).

### B2. `MissionBrief` defined twice
`core/brain/planner.ts` (7 fields) + `core/keychain/manager.ts` (4 fields, different shape). Fixed on opus-build. Still on main.
**Fix:** Delete `MissionBrief` from `manager.ts` on main.

### B3. Template injection variable mismatch
`dispatcher.py` uses `{INJECT_SOUL_MD_HERE}` / `{INJECT_BRAIN_DELEGATED_TASK_HERE}`. `prompt_builder.ts` uses `{INJECT_SOUL_HERE}` / `{INJECT_TASK_HERE}`. Silent failure — placeholder stays in prompt, wastes tokens.
**Fix:** Verify `templates/code-clone-TASK.md` uses `{INJECT_SOUL_HERE}` and `{INJECT_TASK_HERE}`.

### B4. `launchClause` typo → `launchClaude` (main only)
`core/clones/lifecycle/runner.ts` on main. Fixed on opus-build.

### B5. `mempalace_adapter.ts` missing `writeSummary()` + `audit()` (main only)
Also wrong signature: `tier: string` instead of `tier: MemoryTier`. TypeScript compilation fails. Fixed on opus-build.

## ⚠️ Structural Concerns

### S1. Threaded `watch()` without locking
`process_task_file()` does `shutil.move()` on shared directories without locking. Two threads could race on same task file. Use `threading.Lock` around inbox scan + move-to-active, or use `os.rename()` atomically and catch `FileNotFoundError`.

### S2. `dispatch_remote()` SSH polling reads partial JSON
Polls every 5s via scp for 10 min. Partial JSON on copy = corrupt read. Fix: use a completion marker file (`task-id.done`) that the remote writes after the result file.

### S3. `.env` on disk contradicts design
Design comment: "credentials exist only in process memory, never on disk." Implementation: `provisionEnvironment()` writes `.env` with `mode: 0o600`. Crash between provision/revoke leaves credentials on disk. Known tradeoff for Python/shell compatibility — should be documented, not silently contradicted.

### S4. Forge budget cap is soft
`ESTIMATED_TOKENS_PER_RUN = 5000` is static. If a shadow run consumes 50k tokens, cap only prevents the NEXT run. Check runs before launch, not during. Document as soft cap.

### S5. `raw/dispatcher.py` is stale duplicate
Different paths (`BASE_DIR = Path.home() / "agent-v4"` vs current). Missing Bridge, Janitor, fleet. Risk: someone runs the wrong one. Fix: add `# ARCHIVED — do not run. Active version: brain/dispatcher.py` header.

## ✅ Good Patterns (keep these)

- Circuit breaker (3 retries → BLOCK → human escalation) consistent across TS/Python
- Quarantine on BLOCK — preserves forensic evidence
- Watchdog for stale worktrees — solid operational hygiene
- Shared `heuristics.json` — single source of truth across TS/Python
- `validate_task_id` + `cloneId` regex check — good security posture
- AES-256-GCM vault with scrypt — proper implementation
- 2-pass classifier (regex fast-path + Haiku fallback) — smart cost optimisation
- ~3500 lines of tests covering keychain, clone lifecycle, forge, dispatcher

## Minor Issues

1. `import urllib.parse` in `bridge.py` appears after `Bridge` class definition — move to top
2. `clone_config.json` import in `clone_worker.ts` has no fallback default if file missing
3. `test-output.txt` is a stray artifact on opus-build — delete before merge
4. `skills/` directory on opus-build has 7 placeholder files (10 lines each, all TODOs) — flesh out or remove

## Recommended Actions Before Testing

1. Delete dead code block in `dispatcher.py` `janitor_evaluate()` (B1)
2. Verify template variable names in `templates/code-clone-TASK.md` (B3)
3. Add `threading.Lock` to inbox scan in `watch()` (S1)
4. Delete `test-output.txt` from opus-build
5. Move `import urllib.parse` to top of `bridge.py`
6. Add comment header to `raw/dispatcher.py` (S5)

After these fixes, opus-build is in good shape for integration testing.

**Janitor directive: SUGGEST** — fix the 6 items above, then re-audit for NOTE.

---

## Design Notes for Standalone Janitor Product

This report exemplifies what the Janitor finds that other tools miss:

### What makes the Janitor unique vs linters

| Tool | What it finds |
|------|---------------|
| Linter (ESLint) | Style, syntax, simple patterns |
| Type checker (TSC) | Type errors, missing methods |
| **Janitor** | **Dead code, design contradictions, confusion traps, silent failure modes, branch deltas** |

### High-value signals to monitor

1. **Dead code ratio** — unreachable blocks as % of total logic (B1 type findings)
2. **Design contradiction count** — comment says X, code does Y (S3 type)
3. **Silent failure modes** — template mismatches, missing fallbacks, silent swallows (B3, S2 type)
4. **Branch delta** — issues introduced since main (the branch comparison matrix)
5. **Stale artifact count** — orphaned files, outdated duplicates (S5 type)
6. **Good pattern score** — what's working well (prevents over-refactoring)

### Ideal output format for standalone product

```
HEALTH SCORE: 68/100 (↑5 from last run)
VERDICT: SUGGEST

🔴 BLOCKING (3)    → fix before testing
⚠️ STRUCTURAL (4)  → fix before merge to main
📋 QUALITY (6)     → next cleanup cycle
✅ GOOD PATTERNS   → keep these

Janitor directive: SUGGEST — fix B1-B3, then re-audit for NOTE.
```
