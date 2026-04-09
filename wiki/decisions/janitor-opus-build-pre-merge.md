# Agent4Wiki Opus Build Audit Report
**Repo:** `/home/claudebot/clones/agent4wiki-opus-build-20260408`
**Date:** 2026-04-09
**Auditor:** Opus 4.6 deep audit

---

## 1. Tool Findings (agent-janitor raw output)

### Summary
```
HEALTH SCORE: 0/100
VERDICT:      BLOCK

  [X] BLOCK   — 6 findings
  [!] SUGGEST — 570 findings
  [i] NOTE    — 332 findings
  Good patterns: 4 identified (tests, README, .gitignore, tsconfig)
```

### BLOCK findings (6)
All 6 are anthropic_api_key pattern matches in test/keychain.test.ts (lines 183, 192, 209, 241, 451, 480).
These are test fixtures referencing the string "anthropic_api_key" as a key name, not actual secrets. False positives.

### SUGGEST findings (570)
- ~540 are duplicates from quarantine directories (14 quarantined worktrees x ~24 findings each)
- ~15 hardcoded password assignments in raw context dumps, test fixtures, wiki docs
- ~24 unique missing test files for core modules

### NOTE findings (332)
- ~320 are quarantine duplicates of ~12 unique dead code findings
- Unique dead code: ~12 in source, ~6 in tests

---

## 2. Extended Semantic Findings

### 2.1 Swallowed Errors (HIGH)
20+ bare catch blocks in TypeScript. Key concerns:
- keychain/manager.ts:244,290,310 - Leak scanner silently skips files on ANY error
- keychain/manager.ts:340,363,424 - getAllFilesRecursive and loadMasterVault swallow all errors
- brain/prompt_builder.ts:59,65,95,125 - Template loading failures silently ignored
- brain/dispatcher.py:757 - Bare except: catches SystemExit/KeyboardInterrupt

### 2.2 Security Concerns (MEDIUM-HIGH)
1. runner.ts:101 and dispatcher.py:407 - --dangerously-skip-permissions flag on clone sessions
2. keychain/manager.ts:249 - Comment says >16 chars but code uses >= 8 threshold
3. buildCloneEnv() security divergence - Python denylist vs TypeScript allowlist
4. dispatcher.py:155-175 - SSH remote dispatch validates task_id but not other fields

### 2.3 Silent Failure Paths (MEDIUM)
1. mempalace_adapter.ts - Every method returns empty on connection failure. No reconnect. No alert.
2. user_agent/agent.ts:302-318 - Corrupted state.json silently resets
3. ratchet.ts:62-97 - Promotion creates synthetic handshake with tests_passed:true

### 2.4 Code Duplication / DRY Violations (MEDIUM)
1. Janitor evaluation duplicated TS and Python - auditor.ts vs dispatcher.py
2. Handshake parsing duplicated - runner.ts vs dispatcher.py
3. Registry cleanup duplicated in teardown.ts
4. buildCloneEnv() in both languages with different security approaches
5. ForgeRecord writing duplicated in auditor.ts and dispatcher.py

### 2.5 Missing Type Hints (LOW)
- dispatcher.py execute_task() returns untyped dict with varying shapes
- mempalace_adapter.ts uses any for MCP SDK classes

---

## 3. Logs / Version / Index Check Results

### Version
- package.json: 0.1.0 - no version bumps despite 9 build phases

### CHANGELOG
- No CHANGELOG, VERSION, or HISTORY file exists.

### README
- Well-written, describes architecture accurately
- Does NOT mention v9 or 211 tests

### Console Logs
- 15 out of 15 source files use raw console.log/error/warn
- No logging abstraction, no log levels, no structured output

### TODO/FIXME
- 3 found, 1 real feature gap: agent.ts:291 TODO wire to Haiku for summarization
- None blocking

---

## 4. Priority Fix List (Ordered by Severity)

### P0 - Fix Before Deploy
1. Bare except: in dispatcher.py:757 - catches SystemExit/KeyboardInterrupt
2. Quarantine dir polluting scans - 14 dirs inflate 24 findings to 570
3. Janitor BLOCK false positives - 6 BLOCKs on test key names cause hard BLOCK verdict

### P1 - Fix Soon
4. DRY: Janitor eval duplicated TS and Python - will diverge
5. MemPalace silent degradation - add reconnect, degraded-mode flag, Bridge notification
6. No logging abstraction - 50+ console calls need shared logger with levels
7. Missing CHANGELOG

### P2 - Address Eventually
8. buildCloneEnv() security divergence - standardize on TS allowlist
9. Handshake parsing duplication
10. Registry deregister duplication in teardown.ts
11. Unit test coverage - 24 modules have no unit tests
12. Comment/code mismatch in keychain leak scanner
13. Version bump from 0.1.0
14. raw/ directory committed with large context dumps
