# JANITOR AUDIT REPORT — Agent4wiki Full Repo

> Auditor: Janitor (Opus)
> Date: 2026-04-08
> Scope: Full repomix (97 files, 14K lines) — core/, brain/, wiki/, scripts/, config, templates
> Prior audits: review-code-audit-1, review-opus-review5
> System health score: **17/25** (up from 14/25 at last audit)

---

## SEVERITY SUMMARY

| Severity | Count | Category |
|----------|-------|----------|
| 🔴 RED | 5 | Fix before Opus build — compile/security/correctness |
| 🟡 YELLOW | 11 | Fix during build — structural, consistency, hygiene |
| 🟢 GREEN | 6 | Track — minor, cosmetic, future improvement |

---

## 🔴 RED — Fix Before Opus Build

### R1. MissionBrief defined twice — incompatible shapes

**Files:** `core/keychain/manager.ts` (line 11571, 4 fields) and `core/brain/planner.ts` (line 789, 10 fields)
**Impact:** `npx tsc --noEmit` fails. Nothing compiles. Blocks all phases.
**Fix:** Delete the 4-field MissionBrief from manager.ts. Import from planner.ts. This is Phase 0, Step 0.1 in plan-build-v1.md — already documented but NOT YET EXECUTED.
**Directive:** REMOVE

### R2. Three competing lifecycle owners

**Files:** `KeychainManager.executeCloneMission()`, `CloneWorker.execute()`, `CloneRunner.run()`
**Impact:** Opus will implement all three and they'll fight at runtime. executeCloneMission() wraps the full lifecycle with its own try/finally. CloneWorker.execute() does the same thing. CloneRunner also spawns the claude process independently.
**Fix:** Delete `executeCloneMission()` and `launchClone()` from KeychainManager. It becomes a credential-only service (provisionEnvironment + revokeEnvironment + scanForLeaks). CloneWorker is the lifecycle owner. CloneRunner handles process spawning. One owner, one path.
**Directive:** REMOVE (executeCloneMission, launchClone from manager.ts)

### R3. Injection variable names don't match between template and builder

**Files:** `templates/code-clone-TASK.md` uses `{INJECT_SOUL_MD_HERE}`, `{INJECT_ALLOWED_PATH_HERE}`, `{INJECT_BRAIN_DELEGATED_TASK_HERE}`. `core/brain/prompt_builder.ts` replaces `{INJECT_SOUL_HERE}`, `{INJECT_ALLOWED_PATHS_HERE}`, `{INJECT_TASK_HERE}`.
**Impact:** Silent failure. Template renders with unreplaced variables. Clone gets instructions saying "{INJECT_SOUL_MD_HERE}" literally instead of the soul content.
**Fix:** Standardize ALL variable names in ONE canonical list. Update both template and builder to match. The builder's names are cleaner — adopt those. Update template to: `{INJECT_SOUL_HERE}`, `{INJECT_ALLOWED_PATHS_HERE}`, `{INJECT_ALLOWED_ENDPOINTS_HERE}`, `{INJECT_WIKI_CONTEXT_HERE}`, `{INJECT_TASK_HERE}`.
**Directive:** UPDATE

### R4. scanForLeaks() always returns true — security scanner disabled

**File:** `core/keychain/manager.ts` line ~11684
**Impact:** Every clone passes the security check. A clone that hardcodes `sk-ant-api03-...` in its output will pass. The Janitor never sees FAILED_REQUIRE_HUMAN for credential leaks. This was flagged in review-code-audit-1 as 🔴 R5 and is STILL unfixed.
**Fix:** Implement against patterns.yaml (the regex patterns already exist in `core/keychain/config/patterns.yaml`). At minimum: iterate modified files in worktree, check each against vault values (exact match) and patterns.yaml regexes.
**Directive:** UPDATE (Phase 2 in build plan, but Opus must know this is fake-passing)

### R5. loadMasterVault() returns empty object — all clones get zero credentials

**File:** `core/keychain/manager.ts`
**Impact:** Every `buildScopedEnv()` call throws `SECURITY HALT: Requested key X does not exist in vault` because the vault is empty. No clone can ever run. This was flagged in review-code-audit-1 as 🔴 R4 and review-gemini-review7 as blind spot #2. STILL unfixed.
**Fix:** Phase 2 in build plan — MVP reads from .env file (not encrypted vault yet). Must be implemented before any clone can execute.
**Directive:** UPDATE

---

## 🟡 YELLOW — Fix During Build

### Y1. Wiki page count mismatch: index claims 56, actual files = 60

**Files:** wiki/index.md header says "Total pages: 56". Actual .md files in wiki/ = 60.
**Impact:** 4 wiki pages exist but aren't in the index. The Brain reads the index to find pages — unindexed pages are invisible to the Brain.
**Missing from index:** Need to identify which 4 pages are missing. Likely candidates: some recently added pages where the index count wasn't updated.
**Directive:** UPDATE (recount, add missing entries)

### Y2. Orphan wikilinks — 2 real orphans

**Referenced but no page exists:**
- `[[concept-clone-lifecycle]]` — referenced in wiki pages but no file exists. Content is split across `core/clones/lifecycle/` README and concept-git-worktrees. Either create the page or remove the references.
- `[[concept-routing-classifier]]` — referenced but no page exists. The classifier is documented in segment-user-agent and routing/classifier.ts but has no standalone concept page.
**Note:** `[[page-name]]` and `[[references]]` are from CLAUDE.md examples, not real orphans.
**Directive:** UPDATE (create pages or fix references)

### Y3. Stale "six segments" references in a seven-segment system

**Files:** concept-token-economics.md says "How tokens are budgeted across the six segments." The index repeats this. review-architecture-audit mentions "all 6 segments." 
**Impact:** Confuses Opus about whether there are 6 or 7 segments. Bridge was added as Segment 7 and decision-seven-segments documents why, but older pages weren't all updated.
**Directive:** UPDATE (find-replace "six segments" → "seven segments" in concept-token-economics and index)

### Y4. No test directory in the repo

**Impact:** package.json has `"test": "jest"` but there's no `test/` directory, no jest.config, no test files. plan-build-v1.md specifies tests for each phase but they have nowhere to live yet.
**Fix:** Create `test/` directory with jest.config.ts. The build plan already defines the tests — they just need a home.
**Directive:** UPDATE (create test/ with config before Phase 0)

### Y5. 56 TODO markers across the codebase

**Impact:** Not all TODOs are equal. Some are intentional stubs (Forge Phase 7 — correct), some are blocking bugs (scanForLeaks, loadMasterVault — must fix). The TODOs need triage.
**Breakdown estimate:** ~20 are in Forge stubs (intentional, Phase 7), ~10 are in wiki review pages (informational), ~15 are in core/ files (need attention in Phase 0-4), ~11 are in MemPalace adapter (waiting for MCP schema).
**Directive:** CHALLENGE (triage TODOs: tag as P0/P1/P2/DEFERRED)

### Y6. 44 console.log/warn/error calls in production code

**Impact:** The Bridge segment's hard rule is "ALL output via Bridge." But core/ files use console.log/warn/error extensively. These will be invisible to the user in production. Some are appropriate (process-internal logging), some should go through Bridge (error alerts, security warnings).
**Fix:** Keep console.log for DEBUG-level internal tracing. Route all user-facing messages and security alerts through Bridge. Add a note in the Opus brief that console output is for developer debugging only.
**Directive:** CHALLENGE (audit each call: keep for debug, route to Bridge for alerts)

### Y7. Python dispatcher paths likely stale

**File:** brain/dispatcher.py
**Impact:** The dispatcher was written when the directory structure was different. Paths like `WIKI_INDEX`, `USER_STATE`, `SOUL_MD` point to locations that may not match the current repo layout. review-gemini-review7 flagged this. The bridge-multi-channel log entry says "all broken paths in dispatcher.py fixed" but the repomix still shows the Python dispatcher with the original path variables.
**Directive:** CHALLENGE (verify all paths in dispatcher.py against actual repo structure)

### Y8. templates/ directory not consolidated

**Files:** Templates exist in three locations: `templates/code-clone-TASK.md`, `core/clones/templates/README.md`, and the TASK-FORMAT.md in both `brain/` and `raw/`.
**Impact:** Which template is canonical? The README in core/clones/templates/ says "Migration target — templates will be moved here from /templates/". But the migration hasn't happened.
**Fix:** Move code-clone-TASK.md to core/clones/templates/code.md. Delete the top-level templates/ directory. Update prompt_builder.ts template path.
**Directive:** MERGE

### Y9. scopes.yaml uses skill names, but task JSON uses skill field

**File:** core/keychain/config/scopes.yaml defines scopes by skill name (code, research, devops, kids_bot). The task JSON has a `skill` field. But the Keychain's `buildScopedEnv()` takes a `requiredKeys` array, not a skill name.
**Impact:** The scopes.yaml is never actually read by any code. The Brain would need to look up scopes.yaml to determine which keys a skill needs, then pass those as requiredKeys. This lookup doesn't exist yet.
**Fix:** Add a `getScopeKeys(skill: string): string[]` method to KeychainManager that reads scopes.yaml and returns the allowed keys for that skill. brain/dispatcher.ts already calls this method (it's one of the compile errors in R1 of review-code-audit-1).
**Directive:** UPDATE

### Y10. bridge.py reads .env from repo root on CLI test

**File:** brain/bridge.py `__main__` block reads `.env` from repo root: `env_path = Path(__file__).parent.parent / ".env"`
**Impact:** In production, bridge.py should get credentials from the Keychain, not from a root .env file. The CLI test mode is fine for smoke testing, but the production path should use `os.environ` (pre-populated by the Keychain or the Telegram watchdog process).
**Directive:** NOTE (acceptable for MVP, flag for Phase 2 integration)

### Y11. Wiki log.md entries are not in chronological order

**File:** wiki/log.md
**Impact:** The log is supposed to be append-only and chronological, but entries are out of order. Some 2026-04-08 entries appear before 2026-04-07 entries. The "synthesis | Six-segment architecture finalized" entry (logically one of the first) appears after several 2026-04-08 entries.
**Directive:** UPDATE (re-sort entries chronologically, newest at bottom)

---

## 🟢 GREEN — Track

### G1. Forge stubs are complete and well-documented
All four Forge files (evaluator, metrics_db, ratchet, shadow_runner) throw descriptive errors, have clear phase annotations, and define their interfaces properly. These are intentional stubs — do not implement until Phase 7. No action needed.

### G2. bootstrap scripts cover both Linux and Windows
scripts/bootstrap-linux.sh and scripts/bootstrap-windows.ps1 exist with real implementation (not stubs). They handle dependency installation, fleet registration, and systemd/Task Scheduler setup. These are ahead of the build plan.

### G3. wiki-lint.sh exists and is functional
The script counts pages, checks index entries, and validates wikilinks. It could be a pre-commit hook or GitHub Action. Currently not wired into CI.
**Recommendation:** Add to `.github/workflows/wiki-lint.yml` as a PR check.

### G4. .env.example is comprehensive
Lists all required and optional variables with setup instructions and links. Good onboarding artifact.

### G5. Bridge is fully implemented
brain/bridge.py is the only completed segment — 5 channels, send/broadcast/ping modes, CLI smoke test. This is the output layer and it works. Everything else can be tested through it.

### G6. scopes.yaml includes endpoint restrictions
The scopes config defines not just which keys each skill can access, but also which network endpoints are allowed. This is the network scope the TASK template was missing (per Opus review 2). The data is there; the enforcement code isn't yet.

---

## CROSS-AUDIT: REVIEW-CODE-AUDIT-1 STATUS

Checking which findings from the prior code audit are resolved:

| Prior Finding | Status | Notes |
|--------------|--------|-------|
| R1: provisionEnvironment missing | ✅ Documented in plan-build-v1 Phase 0.2 | Code not written yet |
| R2: revokeEnvironment missing | ✅ Documented in plan-build-v1 Phase 0.3 | Code not written yet |
| R3: getScopeKeys missing | ✅ Documented in plan-build-v1 Phase 0.4 | Code not written yet |
| R4: loadMasterVault returns {} | 🔴 Still unfixed (this audit R5) | Phase 2 |
| R5: scanForLeaks always true | 🔴 Still unfixed (this audit R4) | Phase 2 |
| R6: MissionBrief duplicate | 🔴 Still unfixed (this audit R1) | Phase 0.1 |
| S1-S9 structural issues | ⬜ Mixed — some documented, none executed | |

**Assessment:** The prior audit's findings are all documented and planned, but NONE have been executed. The repo is in the same compile-broken state as the last audit. The documentation is ahead of the code. This is expected — the build plan exists specifically to fix these in order — but worth noting that the system health score improvement (14→17) comes from documentation completeness, not code fixes.

---

## WIKI HEALTH

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Pages in index | 56 | match actual | 🟡 4 behind (actual: 60) |
| Orphan wikilinks | 2 | 0 | 🟡 concept-clone-lifecycle, concept-routing-classifier |
| Stale segment count refs | 3+ | 0 | 🟡 "six segments" in seven-segment system |
| Log entries | 28 | chronological | 🟡 out of order |
| Cross-references per page | ~3-5 avg | ≥3 | ✅ healthy |
| Decision documentation | 22 pages | comprehensive | ✅ exceptional |
| Review documentation | 12 external reviews | — | ✅ unprecedented depth |

---

## SYSTEM HEALTH SCORE: 17/25

| Category | Score | Max | Notes |
|----------|-------|-----|-------|
| Architecture clarity | 5 | 5 | 7 segments, clean boundaries, well-documented |
| Code completeness | 2 | 5 | Compiles: NO. Stubs: ~40%. Bridge: 100%. Rest: 0-20% |
| Security posture | 2 | 5 | Gitignore: solid. Scanner: disabled. Vault: empty. Credentials: unprotected |
| Wiki health | 4 | 5 | 60 pages, 12 reviews, 28 log entries. Minor orphans and count drift |
| Test infrastructure | 0 | 2.5 | No test directory, no test files, no CI. Jest configured but empty |
| Build readiness | 4 | 2.5 | Build plan is exceptional. Phase-by-phase with exact code. DoD defined. |

**Previous score:** 14/25 (review-opus-review5)
**Change:** +3 (from documentation, planning, and Bridge implementation)
**Blocking issue:** The system does not compile. Score cannot exceed 17 until Phase 0 completes.

---

## TOP 5 ACTIONS (Priority Order)

1. **Phase 0: Fix 5 compile errors** (R1, R2, R3 + the 3 missing methods from review-code-audit-1). Target: `npx tsc --noEmit` exits 0. This unblocks everything.

2. **Create test/ directory** with jest.config.ts and the Phase 0 tests from plan-build-v1. Without tests, you can't verify compile fixes.

3. **Standardize injection variable names** (R3). One canonical list, template and builder both match. Do this in Phase 0 alongside the compile fixes.

4. **Fix wiki count and orphans** (Y1, Y2, Y3). Run `scripts/wiki-lint.sh`, fix the output. Re-sort log.md chronologically. Update "six segments" → "seven segments."

5. **Consolidate templates/** (Y8). Move code-clone-TASK.md to core/clones/templates/code.md. Delete top-level templates/ directory. One location for all templates.

---

*Janitor out. Doubted everything. Found 22 issues. The architecture is sound. The documentation is exceptional. The code doesn't compile. Fix Phase 0 and this system is ready to run.*
