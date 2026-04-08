The codebase already has all V7 changes applied. This is a post-implementation review, not a pre-build review. Every fix from the plan is present in the code.

🧠 BRAIN perspective (planner, dispatcher)
Good:

A1 vault leak fix is clean — SENSITIVE_ENV_KEYS set + build_clone_env() is used in launch_session(). Correct pattern.
C1 shared config works: clone_config.json exists, both Python and TS read from it with fallback defaults. Smart defensive coding.
Context assembly in dispatcher.py is well-structured — separate paths for brain/clone/janitor/forge task types.

Bad:

dispatcher.py loads clone_config.json at module import time with a bare open(). If the file is missing, the fallback silently swallows the error. That's fine for MAX_RETRIES, but if someone later adds a critical config key, they'll get silent None values.
The assemble_context() function has hardcoded token budgets (500, 300, 200) with no shared constant or config. These will drift.

Ugly:

process_task_file() re-reads the active task file from disk to check for target_node with a bare except: — swallowing all exceptions silently. This is a code smell.

Untested:

Fleet routing (dispatch_remote) has zero tests. The SSH+scp polling loop is entirely untested and has a 10-minute timeout with no backoff strategy.
extract_handshake() regex fallback (re.findall(r'\{[^{}]*"status"[^{}]*\}')) will break on nested JSON. No test covers this edge case.


🤖 CLONE perspective (worker, spawner, runner)
Good:

B1 allowlist is correct and minimal — REQUIRED_ENV_KEYS is a tight 6-key list. Much safer than the old blacklist.
B2 spawner setup.sh has all four npm hardening flags. Confirmed in code.
The retry loop in CloneWorker.execute() is clean — SUGGEST appends feedback, BLOCK exits immediately.

Bad:

REQUIRED_ENV_KEYS is missing SHELL and USER — some npm scripts and git operations expect these. This could cause silent failures in worktrees that are hard to debug.
buildCloneEnv() is exported as a bare function and exists independently in dispatcher.py. Two implementations of the same concept in two languages with slightly different key lists (Python strips a blacklist, TS uses an allowlist). They are philosophically opposite approaches that could diverge.

Untested:

No integration test verifies that a real npm install --ignore-scripts in a spawned worktree actually works end-to-end. The test only checks string content of the generated script.
CloneRunner.run() timeout behavior — what happens when the subprocess hangs? Is SIGKILL sent? No test.


🔒 KEYCHAIN / SCANNER perspective
Good:

A2 git status --porcelain fix is correct — catches untracked files. The parsing (line.slice(3)) matches git's porcelain format.
A4 largeFilesSkipped is surfaced in ScanResult and wired into janitor notes. Clean chain.
Exact-match secret detection covers both long and short secrets via exactMatchSecrets set.

Bad:

The 1MB threshold is still a silent skip with only a log warning + array entry. A determined attacker can still pad a file to 1.1MB, hide a key at byte 1,048,577, and the only signal is a janitor note that says "manual review needed" — which nobody reviews automatically. The plan flags it but doesn't close the loop.
scanForLeaks() compiles new RegExp(pattern.regex) on every file in the loop. For large worktrees this is O(files × patterns) with regex compilation overhead on each iteration. Should precompile.

Ugly:

The entropy filter threshold changed from 16 chars to 8 chars (comment says ">16 char entropy filter" but code checks v.length >= 8). The comment and code disagree — which is correct?

Untested:

Renamed files in git status --porcelain output (format: R  old -> new) — the line.slice(3) parse will return old -> new as a single filename. No test covers renames.
Symlinks in worktrees — fs.readFileSync on a symlink pointing outside the worktree could read arbitrary files. No boundary check.


⚖️ JANITOR / AUDITOR perspective
Good:

A3 fix is correct: handshake.tests_passed === false instead of !== true. Both TS auditor and Python janitor_evaluate() now use the right check. The TS version checks handshake.tests_passed === false at line level, Python checks not tests_passed and source_files.
Warn keywords loaded from shared heuristics.json in both TS and Python — single source of truth.

Bad:

Python/TS janitor logic drift: The Python janitor_evaluate() in dispatcher.py and the TS Janitor.evaluateMission() in auditor.ts implement the same decision tree with different priority ordering. TS checks BLOCKED_IMPOSSIBLE before tests_passed === false, Python checks circuit breaker → BLOCKED_IMPOSSIBLE → FAILED_REQUIRE_HUMAN → COMPLETED. They'll produce different results for edge cases like {status: "COMPLETED", tests_passed: false} — TS BLOCKs it at step 3, Python SUGGESTs it in the COMPLETED branch. This is a latent bug.
The "missing tests" check in TS requires BOTH testFiles.length === 0 AND handshake.tests_passed === false. But tests_passed === false means tests were run and failed, not that they're missing. The heuristic name doesn't match the logic.

Untested:

No test covers the interplay between largeFilesSkipped notes and the warn_keywords check. If "LARGE FILES SKIPPED" contains a warn keyword like "slow", it could trigger a double-SUGGEST.


🔥 FORGE perspective (evaluator, metrics, ratchet)
Good:

writeForgeRecord() is called from both Python and TS paths, writing to the same forge/events.jsonl. Consistent schema.

Bad:

C2 differentiation (BRAIN_ONLY gets wiki context, DIRECT doesn't) is implemented but the wiki pages are hardcoded: ['concept-routing-classifier', 'segment-brain']. If those pages don't exist, loadWikiContext returns empty and BRAIN_ONLY falls back to being identical to DIRECT again — silently defeating the whole purpose.
C3 confidence gate returns a user-facing string with the raw float (confidence: 0.3). Leaking internal scoring to users is poor UX and gives attackers a calibration target.

Untested:

No Forge test verifies that the ratchet actually reads largeFilesSkipped from forge records and does anything with it.
The confidence threshold (0.5) is a magic number with no config or test around boundary behavior (0.49 vs 0.50 vs 0.51).


Summary Scorecard
AspectScoreNotesSecurity fixes (A1-A4)8/10Correct implementations, but rename parsing and symlink edges untestedHardening (B1-B2)7/10Allowlist is right approach but missing SHELL/USER; TS/Python env strategies divergeArchitecture (C1-C3)6/10Config sharing works, but BRAIN_ONLY differentiation is fragile, confidence UX leaks internalsTest coverage5/10Happy paths tested, edge cases (renames, symlinks, fleet routing, regex fallback) notTS↔Python parity4/10Biggest risk — two janitor implementations with different decision trees will diverge
Top 3 actions I'd prioritize next:

Unify the Python/TS janitor decision trees or kill the Python one entirely (make dispatcher.py call the TS auditor via npx)
Add rename/symlink edge-case tests to the scanner
Move confidence threshold and hardcoded wiki page lists into clone_config.json