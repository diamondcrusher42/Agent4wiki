# Agent4Wiki V6 — Multi-Role Code Review

**Reviewed:** Full codebase (repomix-v6) + Build Plan V6
**Date:** 2026-04-08
**Perspectives:** Brain, User Agent, Clone, Forge, Janitor

---

## 🧠 Brain Perspective (planner.ts, router.ts, prompt_builder.ts)

### Good
- **parseMissionBrief() fallback chain** (C1 fix already landed) — three-tier parse with a safe default is exactly right. No more crash-on-markdown-fences.
- **PLANNING_SYSTEM_PROMPT** is well-structured: skill taxonomy is clear, requiredKeys rules are sensible, timeout guidance is proportionate.
- **BrainDispatcher.inferSkill()** fails safe to `'code'` — correct instinct.

### Bad
- **Planner confidence is always 0.8.** This is a static lie. The plan says "static until Sequential Thinking MCP integrated" — but nothing consumes this value to gate execution. A `confidence: 0.3` fallback brief will still execute identically to `confidence: 0.8`. Either wire confidence into Janitor evaluation (low confidence → auto-SUGGEST) or remove the field — dead data is misleading data.
- **Router template path mismatch.** `BrainDispatcher.dispatch()` builds `core/clones/templates/${skill}_task.md` (underscore), but `spawner.ts` uses `code-clone-TASK.md` (dash) and `dispatcher.py` uses `{skill}-task.md` (dash). Three naming conventions for the same file. Only `code` has an actual template; every other skill silently falls back to a generic string. This is a landmine for anyone adding a new skill.
- **No plan validation.** Haiku can return a skill like `"coding"` or `"Code"` — `inferSkill()` catches it but there's no validation on `requiredKeys` entries. A hallucinated key name like `"OPENAI_KEY"` would pass through to `buildScopedEnv()` and throw `SECURITY HALT` at runtime, crashing the task with a confusing error.

### Ugly
- **routeToBrain() and executeDirect() are now identical** (post-C3 fix). They both call Haiku with Soul + history. The only difference is `max_tokens: 1024` vs `2048`. This means the entire BRAIN_ONLY routing tier is just "DIRECT but with more tokens." The classifier distinguishes three tiers; two of them do the same thing. Either differentiate them meaningfully (e.g., BRAIN_ONLY injects wiki context, uses extended thinking, or uses a stronger model) or collapse to two tiers.

### Untested / Unproven
- The `plan()` → `ThinkingResult` path is only exercised via `triggerFullPipeline()`. There are no integration tests that verify the full chain: classify → plan → write inbox JSON → dispatcher picks up. Each component is tested in isolation but the seams are unwired.
- `PLANNING_SYSTEM_PROMPT` says "Output ONLY valid JSON" but Haiku frequently wraps in markdown — that's why C1 exists. The prompt itself hasn't been improved to reduce parse failures; only the parser got more resilient.

---

## 👤 User Agent Perspective (agent.ts)

### Good
- **cleanupStaleWorktrees() registry fix** (A1) is already landed and correct. Object.keys() matches spawner's write format. The guard `typeof data === 'object' && !Array.isArray(data)` is defensive.
- **Soul TTL cache** (C2) with 60s invalidation is elegant — avoids disk reads on every turn while keeping dev iteration fast.
- **Token-based flush trigger** catches runaway conversations before memory grows too large. Good pressure valve.
- **History truncation** at 50 entries is sane for Haiku's context window.

### Bad
- **flushState() compresses on `length % 10 === 0`** — this means compression only fires at exactly 10, 20, 30... entries. If the length happens to be 10 when flushState is called, it compresses. But the token-based trigger can fire at length 7, 13, etc. — those calls never compress. The modulo check should be `>=` a threshold, not `=== 0`.
- **compressHistory() is a TODO stub.** It does `slice(-5).map(truncate)` — not compression, just truncation. The `recent_context_summary` field misleads any downstream consumer into thinking it's actually compressed/summarized. The BitNet comment has been there since at least V3. Either implement it or remove the pretense.
- **No conversation history persistence.** `conversationHistory` lives in-memory only. Agent restart = all context lost. `state.json` saves metadata but not the conversation itself. The `recent_context_summary` (which is just truncated raw text) is the only thing that survives a restart — and it's max 5 turns × 100 chars = 500 chars of context.
- **handleUserInput() doesn't await response before pushing to history.** Actually it does — the switch/await is correct. But if `executeDirect` throws (network error), the error response still gets pushed to history, polluting context with error messages for all subsequent turns.

### Ugly
- **`directCount` only resets on construction.** If the agent runs for days, `directCount` grows unbounded. The `% 5 === 0` flush still works but `directCount` itself is a meaningless counter — it doesn't represent anything useful beyond triggering flushes. A simple boolean "dirty" flag would be cleaner.
- **State race condition.** `saveState()` is synchronous (`writeFileSync`), but `flushState()` is async and calls `compressHistory()` which is async. If two FULL_PIPELINE triggers fire concurrently (unlikely but possible), both call `flushState()` → both mutate `this.state` → both `saveState()`. Last write wins. Not a practical issue today but the mixed sync/async state management is a debt.

### Untested / Unproven
- Token estimation (`content.length / 4`) is never validated. For CJK text or code-heavy conversations, this ratio is wildly wrong (closer to 1-2 chars/token for CJK). Could cause premature or late flushes.
- `loadSoul()` reads from `wiki/Soul.md` — but the build plan says "Do NOT touch wiki/". If Soul.md doesn't exist (fresh clone), all API calls use the fallback "You are a helpful assistant" prompt. There's no test for this fallback path in context of a full agent flow.

---

## 🤖 Clone Perspective (spawner.ts, runner.ts, clone_worker.ts)

### Good
- **spawner.ts cloneId validation** (`/^[\w-]+$/`) — simple and correct. Prevents shell injection at the source.
- **runner.ts prompt-file pattern** — writing prompt to `_prompt.md` and passing `@file` avoids the shell-escaping nightmare of passing multi-KB prompts as CLI args.
- **Handshake file write** (runner.ts `writeHandshakeFile`) as a parallel channel to stdout parsing — good resilience. Dispatcher.py's `read_handshake_file()` reads it.
- **CloneWorker security-first design** — credential leak → immediate BLOCK, no questions asked. Correct.
- **buildCloneEnv() strips sensitive keys** — explicit deny-list is the right approach for MVP. Production should flip to allow-list.

### Bad
- **spawner.ts setup.sh doesn't use `--ignore-scripts`** (B2 not yet landed). The plan correctly identifies this, but note: `spawner.ts` writes its *own* `setup.sh` into worktrees — different from the root `setup.sh`. The build plan targets root `setup.sh` but spawner's generated script is also vulnerable. **The fix must cover both.**
- **runner.ts `runSetup()` uses `execAsync` with string interpolation** — `bash "${setupScript}"`. While `setupScript` is constructed from `path.join` (safe), the broader pattern of string-template shell commands is risky. Should use `execFile` or the array spawn form.
- **runner.ts `runRepomix()` runs `npx repomix`** on every clone launch. If `repomix` isn't installed, npx downloads it every time — slow, network-dependent, and non-deterministic. No pinned version either.
- **CloneWorker retry loop creates a new worktree per retry** (`${taskId}-r${retries}`). On 3 retries, that's 3 worktrees + 3 git branches left behind (teardown only runs git worktree remove, branches may persist). Over time this pollutes the repo with stale branches.

### Ugly
- **Two parallel clone lifecycle paths exist.** `clone_worker.ts` (TypeScript) and `dispatcher.py` (Python) both orchestrate spawn → run → audit → teardown. They share no code, no protocol contract, and use slightly different naming conventions. Dispatcher.py's `create_worktree()` names worktrees `clone-{skill}-{id}`, spawner.ts uses just `{cloneId}`. This will bite when one path creates a worktree the other tries to clean up.
- **`--dangerously-skip-permissions`** is hardcoded in both runner.ts and dispatcher.py. This flag makes clones maximally powerful — they can rm -rf anything. The sandboxing is entirely trust-based (worktree isolation + allowed paths). There's no syscall-level containment. A single clone bug could wipe the entire repo.

### Untested / Unproven
- No test verifies that a clone's actual stdout produces a parseable handshake. The test mocks the Claude CLI. If Claude's output format changes (e.g., it wraps JSON in explanation text), handshake parsing breaks silently.
- `buildCloneEnv()` strips 4 keys. What about `AWS_SECRET_ACCESS_KEY`, `DATABASE_URL`, `REDIS_URL`, etc.? The deny-list approach can't anticipate all sensitive env vars that might exist on a host machine.

---

## ⚒️ Forge Perspective (evaluator.ts, shadow_runner.ts, ratchet.ts, metrics_db.ts)

### Good
- **Budget cap on shadow runs** (`DEFAULT_MAX_SHADOW_BUDGET_TOKENS = 50000`) prevents runaway A/B testing costs. Conservative `ESTIMATED_TOKENS_PER_RUN` errs on the side of stopping early. Correct.
- **ForgeEvaluator uses Sonnet, not Haiku** for judgment — right call. Judgment quality matters more than cost here.
- **events.jsonl as the contract surface** between Janitor, Forge, and Evaluator is clean. Machine-parseable, append-only, easy to replay.

### Bad
- **Evaluator scoring is trivially simplistic.** `WIN_A → {70, 30}`, `WIN_B → {30, 70}`, `TIE → {50, 50}`. These scores aren't used for anything — they're written to the event log and ignored. The ratchet mechanism (if it exists) doesn't consume them. Dead code that looks functional.
- **ShadowRunner hardcodes `skill: 'code'`** for variant B dispatch. If the original task was `research` or `devops`, the shadow run silently runs it as `code`. This would produce meaningless A/B comparisons for non-code skills.
- **No A variant result.** `ShadowRunner.runShadow()` returns only variant B's result. The evaluator needs both A and B — who provides A? The caller must somehow capture the primary run's result separately and pair it. This coupling is implicit and fragile.

### Ugly
- **Evaluator prompt is a single string template.** Token consumption and duration are useful signals, but `janitorNotes` is free-text stuffed into a prompt. Adversarial or gibberish notes from a broken clone would confuse the LLM judge. No sanitization.
- **`codePreview`** is an optional field on ShadowResult but nothing populates it. The evaluator includes it in the prompt if present, but the shadow runner never sets it. Ghost feature.

### Untested / Unproven
- The entire Forge pipeline (shadow run → evaluate → ratchet → promote template) has no end-to-end test. Individual units are tested but the promotion loop — where a winning variant B template replaces variant A — is not implemented or tested.
- `metricsDb.getTotalTokensThisCycle()` — what defines a "cycle"? The metrics_db likely uses a date boundary, but if the agent runs across midnight UTC, budget could reset mid-experiment.

---

## 🧹 Janitor Perspective (auditor.ts, scythe.ts)

### Good
- **Auditor decision priority chain** is well-ordered: circuit breaker → impossible → fatal → structural → pass. Correct layering.
- **scythe.ts getGitMtime() already uses `execFileSync`** (B1 fix already landed). No shell injection possible. Clean.
- **Archive queue pattern** (C4) — human must mark `[x]` before pages are archived. No auto-delete. Correct safety-first approach.
- **Shared heuristics.json** for warn_keywords between auditor.ts and dispatcher.py — good DRY, single source of truth.

### Bad
- **Auditor structural checks are position-dependent and fragile.** The scope creep check (`files.length > 5 && /also fixed/i.test(notes)`) requires both conditions. A clone that modifies 20 files but writes clean notes passes silently. The heuristic should flag high file counts independently.
- **Missing test check has a logic bug.** `sourceFiles.length > 0 && testFiles.length === 0 && handshake.tests_passed !== true` — but `tests_passed` can be `undefined` (handshake JSON may omit it). `undefined !== true` is `true`, so missing `tests_passed` field triggers "MISSING TESTS" even if the task didn't involve testing. This creates false SUGGEST directives.
- **Health score formula** (`25 - contradictions*3 - orphans*1 - stale*0.5`) can go deeply negative. A wiki with 10 contradictions scores `-5`. The score isn't bounded or normalized — downstream consumers can't interpret it without knowing the formula.
- **Shared config detection regex** catches `tsconfig` and `package.json` but not `setup.sh`, `CLAUDE.md`, `.claude/settings.local.json`, `requirements.txt`, or other sensitive root files. Incomplete allowlist.

### Ugly
- **Janitor runs in two places with different logic.** `auditor.ts` (TypeScript, used by CloneWorker) and `janitor_evaluate()` in `dispatcher.py` (Python, used by the Python path). They have overlapping but not identical checks. Dispatcher.py's version checks for `FAILED_RETRY` status; auditor.ts doesn't. Auditor.ts checks shared config edits; dispatcher.py doesn't. Behavioral divergence between the two paths is a correctness hazard.
- **scythe.ts `pruneStaleKnowledge()`** calls `this.memory.delete(stale.id)` in a loop with no batching, no transaction, and no rollback. If the memory store is remote (future), this is N round trips. If one delete fails mid-loop, state is partially pruned with no record of what was lost.

### Untested / Unproven
- `processArchiveQueue()` parses markdown checkboxes via regex (`/^- \[x\]\s+(\S+)/`). Markdown checkbox format varies (spaces, capitalization, trailing text). The regex doesn't handle `- [X]` (capital), `- [x]  filename` (double space), or filenames with spaces.
- The cold-tier queue (`cold-queue.json`) is append-only with no consumer. Pages get flagged as orphans and added to the queue, but nothing ever reads or acts on it. Dead-end data.
- No test for the full audit cycle: `runFullAuditCycle()` → health score computation → archive queue generation. Only unit-level scythe tests exist.

---

## 🔐 Keychain Cross-Cutting Concerns (manager.ts)

### Good
- **AES-256-GCM + scrypt KDF** — production-grade encryption. Salt is separate file with 0o600 permissions. Auth tag prevents tampering.
- **OOM guard on scanForLeaks()** (A3 fix already landed) — 1MB cap + binary extension skip is correct.
- **Exact-match leak detection for short secrets** via `exactMatchSecrets` set — handles API keys shorter than 16 chars.

### Bad
- **Vault password in env var (`VAULT_MASTER_PASSWORD`)** — if a clone reads `process.env`, it gets the vault password. `buildCloneEnv()` strips `VAULT_MASTER_PASSWORD`, but only if the clone is launched via the TypeScript path. Dispatcher.py passes `os.environ` directly to subprocess — **vault password leaks to every Python-dispatched clone.**
- **`addSecret()` re-encrypts the entire vault on every add.** For bulk initialization this is N full decrypt-encrypt cycles. Minor but wasteful.
- **`.env` fallback** for vault loading means that in dev mode, all secrets are plaintext on disk. The migration path from `.env` to encrypted vault is manual and undocumented.

### Ugly
- **scanForLeaks() runs `git diff --name-only HEAD`** to find modified files. If a clone stages files but doesn't commit, they won't appear in `git diff HEAD`. A clone that writes a secret to an untracked file bypasses the leak scanner entirely. Should use `git status --porcelain` or scan all files.

---

## 📊 Summary Scorecard

| Area | Good | Bad | Ugly | Untested |
|------|------|-----|------|----------|
| Brain | Fallback parsing, skill taxonomy | Dead confidence field, template path chaos | routeToBrain = executeDirect | End-to-end classify→dispatch chain |
| User Agent | Registry fix, Soul TTL, flush triggers | Stub compression, no history persistence | Mixed sync/async state | Token estimation accuracy |
| Clone | Input validation, prompt-file pattern | Dual setup.sh gap, stale branches | Two parallel lifecycles, no sandboxing | Real handshake parsing |
| Forge | Budget caps, Sonnet for judgment | Dead scores, hardcoded skill | Ghost codePreview field | Promotion loop |
| Janitor | Decision priority chain, archive gate | Structural check gaps, health score unbounded | Dual implementation divergence | Archive queue regex, cold queue |
| Keychain | AES-256-GCM, OOM guard | Vault password leak via Python path | git diff blind spot | - |

## Top 5 Priorities (beyond Build Plan V6)

1. **Vault password leak via dispatcher.py** — security-critical. Python-dispatched clones inherit `VAULT_MASTER_PASSWORD` from `os.environ`. Fix: strip sensitive keys in `launch_session()` or use `buildCloneEnv()` equivalent in Python.
2. **Unify the two lifecycle paths** or at least define a shared contract (naming conventions, handshake format, env stripping). The TS and Python paths will drift further apart with each build plan.
3. **Wire confidence into execution gating.** A `confidence: 0.3` fallback brief should not execute the same as `confidence: 0.8`. Add a threshold check in CloneWorker or dispatcher.
4. **scanForLeaks() should use `git status --porcelain`** not `git diff HEAD`. Untracked files are invisible to the current scanner.
5. **Collapse or differentiate BRAIN_ONLY vs DIRECT.** Post-C3, they're identical except for max_tokens. Either give BRAIN_ONLY wiki context injection and a stronger model, or merge the tiers.
