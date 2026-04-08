# Review: Janitor Audit 2 — Full Repo (17/25)

> Source: raw/Janitor-audit2-full-repo.md | Auditor: Janitor (Opus) | Date: 2026-04-08
> Scope: Full repomix (97 files, 14K lines) — core/, brain/, wiki/, scripts/, config, templates
> Prior audits: review-code-audit-1, review-opus-review5
> System health score: **17/25** (up from 14/25)

22 findings: 5 🔴 RED, 11 🟡 YELLOW, 6 🟢 GREEN.

---

## 🔴 RED

### R1 — MissionBrief Defined Twice ⏳ Opus Phase 0

Defined in `core/keychain/manager.ts` (4 fields) and `core/brain/planner.ts` (10 fields). `npx tsc --noEmit` fails. Nothing compiles. Plan-build-v1 Phase 0.1 — documented but not yet executed.

### R2 — Three Competing Lifecycle Owners ⏳ Opus Phase 0

`KeychainManager.executeCloneMission()` + `CloneWorker.execute()` + `CloneRunner.run()` all own the full lifecycle. Fix: delete `executeCloneMission()` and `launchClone()` from KeychainManager. Keychain becomes credential-only service. CloneWorker owns lifecycle, CloneRunner handles process spawn. Marked DEPRECATED in brief v4.

### R3 — Injection Variable Names Mismatch ✓ Fixed

Template used `{INJECT_SOUL_MD_HERE}`, `{INJECT_ALLOWED_PATH_HERE}`, `{INJECT_BRAIN_DELEGATED_TASK_HERE}`. Builder replaced different names. Silent failure — unreplaced variables sent to clone literally.

**Fix applied:** `templates/code-clone-TASK.md` updated to canonical names:
- `{INJECT_SOUL_HERE}`, `{INJECT_ALLOWED_PATHS_HERE}`, `{INJECT_ALLOWED_ENDPOINTS_HERE}`, `{INJECT_WIKI_CONTEXT_HERE}`, `{INJECT_TASK_HERE}`

### R4 — scanForLeaks() Always Returns true ⏳ Opus Phase 2

Security scanner hardcoded disabled. Every clone passes. `patterns.yaml` exists with regex patterns but is never read. Flagged in review-code-audit-1 as R5. Still unfixed.

### R5 — loadMasterVault() Returns {} ⏳ Opus Phase 2

Every clone launch fails with `SECURITY HALT: Requested key X does not exist in vault`. No clone can run. Flagged in review-code-audit-1 as R4 and review-gemini-review7 as blind spot #2. Still unfixed.

---

## 🟡 YELLOW

### Y1 — Wiki Page Count 56 vs 60 ✓ Already Fixed (pre-audit)

Index claimed 56, actual was 60. Fixed in previous session — index now 60, wiki-lint.sh passes 60/60/0.

### Y2 — Orphan Wikilinks ✓ Fixed

Two orphan wikilinks with no backing files:
- `[[concept-clone-lifecycle]]` — **CREATED** this session. Full lifecycle sequence documented: spawn → keychain → setup.sh → run → handshake → janitor → teardown. Handshake protocol, security invariants, path traversal defence.
- `[[concept-routing-classifier]]` — **CREATED** this session. DIRECT/BRAIN_ONLY/FULL_PIPELINE logic, why regex (not LLM), state.json trigger, relationship to dispatcher.

### Y3 — "Six Segments" References ✓ Already Fixed (pre-audit)

concept-token-economics.md and index.md both said "six segments." Fixed in previous session — all active pages now say "seven segments."

### Y4 — No test/ Directory ⏳ Opus Phase 0

`package.json` has `"test": "jest"` but no `test/` directory, no jest.config, no test files. plan-build-v1 defines the tests — they need a home. Opus creates this in Phase 0.

### Y5 — 56 TODO Markers Need Triage ⏳ Opus

Breakdown: ~20 Forge stubs (intentional, Phase 7), ~10 wiki review pages (informational), ~15 core/ files (Phase 0-4), ~11 MemPalace adapter (waiting for MCP schema). Opus to tag P0/P1/P2/DEFERRED.

### Y6 — 44 console.log/warn/error Calls ⏳ Opus

Bridge rule: ALL output via Bridge. But core/ uses console extensively. Keep console.log for DEBUG-level internal tracing. Route all user-facing alerts through Bridge. Opus audits during build.

### Y7 — Python Dispatcher Paths Stale ✓ Already Fixed (pre-audit)

Fixed in previous session — all paths use `BASE_DIR = Path(__file__).parent.parent.resolve()`, USER_STATE, SOUL_MD, TEMPLATES all corrected.

### Y8 — Templates in 3 Locations ⏳ Deferred

Templates exist in `templates/`, `core/clones/templates/README.md`, `brain/`. R3 (injection variable names) fixed. Full migration (move `code-clone-TASK.md` → `core/clones/templates/code.md`, delete top-level `templates/`) deferred — requires prompt_builder.ts path update, part of Opus build.

### Y9 — scopes.yaml Never Read ⏳ Opus Phase 2

`buildScopedEnv()` takes `requiredKeys[]` not a skill name. The Brain needs `getScopeKeys(skill: string): string[]` lookup that reads scopes.yaml. Method listed in plan-build-v1 Phase 0.4.

### Y10 — bridge.py CLI Reads Root .env ✓ NOTE — Acceptable MVP

CLI smoke test mode reads `.env` from repo root. Production path uses `os.environ` (pre-populated by Keychain or watchdog). Acceptable for MVP, flag for Phase 2 integration.

### Y11 — log.md Out of Order ✓ Fixed

Several 2026-04-07 entries appeared after 2026-04-08 entries. Re-sorted chronologically this session (stable sort — within-day order preserved). 47 entries, all 2026-04-07 entries now precede all 2026-04-08 entries.

---

## 🟢 GREEN

### G1 — Forge Stubs Complete ✅
All 4 Forge files throw descriptive errors with phase annotations. Intentional — do not implement until Phase 7.

### G2 — Bootstrap Scripts Complete ✅
`scripts/bootstrap-linux.sh` + `scripts/bootstrap-windows.ps1` — both implemented, not stubs. Ahead of build plan.

### G3 — wiki-lint.sh Functional ✅
Counts pages, checks index, validates wikilinks. Suggestion: add to `.github/workflows/wiki-lint.yml` as a PR check.

### G4 — .env.example Comprehensive ✅
All required and optional variables with setup instructions.

### G5 — Bridge Fully Implemented ✅
The only complete segment — 5 channels, 3 modes (send/broadcast/ping), CLI smoke test.

### G6 — scopes.yaml Has Endpoint Restrictions ✅
Not just key scoping — network endpoints also defined per skill. Enforcement code pending (Y9).

---

## Cross-Audit Status vs review-code-audit-1

| Prior Finding | Status |
|--------------|--------|
| R1: provisionEnvironment missing | ✅ Documented in plan-build-v1 Phase 0.2 |
| R2: revokeEnvironment missing | ✅ Documented in plan-build-v1 Phase 0.3 |
| R3: getScopeKeys missing | ✅ Documented in plan-build-v1 Phase 0.4 |
| R4: loadMasterVault returns {} | 🔴 Still unfixed (this audit R5) — Phase 2 |
| R5: scanForLeaks always true | 🔴 Still unfixed (this audit R4) — Phase 2 |
| R6: MissionBrief duplicate | 🔴 Still unfixed (this audit R1) — Phase 0 |

**Assessment:** Score 14→17 from documentation + Bridge implementation. The system still does not compile. Score cannot exceed 17 until Phase 0 completes.

---

## System Health Score: 17/25

| Category | Score | Max |
|----------|-------|-----|
| Architecture clarity | 5 | 5 |
| Code completeness | 2 | 5 |
| Security posture | 2 | 5 |
| Wiki health | 4 | 5 |
| Test infrastructure | 0 | 2.5 |
| Build readiness | 4 | 2.5 |

*See also: [[review-code-audit-1]], [[review-opus-review5]], [[plan-build-v1]], [[concept-clone-lifecycle]], [[concept-routing-classifier]]*
