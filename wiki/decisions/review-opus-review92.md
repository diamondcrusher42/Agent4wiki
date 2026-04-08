Multi-Perspective Code Review — agent4wiki v5
🧠 THE BRAIN (Planner, PromptBuilder, Router)
Good:

Clean separation: planner thinks, router dispatches, prompt_builder assembles. No role bleed.
loadWikiContext budget cap (2000 chars) is already implemented — the build plan's B2 fix is already in the code. Well done.
Recursive wiki page resolution handles nested subdirectories properly.
Haiku for planning is the right cost trade-off.

Bad:

BrainPlanner.plan() has static confidence: 0.8 — it's never variable. Downstream code that checks confidence will always get the same answer. Dead logic until Sequential Thinking MCP is wired.
routeToBrain() wraps the user's prompt inside a meta-prompt ("The user asked: \"${prompt}\"") then sends that as the final message. This double-frames the question — the model sees the user's intent only through a narration layer, not directly. It works but degrades answer quality for nuanced questions.
PromptBuilder loads Soul.md from wiki/Soul.md but the UserAgent loads it from the same path with a different private path (wiki/soul-private.md vs state/user_agent/soul-private.md). Inconsistent — a private soul edit in one location won't reflect in the other path.

Ugly:

planner.ts asks Haiku to output JSON but has no retry on malformed JSON. One bad response = hard crash. No fallback, no retry, no default brief.

Untested:

No test for BrainPlanner.plan() with a live mock that returns malformed JSON — only structure tests exist.
No test for Soul.md path inconsistency between PromptBuilder and UserAgent.


👤 THE USER AGENT (agent.ts)
Good:

The v5 fixes (A2 duplicate message, A3 routeToBrain history injection) are already applied in the code. slice(-11, -1) correctly excludes the current turn. Solid.
Token-based flush trigger and MAX_HISTORY_ENTRIES cap prevent unbounded memory growth.
pruneCompleted() and cleanupStaleWorktrees() are clean lifecycle hooks.
Error paths return user-facing error strings instead of throwing — good UX.

Bad:

cleanupStaleWorktrees() parses the registry as an array (data.map(e => e.id || e.taskId)) but spawner.ts writes it as an object keyed by cloneId (registry[cloneId] = {…}). This means cleanupStaleWorktrees always fails silently — registeredIds is always empty, and it clears all active worktrees on every startup. The existing test confirms this behavior ("No registry file exists → should clear all") but doesn't catch the real bug.
soulContent is cached on first load and never invalidated. If Soul.md changes mid-session (unlikely but possible in dev), it serves stale content forever.
compressHistory() is a TODO stub — just truncates to last 5 entries stringified. The "BitNet 2B" comment is aspirational; the actual compression is lossy garbage.

Ugly:

flushState() triggers compressHistory() when length % 10 === 0, which means history at exactly 10, 20, 30… entries triggers compression, but at 11, 12… it doesn't. Combined with the 50-entry cap, this creates unpredictable compression timing.

Untested:

cleanupStaleWorktrees with a real registry.json in the object format that spawner.ts writes — current test only checks the "clear all" path.
No integration test for the full handleUserInput → classify → route → respond pipeline with a mocked Anthropic client across all three paths in a single test.


🧬 THE CLONE (Spawner, Runner, Worker, Teardown)
Good:

B1 cloneId validation (/^[\w-]+$/) is in place, with tests for shell injection and path traversal. Correct.
CloneWorker.execute() has proper try/finally for credential revocation — even on crash, .env gets deleted.
Handshake file write (state/handshakes/<cloneId>.json) provides a reliable cross-process communication channel vs fragile stdout parsing.
buildCloneEnv() strips 4 sensitive keys. Tests verify this.

Bad:

runner.ts passes --dangerously-skip-permissions to Claude. This is necessary but there's no secondary defense — if a clone is compromised, it has full filesystem access within the worktree. The allowedPaths constraint in the Mission Brief is purely advisory (prompt-level), not enforced.
teardown.ts catches merge failures silently (catch (err) { console.error(…) }). A failed merge means code is lost. There's no notification to the user/bridge.
runner.ts has a 5-minute setup timeout and 2-minute Repomix timeout, but these are not configurable per-task. A complex clone with large deps will timeout during setup.
SENSITIVE_ENV_KEYS in clone_worker.ts is hardcoded to 4 keys. Any new secret added to the vault won't be stripped from the clone's global env — only vault-provisioned per-task keys are scoped. This is a latent credential leak vector.

Ugly:

parseHandshake() reverse-iterates looking for { — any debug logging that starts with { (like a JSON config dump) could be mistaken for the handshake. The handshake file (B1) mitigates this, but runner.ts still prefers stdout parsing.

Untested:

No test for CloneRunner.run() end-to-end (mocked subprocess) — only parseHandshake unit tests exist.
No test for merge conflict during teardown with NOTE directive.
teardown.ts force-deletes with -D as fallback when -d fails — no test covers this path.


🔥 THE FORGE (ShadowRunner, Evaluator, Ratchet, MetricsDb)
Good:

A1 fix is in place: ShadowRunner.runShadow() calls metricsDb.recordMetric() after each shadow run. Budget tracking now works. Tests confirm the roundtrip.
C1 fix is in place: ratchet.ts promote() filters for type === 'evaluation' events, not arbitrary last lines. Tests cover both the happy path and the "only shadow_result" throw case.
Budget cap check before launching shadow runs prevents runaway costs.
ForgeMetricsDb.recordMetric() bridges the events.jsonl → metrics table gap correctly.

Bad:

ForgeEvaluator uses string parsing to determine WIN_A/WIN_B/TIE — if (upper.includes('WIN_A')) means a response like "I would not say WIN_A because…" gets classified as WIN_A. Fragile.
computeScores() returns hardcoded 70/30 or 50/50 — there's no actual scoring based on token efficiency, speed, or janitor grade. The scores are decorative.
promote() creates a git tag but runs in a temp directory during tests (no real git repo). The tag creation fails silently. In production, if the repo has uncommitted changes, the tag is meaningless for rollback.
ShadowRunner uses ESTIMATED_TOKENS_PER_RUN = 5000 as a pre-check but the actual run might consume 50k tokens. The budget check is optimistic — it prevents launch but doesn't cap actual spend.

Ugly:

Dual logging: shadow results go to both forge/events.jsonl (append) AND metrics table (SQLite). The evaluator reads events.jsonl, the budget reads metrics. If either gets corrupted, the other keeps going with stale data. No reconciliation.

Untested:

No test for ForgeEvaluator with ambiguous LLM responses (e.g., "I can't determine a winner, TIE maybe").
No test for promote() auto-revert path (Janitor BLOCK after promotion). The existing test acknowledges this: "the Janitor won't BLOCK this clean handshake."
No test for concurrent shadow runs racing on the same events.jsonl file (append is not atomic across processes).


🧹 THE JANITOR (Auditor, Scythe, Dispatcher)
Good:

Shared heuristics.json for warn_keywords is used by both TS (auditor.ts) and Python (dispatcher.py). DRY.
Circuit breaker at 3 retries is clean and consistent across both implementations.
C4 confirmation gate: Scythe writes to archive-queue.md instead of auto-archiving. Requires human [x] checkoff. Safe.
Health score delta tracking gives trend visibility.

Bad:

dispatcher.py's janitor_evaluate() is a "MVP bridge" that mirrors auditor.ts logic but diverges in edge cases: the Python version treats tests_passed: False with source files as SUGGEST, while the TS version treats tests_passed: false (regardless of source files) as BLOCK. These two Janitors disagree on the same input. Whichever runs depends on whether the task came through TS CloneWorker or Python dispatcher.
dispatcher.py create_worktree() does NOT validate the task ID before using it in git worktree add -b task/${task.id}. The validate_task_id() function exists but is only called in dispatch_remote(). Local execution path has the same injection vector that spawner.ts B1 fixed.
scythe.ts getGitMtime() shells out git log --format=%ct -1 "${filePath}" — filePath is not sanitized. A wiki page named evil"; rm -rf /".md would execute.

Ugly:

dispatcher.py has two file-handle patterns: the heuristics load was fixed (v5 with open pattern is in place ✓), but launch_session() writes a .dispatcher-prompt.md file into the worktree containing the full assembled context (including potentially injected wiki content). If the clone reads this file, it sees its own prompt — a prompt injection bootstrapping loop.

Untested:

No test for TS vs Python Janitor disagreement on the same handshake input.
No test for dispatcher.py create_worktree() with malicious task IDs (the fix was only applied to spawner.ts).
WikiScythe.processArchiveQueue() has no test at all.
No test for the Bridge notification paths (notify_human) — all Bridge calls are side-effects with no mock verification.


Summary Scorecard
AreaGoodBadUglyUntested RiskBrainClean separation, wiki budgetStatic confidence, double-framed promptsNo JSON retry in plannerMalformed JSON crashUser Agentv5 fixes solid, history capRegistry format mismatch, stale soul cacheUnpredictable compressioncleanupStaleWorktrees always clearsClonecloneId validation, credential revocationAdvisory-only path constraints, silent merge failures{-prefix handshake parsingNo runner e2e, no merge conflict testForgeBudget tracking works, C1 filter correctString parsing for outcomes, decorative scoresDual logging without reconciliationNo concurrent shadow testJanitorShared heuristics, circuit breakerTS/Python Janitor disagreement, unvalidated task IDs in dispatcher.pyPrompt file in worktreeNo cross-language parity test
Top 3 actionable findings:

cleanupStaleWorktrees registry format mismatch — this silently wipes active_worktrees on every startup. Fix the parser to read object keys, not array entries.
dispatcher.py create_worktree() lacks task ID validation — the B1 fix was only applied to spawner.ts. Same shell injection vector exists in Python.
TS/Python Janitor divergence — add a shared test fixture that runs identical handshakes through both auditor.ts and dispatcher.py janitor_evaluate() and asserts identical directives.