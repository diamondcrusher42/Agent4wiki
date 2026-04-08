# Build State 2026-04-09 v9

> Branch: `opus-build`
> Commits: `5242a0c` (Phase A) + `5ffb5e4` (Phase B)
> Tests: 198 → 211 (+13)
> TSC: clean throughout

## What was built

Plan-build-v9 executed by Opus 4.6. All 6 fixes implemented, none skipped.

### Phase A — Critical (commit 5242a0c)

**A1: Dead code removed from `janitor_evaluate()`**
- `brain/dispatcher.py`: 30 lines of unreachable V1 logic (lines 674-704) deleted
- V1 returned SUGGEST on failed tests; V2 (live) returns BLOCK — divergent behavior, dead code was a confusion trap
- +3 pytest tests: BLOCKED_IMPOSSIBLE→BLOCK, tests_passed:False→SUGGEST, tests_passed:None→not SUGGEST

**A2: TOCTOU atomic fd fix in `scanForLeaks()`**
- `core/keychain/manager.ts`: refactored from separate `realpathSync` + `statSync` + `readFileSync` to `openSync` first, then `realpathSync` for boundary check, then `fstatSync(fd)` + `readFileSync(fd)` — all on same fd
- Closes the race window between realpath check and read (symlink swap attack)
- Existing symlink tests passed without modification

**A3: Atomic task pickup with `_claim_task()`**
- `brain/dispatcher.py`: added `_claim_task()` using `os.rename()` — raises `FileNotFoundError` if another thread already moved the file
- `watch()` now skips tasks where `_claim_task()` returns False
- `process_task_file()` updated to detect when file is already in `active/` (from claim) vs inbox
- +3 pytest tests: single claim succeeds, second claim fails, task processed exactly once

### Phase B — Reliability (commit 5ffb5e4)

**B1: `runRepomix()` shell interpolation fixed**
- `core/clones/lifecycle/runner.ts`: `execAsync('npx repomix ...')` → `execFileAsync('npx', ['repomix', '--output', 'repomix.txt'], { cwd, env })`
- Consistent with runSetup() which was already fixed in v8
- +2 Jest tests: array form runs correctly, path with spaces doesn't break

**B2: ForgeRecord unified — all directives**
- `core/janitor/auditor.ts`: restructured `evaluateMission()` from early-return to if/else-if with single `writeForgeRecord()` call at the end
- Previously: only NOTE wrote ForgeRecord; now: BLOCK, SUGGEST, NOTE all write
- +3 Jest tests: NOTE→record, SUGGEST→record, BLOCK→record (using jest.spyOn on private method)

**B3: `.dispatcher-prompt.md` cleanup on all error paths**
- `brain/dispatcher.py`: moved prompt file write inside try block; finally always deletes if exists
- Previously: exception in `assemble_context()` before try/finally left file in worktree
- +2 pytest tests: exception→no file left, success→file removed

## Test counts

| Suite | v8 | v9 | Delta |
|---|---|---|---|
| Jest | 156 | 160 | +4 |
| pytest | 42 | 51 | +9 |
| **Total** | **198** | **211** | **+13** |

Plan estimated +14; Opus wrote +13 (B3 "crash mid-launch" merged with "exception" case since finally handles both identically).

## Known TODOs (carried from v8)

- MCP transport layer (stub only)
- Forge evaluator prompt gameability (HIGH-2 from opus-review95)
- `--dangerously-skip-permissions` with no sandbox (HIGH-3 — systemic, single-operator acceptable)
- Handshake file read-then-delete not atomic (MED-3)
- teardown.ts merge uses execSync string interpolation (MED-5)

## Next step

Gemini + Opus review of v9 state. If clean: candidate for merge to main.
