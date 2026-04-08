🔴 BLOCKERS (must fix before testing)
1. dispatcher.py — Credentials written to disk AND passed on CLI
File: brain/dispatcher.py, launch_session() (line ~1105)
The context (which may contain secrets after template injection) is passed directly as a CLI argument via -p context. On Linux, this is visible to any user via /proc/<pid>/cmdline. The prompt file is written but then the content itself is also passed via -p. Pick one approach — the file approach (@promptfile) used in runner.ts is safer.
python# PROBLEM: context passed as CLI arg — visible in process list
cmd = ["claude", "--model", task.model, "--print", "--dangerously-skip-permissions",
       "-p", context]  # ← this can contain injected wiki + soul content
Additionally, the prompt file .dispatcher-prompt.md is written but never actually used (the content goes via -p instead). So it's a dead write that leaves a temp file on disk.
2. keychain/manager.ts — .env file written with credentials, no revoke on crash
File: core/keychain/manager.ts, provisionEnvironment() (line ~12219)
The provisionEnvironment() writes a plaintext .env into the worktree. If the process crashes between provisionEnvironment() and revokeEnvironment(), the .env file persists. The CloneWorker has a try/finally but the runner itself (runner.ts) does NOT wrap the Claude spawn in try/finally relative to the keychain — it's the clone_worker.ts that does. However, the runner.ts launchClaude passes process.env directly (line ~9239), meaning the scoped .env file on disk is actually not what the clone reads — it reads the parent process env. So the .env file written to the worktree is effectively dead code for TS clones, and a security surface for no benefit.
3. Template injection variable mismatch between dispatcher.py and prompt_builder.ts
File: brain/dispatcher.py vs core/brain/prompt_builder.ts vs templates/code-clone-TASK.md
The template uses {INJECT_SOUL_HERE}, {INJECT_ALLOWED_PATHS_HERE}, etc. But dispatcher.py uses different variable names:

{INJECT_SOUL_MD_HERE} (line ~10986) vs {INJECT_SOUL_HERE} in the template
{INJECT_BRAIN_DELEGATED_TASK_HERE} (line ~10989) vs {INJECT_TASK_HERE} in the template
{INJECT_ALLOWED_PATH_HERE} (line ~11167, singular) vs {INJECT_ALLOWED_PATHS_HERE} (plural) in the template

This means the Python dispatcher path will never inject soul, task, or paths into clone templates. The TS path (prompt_builder.ts) uses the correct variable names. This will cause clones launched via dispatcher.py to run with raw placeholder strings.
4. runner.ts — --dangerously-skip-permissions is a hard-coded security bypass
File: core/clones/lifecycle/runner.ts, line ~9236
typescript['--print', '--dangerously-skip-permissions', '-p', `@${promptFile}`]
This flag is also in .claude/settings.local.json. For testing this is fine, but this must be called out as a pre-production blocker — it disables all permission checks for spawned Claude sessions.

🟠 HIGH SEVERITY
5. getScopeKeys() returns string[] but router.ts dispatch() awaits it as Promise<string[]>
File: core/keychain/manager.ts line ~12253 vs core/brain/router.ts line ~787
getScopeKeys() is synchronous (returns string[]), but router.ts calls await this.keychain.getScopeKeys(skill). This works in JS (awaiting a non-promise just resolves), but it's a type mismatch that will confuse maintainers and could break if someone adds async later expecting the interface to already be async.
6. import urllib.parse at module level is placed after class definition
File: brain/bridge.py, line ~688
import urllib.parse appears after the Bridge class definition and the singleton section. _send_sms() uses urllib.parse.urlencode(), which is called at runtime so it works, but this is a code smell that will confuse linters and reviewers. Move it to the top with the other imports.
7. No YAML parser — hand-rolled YAML parsing in keychain/manager.ts
File: core/keychain/manager.ts, getScopeKeys() and scanForLeaks()
Both methods contain fragile hand-written YAML line-by-line parsers. These will break on any non-trivial YAML (quoted strings, inline arrays, comments after values, multi-line values). Since js-yaml is a zero-dep package and you already have npm, this is risky tech debt. At minimum, add comments documenting the exact YAML subset supported and add tests for edge cases.
8. dispatcher.py — create_worktree() creates worktree outside the repo directory
File: brain/dispatcher.py, line ~11028
pythonworktree_path = BASE_DIR.parent / worktree_name
This places worktrees in the parent directory of the repo, while spawner.ts places them inside state/worktrees/. This inconsistency means the Python and TS paths will create orphaned worktrees that the other path can't find or clean up.
9. clone_worker.ts — Keychain revocation ignored when leaks detected
File: core/clones/clone_worker.ts, line ~9490
typescriptawait this.keychain.revokeEnvironment(handle.path);
The return value of revokeEnvironment() (which returns false if leaks detected) is never checked. The comment in manager.ts says "Caller (CloneWorker) must treat false return as Janitor BLOCK." This contract is not fulfilled.
10. classifier.ts — keyword substring matching causes false positives
File: core/routing/classifier.ts
The classifier uses prompt.includes(kw) which matches substrings: "explain" matches "explain", but "run" matches "runtime", "running", "rerun". "test" matches "contest", "testing", "detest". "clone" matches "cyclone". This will over-route to FULL_PIPELINE. Use word boundary matching or at minimum prefix the keywords with spaces.

🟡 MEDIUM SEVERITY
11. auditor.ts — evaluateMission() is synchronous but writeForgeRecord() is async fire-and-forget
The .catch() swallows errors silently. If the forge directory doesn't exist and mkdir fails, you'll never know. Consider making this fully synchronous or properly awaiting it.
12. bridge.py — No rate limiting on Telegram sends
Telegram has a rate limit of ~30 messages per second per bot. A tight retry loop or broadcast storm could get the bot temporarily banned. Add a simple throttle (e.g., time.sleep(0.05) between chunks).
13. mempalace_adapter.ts — this.client is any and never initialized
Every method calls this.client.something() but connect() is a TODO. Any caller that doesn't call connect() first will get a runtime error on undefined. Add a guard or make client nullable with explicit checks.
14. dispatcher.py — stdout truncated to last 2000 chars before handshake extraction
File: line ~11123: result.stdout[-2000:]
If the clone produces verbose output and the handshake JSON is beyond 2000 chars from the end, it will be silently lost. The handshake should be extracted from full output before truncation for storage.
15. planner.ts — JSON.parse with no try/catch
File: core/brain/planner.ts, line ~9013
If Haiku returns malformed JSON (which happens), this will throw an unhandled exception that propagates to the UserAgent. Wrap in try/catch and return a sensible default or throw a typed error.
16. Duplicate Janitor logic between Python and TypeScript
janitor_evaluate() in dispatcher.py and evaluateMission() in auditor.ts implement the same logic with subtle differences (e.g., Python checks "todo:" while TS checks "temporary"; Python doesn't check shared config edits). As the system matures, these will drift further. Document which is canonical and plan to consolidate.

🟢 LOW SEVERITY / NITS
17. UserAgent constructor creates BrainPlanner unconditionally
Even DIRECT responses instantiate a planner they'll never use. Lazy-init it.
18. teardown.ts — Force-deletes unmerged branches on BLOCK
After a safe git branch -d fails, it immediately tries -D. This is by design per comments, but means BLOCKed code is irrecoverably deleted. Consider keeping the branch for forensic review (with a TTL).
19. agent4.ts — CLI entry point imports UserAgent but never uses it
The start case is a TODO with the actual instantiation commented out. The import still triggers module loading of the entire dependency tree.
20. No "test" include in tsconfig.json
Tests in test/ import from core/ using relative paths, but tsconfig.json only includes ["bin/**/*", "core/**/*"]. Tests are compiled by ts-jest separately, but tsc --noEmit won't type-check them.
21. extract_handshake() regex fallback is fragile
The regex \{[^{}]*"status"[^{}]*\} can't match nested JSON (which the handshake could contain if files_modified has entries). The line-by-line approach is better; consider removing the regex fallback or making it recursive.

Summary verdict
The architecture is well-thought-out and the separation of concerns (Brain → Dispatcher → Clone → Janitor → Forge) is clean. The wiki system, keychain scoping, and multi-channel bridge are genuinely well-designed.
For testing gate: Fix blockers 1-3 (the template variable mismatch is the most likely to cause silent failures in testing). Items 4-10 are high-priority but can be tracked as known issues if the testing scope is limited to the TS path only. If you're testing the Python dispatcher path, blocker 3 and issue 8 will cause immediate failures.

Part 2: Tests, Scripts, and Cross-Cutting Concerns
🟠 HIGH — Test Coverage Gaps
22. No test for clone_worker.ts (the main orchestrator)
CloneWorker.execute() is the most critical method in the system — it orchestrates the full spawn → inject → run → audit → teardown loop with retry logic. There are zero tests for it. The retry loop, the SUGGEST re-queue path, the keychain revocation-on-leak path, and the max-retries fallback are all untested. This is the single biggest test gap for testing gate.
23. No test for auditor.ts detectStructuralIssue()
The TS Janitor's structural detection logic (scope creep, missing tests, shared config edits, performance flags, quality admissions) has no dedicated test. The Python Janitor has decent test coverage via test_dispatcher.py, but the TS version — which is the canonical one — is untested. Since there are subtle differences between the two (issue #16), this matters.
24. Tests monkey-patch process.cwd — fragile and leaks on failure
File: test/keychain.test.ts (lines ~2267, 2290, etc.)
Multiple tests override process.cwd with a custom function and restore in finally. If Jest runs tests in parallel or a test crashes before finally, the global process.cwd stays patched for all subsequent tests. Use jest.spyOn(process, 'cwd') with mockReturnValue() instead — Jest restores mocks automatically between tests.
25. Integration tests create real git worktrees in the repo
File: test/clone-lifecycle.test.ts
The spawner/teardown tests create real worktrees and branches in the actual repo. If a test fails mid-execution (e.g., the afterEach cleanup doesn't fire), orphaned worktrees and branches persist. These tests should run in an isolated temp git repo:
typescriptbeforeAll(() => {
  tmpRepo = fs.mkdtempSync('/tmp/test-repo-');
  execSync('git init', { cwd: tmpRepo });
  execSync('git commit --allow-empty -m "init"', { cwd: tmpRepo });
  process.env.AGENT_BASE_DIR = tmpRepo;
});
26. triggerFullPipeline test leaves files in brain/inbox/ on assertion failure
File: test/phase4.test.ts, line ~2665
The cleanup logic runs after assertions. If an expect() fails, the task JSON files stay in brain/inbox/ and will be picked up by any subsequent dispatcher.py watch run. Move cleanup to afterEach.

🟡 MEDIUM — Test Logic Issues
27. Python test_janitor_evaluate_no_tests tests the wrong condition
File: test/test_dispatcher.py, line ~2818
The test creates a handshake with tests_passed: False and a single source file. In the Python Janitor, this hits the check if not tests_passed and source_files (line ~11321). But the TS Janitor checks handshake.tests_passed === false || handshake.status === 'FAILED_REQUIRE_HUMAN' at a higher priority — it would BLOCK, not SUGGEST. The Python and TS Janitors will give different results for this exact input. This needs to be reconciled before testing.
28. No negative test for buildScopedEnv — doesn't test that excluded keys are truly absent
The test at line ~2462 checks that KEY_B is undefined, which is good. But there's no test confirming that requesting a key that exists in the vault but is NOT in requiredKeys is excluded — i.e., a test where the vault has 10 keys but only 2 are requested. The existing test covers this implicitly but not explicitly enough for a security-critical function.

🟠 HIGH — Bootstrap Script Issues
29. bootstrap-linux.sh uses curl | sudo bash pattern
File: scripts/bootstrap-linux.sh, line ~1335
bashcurl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
This is a well-known supply-chain risk. For a system that handles API keys and runs autonomous agents, consider pinning to a specific NodeSource script hash or using the distro's packaged Node.js.
30. .env file gets duplicate AGENT_BASE_DIR entries
File: scripts/bootstrap-linux.sh, lines ~1436-1441
The script first does sed -i to replace AGENT_BASE_DIR= in the copied .env.example, then unconditionally appends AGENT_BASE_DIR=$AGENT_DIR again at the bottom. The .env.example has AGENT_BASE_DIR=/path/to/this/repo, so after bootstrap, .env will have two AGENT_BASE_DIR lines — the last one wins, but it's confusing and could mask bugs if someone edits the first one thinking it's the active one.
31. Bootstrap installs Kali security tools without confirming intent
File: scripts/bootstrap-linux.sh, line ~1350
If --node-type security is passed, it installs nmap, masscan, nikto, aircrack-ng, wireshark-cli, netdiscover without user confirmation. On a shared or production server this could trigger security alerts or violate acceptable-use policies. Add a confirmation prompt.

🟡 MEDIUM — Cross-Cutting Architecture Issues
32. Two separate worktree path conventions with no reconciliation
ComponentWorktree base pathspawner.tsstate/worktrees/<cloneId> (inside repo)dispatcher.pyBASE_DIR.parent / clone-<skill>-<id> (parent of repo)teardown.tsreads from WorktreeHandle.path (whatever spawner gives)
The Python and TS paths will never find each other's worktrees. If you test the Python dispatcher, it creates worktrees that the TS teardown can never clean up, and vice versa. This needs a single source of truth — suggest moving the Python path to match state/worktrees/.
33. Template naming mismatch between spawner and dispatcher
spawner.ts looks for templates at templates/<skill>-task.md (e.g., templates/code-task.md). But the only template file is templates/code-clone-TASK.md. The spawner will always fail to find the template with fs.existsSync(templateSrc) returning false, silently skipping the copy. The dispatcher.py looks for templates/<skill>.md (e.g., templates/code.md) — also doesn't match. Neither path finds the actual template.
34. No health check / readiness probe for the dispatcher
The dispatcher runs as a daemon (watch mode) but has no mechanism for external monitoring to verify it's alive and processing. If the watch loop silently hangs (e.g., subprocess.run blocks indefinitely due to a stuck Claude session), there's no detection. Add a heartbeat file write (e.g., touch state/dispatcher.heartbeat every poll cycle) or a /health endpoint.
35. Event log (events/dispatcher.jsonl) has no rotation
The dispatcher appends to a single JSONL file indefinitely. On a busy system, this grows without bound. Add log rotation (e.g., rotate at 10MB or daily) or use a bounded ring-buffer approach.

🟢 LOW — Additional Nits
36. wiki-lint.sh is referenced in the file tree but I didn't see it tested or called by any automation. It should be integrated into CI alongside skill-scan.yml.
37. scopes.yaml defines kids_bot skill but classifier.ts doesn't route to it. The classifier only knows about code, research, devops, qa, docs, data. A kids_bot task would default to code.
38. bridge.py smoke-test CLI exposes private methods (_send_email, _send_discord). Not a security issue (it's a CLI tool), but the underscore convention suggests these shouldn't be part of the public interface.
39. The test/ directory is excluded from tsconfig.json include array, so running npx tsc --noEmit (Phase 0 acceptance criteria) won't type-check tests. Type errors in tests will only surface when running jest.

Updated Summary for Testing Gate
Must fix (blocks testing):
#IssueEffort3Template variable name mismatch (Python path dead)15 min — rename 3 strings in dispatcher.py33Template filename mismatch (neither path finds templates)10 min — rename file or update both lookups1CLI arg credential exposure in dispatcher.py20 min — switch to @promptfile pattern32Worktree path divergence15 min — align Python to state/worktrees/
Should fix (will cause false failures in testing):
#IssueEffort9Keychain revocation return value ignored5 min14Stdout truncated before handshake extraction10 min15JSON.parse without try/catch in planner.ts5 min22No CloneWorker test1-2 hours
Track as known issues:
Everything else. The architecture is well-designed, the wiki/decision system is thorough, and the security model (keychain scoping, leak scanning, credential isolation) is genuinely above average for a project at this stage. The main risk is the Python/TypeScript dual implementation — the two paths have diverged in subtle ways that will cause different behavior on the same input. Picking one canonical execution path for the initial test round and documenting which issues are Python-only vs TS-only will save a lot of debugging time.