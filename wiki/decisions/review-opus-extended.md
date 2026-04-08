# Review — Opus Extended Thinking: opus-build Branch

> Date: 2026-04-08
> Source: `raw/opus-extended-review.md`
> Model: Claude Opus 4.6 with extended thinking enabled
> Scope: Full opus-build repomix (9 commits at time of review)
> Verdict: 39 findings (4 blockers, 6 high, 9 medium, 10 low + 10 test/script issues)

## Extended Thinking: Did It Make a Difference?

**Yes — substantially.** Comparison against Gemini review-68 (same codebase):

| Dimension | Gemini (no extended thinking) | Opus (extended thinking) |
|-----------|-------------------------------|--------------------------|
| Total findings | 4 | 39 |
| Blockers found | 0 | 4 |
| Cross-file tracing | Surface level | Deep (caught Python↔TS divergence) |
| False positives | 1 (.env 0o600 — already correct) | 0 |
| Test coverage gaps | Not assessed | 6 test gaps identified |
| Architecture conflicts | Not identified | Python/TS dual implementation drift flagged |
| Root cause depth | Found symptom (startsWith) | Found cause chain (injection var → silent failure) |

The most critical findings Gemini missed entirely:
- Template injection variable mismatch (#3): every Python dispatcher run produces raw `{INJECT_SOUL_HERE}` placeholder strings — completely silent failure
- Worktree path divergence (#32): Python and TS create worktrees in different directories — can never clean each other up
- Template filename mismatch (#33): neither Python nor TS path finds the actual template file
- CLI credential exposure (#1): context (potentially containing secrets after injection) visible in `/proc/<pid>/cmdline`

Extended thinking appears to enable cross-file chain tracing: Opus followed the data flow from template → dispatcher.py injection → variable name check → template file → and found the chain broken in three places. Gemini reviewed each file individually and missed the integration failures.

**Verdict for our system:** Extended thinking is worth enabling for architecture/integration reviews where cross-file reasoning matters. For single-file correctness (like the path traversal fix Gemini caught), standard mode is sufficient.

## Findings Applied (commit 6e6077b)

### Blockers — All Fixed ✅

| # | Finding | Fix |
|---|---------|-----|
| 3 | Template injection variables wrong in dispatcher.py | Renamed to canonical names: INJECT_SOUL_HERE, INJECT_TASK_HERE, INJECT_ALLOWED_PATHS_HERE |
| 33 | Template filename mismatch (neither path finds code-clone-TASK.md) | Added skill→filename map in both spawner.ts and dispatcher.py |
| 1 | CLI arg credential exposure (-p context visible in /proc) | Switched to -p @promptfile — context written to file, not passed inline |
| 32 | Worktree path divergence (Python: BASE_DIR.parent, TS: state/worktrees/) | Aligned dispatcher.py to state/worktrees/ |

### Should-Fix — Applied ✅

| # | Finding | Fix |
|---|---------|-----|
| 9 | Keychain revocation return value ignored | Check return value; leak detected → log SECURITY + force BLOCK |
| 14 | Stdout truncated before handshake extraction | Preserve full stdout as stdout_full before 2000-char storage truncation |
| 15 | JSON.parse without try/catch in planner.ts | Wrapped in try/catch with typed error message |

### Known Issues (tracked, not yet fixed)

| # | Finding | Severity | Notes |
|---|---------|----------|-------|
| 2 | .env file dead code for TS clones (process.env passed directly) | High | Refactor in Phase 5 |
| 4 | --dangerously-skip-permissions hard-coded | Blocker for prod | Known, required for dev |
| 5 | getScopeKeys() async/sync type mismatch | High | Minor — awaiting non-promise works in JS |
| 6 | import urllib.parse after class definition in bridge.py | Medium | Cosmetic |
| 7 | Hand-rolled YAML parsers (fragile) | Medium | Replace with js-yaml/PyYAML in Phase 5 |
| 8 | dispatcher.py worktree path — fixed ✅ | — | — |
| 10 | Classifier substring matching causes false positives | Medium | Add word boundary matching |
| 16 | Python/TS Janitor logic divergence | Medium | Document canonical path (TS), plan consolidation |
| 22 | No CloneWorker.execute() test | High | 1-2h test write, Phase 5 |
| 25 | Integration tests create worktrees in live repo | Medium | Isolate to temp git repo |
| 26 | triggerFullPipeline test leaves files in inbox on failure | Medium | Move cleanup to afterEach |
| 29 | bootstrap-linux.sh curl | sudo bash pattern | Medium | Pin NodeSource hash |
| 30 | Duplicate AGENT_BASE_DIR in .env after bootstrap | Low | Fix sed logic |
| 33 | Template filename — fixed ✅ | — | — |
| 34 | No dispatcher heartbeat for stall detection | Medium | Add heartbeat file write |
| 35 | events/dispatcher.jsonl grows unbounded | Low | Add rotation |

## Test Results After Patches

40 Jest + 17 pytest = 57/57 pass.

## Related Pages

- [[review-gemini-code-review68]] — Gemini review (4 findings, for comparison)
- [[build-state-2026-04-08]] — Build state before this review
- [[plan-forge-benchmarking]] — Extended thinking quality validated the Phase 1 benchmark design
