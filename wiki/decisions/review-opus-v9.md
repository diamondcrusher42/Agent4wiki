# Opus Code Review — Agent4wiki v9

> Reviewer: Opus 4.6
> Date: 2026-04-09
> Branch: opus-build (commits 5242a0c + 5ffb5e4)
> Codebase: 211 tests (160 Jest + 51 pytest), TSC clean
> Source: /tmp/agent4wiki-v9-repomix.txt (full repomix)

---

## 1. System Overview

Agent4wiki is a 7-segment AI agent orchestrator:

| Segment | Role | Implementation |
|---------|------|----------------|
| **User Agent** | Top-level router: classify intent, gate confidence, dispatch | core/user_agent/agent.ts |
| **Brain** | Task queue daemon: poll inbox, claim tasks, spawn clones | brain/dispatcher.py |
| **Clones** | Isolated workers in git worktrees with JIT credentials | core/clones/clone_worker.ts + lifecycle/ |
| **Janitor** | Post-execution auditor: BLOCK/SUGGEST/NOTE directives | core/janitor/auditor.ts |
| **Forge** | A/B template evolution: shadow runner + LLM-as-judge + ratchet | core/forge/ |
| **Keychain** | AES-256-GCM vault, credential provision/revoke/scan | core/keychain/manager.ts |
| **Bridge** | Multi-channel notification relay (Telegram/Email/Discord/Slack/SMS) | brain/bridge.py |

Supporting: WikiScythe (memory maintenance), MemPalace adapter (MCP stub), ComplexityClassifier (2-pass routing), shared config (clone_config.json + heuristics.json).

Data flow: User message -> User Agent classifies (regex then Haiku) -> DIRECT/BRAIN_ONLY/FULL_PIPELINE -> Dispatcher claims task atomically -> spawns git worktree -> Keychain provisions .env -> Clone runs claude --print -> Janitor audits handshake -> NOTE=merge, SUGGEST=retry, BLOCK=quarantine -> Forge records event -> Bridge notifies user.

---

## 2. Multi-Perspective Review

### 2.1 Brain Perspective (dispatcher.py)

Good:
- Atomic task pickup via _claim_task() using os.rename() -- correct primitive for Linux. Second thread gets FileNotFoundError, no double-processing.
- SENSITIVE_ENV_KEYS stripping before clone launch prevents credential leakage through environment inheritance.
- Prompt file cleanup in try/finally (v9 B3) closes a real worktree pollution path.
- Dead V1 code removal (v9 A1) eliminates a confusion trap -- V1 returned SUGGEST where V2 returns BLOCK.
- Fleet routing with is_local_node() and dispatch_remote() shows forward-looking multi-machine design.

Bad:
- dispatcher.py is a monolith (~500 lines): Task dataclass, file I/O, context assembly, worktree management, session launching, janitor evaluation, forge recording, fleet routing -- all in one file.
- assemble_context() reads multiple files with no size guard. A maliciously large soul.md could blow the context window budget.
- extract_handshake() parses the last JSON block from stdout by reverse-iterating lines. If claude output contains intermediate JSON, the wrong block could be extracted. No schema validation.

Ugly:
- load_fleet_registry() reads a JSON file on every dispatch call with no caching.

Rating: 7/10

---

### 2.2 User Agent Perspective (agent.ts + classifier.ts)

Good:
- 2-pass ComplexityClassifier: hardcoded regex at zero cost, Haiku LLM fallback for ambiguity. Safe default on Haiku failure: BRAIN_ONLY.
- Confidence gate prevents low-confidence dispatches.
- Soul.md caching with 60s TTL.
- Conversation history: max 50 entries, token-based flush at 4000 estimated tokens.

Bad:
- Conversation history is in-memory only. Process restart = total amnesia.
- Token estimation is character-based (content.length / 4). Can be off by 2-3x for code/Unicode content.
- No rate limiting on FULL_PIPELINE dispatches. 10 rapid messages = 10 clone lifecycles queued.

Ugly:
- CLI entry point (bin/agent4.ts) is entirely TODO stubs. No manual operation possible.

Rating: 6/10

---

### 2.3 Clone Perspective (clone_worker.ts + lifecycle/)

Good:
- Full lifecycle isolation: git worktree per clone, scoped .env (mode 0o600), environment allowlist (8 safe keys only), try/finally credential revoke.
- cloneId validation (/^[\w-]+$/) prevents shell injection through task names.
- runRepomix() fixed to execFileAsync array form (v9 B1).
- Retry loop with Janitor feedback injection on SUGGEST.
- Credential leak detection forces immediate BLOCK.

Bad:
- teardown.ts still uses execSync() with string interpolation for git commands: mergeWorktree(), removeWorktree(), pruneBranch(). Most actionable security fix remaining.
- --dangerously-skip-permissions passed to every clone launch. Clones run with full filesystem and network access.

Ugly:
- writeHandshakeFile() is fire-and-forget -- no fsync, no atomic rename. Partial write on crash = invalid JSON for janitor.

Rating: 7/10

---

### 2.4 Forge Perspective (evaluator.ts + shadow_runner.ts + ratchet.ts)

Good:
- Budget cap (50,000 tokens/day) prevents runaway A/B testing costs.
- 5-win promotion threshold is conservative.
- Auto-revert on Janitor BLOCK after promotion.

Bad:
- Simple scoring (winner 70, loser 30, tie 50/50). No multi-dimensional evaluation.
- Evaluator prompt acknowledged as gameable (HIGH-2 TODO).
- ratchet.ts uses execSync with git tag interpolation -- injectable via template names.
- events.jsonl accumulates indefinitely with no rotation. May contain PII.

Ugly:
- No offline/batch evaluation. Every comparison requires a live LLM call.

Rating: 5/10

---

### 2.5 Janitor Perspective (auditor.ts + scythe.ts)

Good:
- Circuit breaker at 3 retries -> BLOCK + human escalation.
- Practical structural checks: scope creep, missing tests, shared config edits, performance flags.
- Shared heuristics.json prevents drift between TS and Python.
- ForgeRecord now written for ALL directives (v9 B2).
- WikiScythe human-gated archival prevents automated data loss.
- getGitMtime() uses execFileSync (injection-safe).

Bad:
- Handshake read-then-delete not atomic (MED-3 TODO).
- Scope creep detection is keyword-based -- easy to circumvent by rephrasing.
- Missing test detection checks presence, not quality.

Ugly:
- No janitor self-test. Malformed heuristics.json silently makes janitor permissive.

Rating: 7/10

---

## 3. Top 5 Low-Hanging Fruits

### LH-1: Fix teardown.ts shell interpolation (SECURITY, ~30 min)
Files: core/clones/lifecycle/teardown.ts
Replace execSync template literals with execFileSync('git', [...args]) array form. Three functions: mergeWorktree(), removeWorktree(), pruneBranch().
Impact: Closes the last shell injection surface in clone lifecycle.

### LH-2: Fix ratchet.ts git tag interpolation (SECURITY, ~15 min)
File: core/forge/ratchet.ts
Replace execSync git tag with execFileSync array form. Validate tag name format.
Impact: Prevents template name injection into shell commands.

### LH-3: Add handshake JSON schema validation (RELIABILITY, ~30 min)
Files: brain/dispatcher.py + core/clones/lifecycle/runner.ts
Schema check: required fields, allowed status values, type checks. Reject malformed with BLOCK.
Impact: Prevents misrouting on garbage JSON from clone stdout.

### LH-4: Add context size guard to assemble_context() (RELIABILITY, ~20 min)
File: brain/dispatcher.py
Check total size after reading files. Truncate if > configurable limit. Log warning.
Impact: Prevents blown context windows from accumulated state.

### LH-5: Persist conversation history (UX, ~45 min)
File: core/user_agent/agent.ts
Write history to JSON file on every append, load on startup. Respects existing limits.
Impact: Users keep context across restarts.

---

## 4. Security and Privacy Assessment

### Strengths
1. Credential lifecycle is solid. JIT provision -> try/finally revoke -> post-revoke leak scan with TOCTOU-safe fd-first pattern.
2. Environment isolation well-designed. Clone allowlist (8 safe keys), SENSITIVE_ENV_KEYS stripped.
3. Input validation at boundaries. cloneId regex, symlink boundary check, pattern-based secret detection.
4. Atomic task claiming. os.rename() prevents double-processing.

### Vulnerabilities
1. CRITICAL: teardown.ts shell interpolation. Three execSync calls with template literals for git commands. Fix: execFileSync array form. (LH-1)
2. HIGH: --dangerously-skip-permissions on all clones. Prompt injection could exfiltrate data. Mitigation: restricted sandbox.
3. HIGH: ratchet.ts git tag interpolation. Template names flow into shell unsanitized. (LH-2)
4. MEDIUM: Forge evaluator prompt injection. Templates could bias the LLM judge.
5. MEDIUM: Handshake file read-then-delete not atomic. Race between read and delete.
6. LOW: events.jsonl unbounded growth with potential PII.

### Privacy
- Vault: AES-256-GCM with scrypt KDF, separate salt file. Solid.
- exactMatchSecrets for short tokens (>= 8 chars). Good.
- No PII scrubbing on forge events or conversation history.
- Bridge sends across 5 channels -- ensure content appropriate for each channel's security posture.

---

## 5. Practical Usability Assessment

### What works today
- Full clone lifecycle end-to-end. Production-ready for single-user operation.
- 2-pass classification routes efficiently without unnecessary LLM calls.
- Janitor retry loop with feedback injection enables iterative improvement.
- Bridge notifications provide multi-channel visibility.

### What does not work today
- CLI is entirely stubs. No manual operation or debugging tools.
- MCP transport is a stub. MemPalace adapter always returns fallbacks.
- No end-to-end integration test. 211 unit tests but no full pipeline test.
- Conversation history lost on restart.
- No observability. No structured logging, metrics, or health endpoint.

### Operational readiness
- Single-user / single-machine: Ready for testing.
- Multi-user / multi-machine: Not ready. Fleet routing untested.
- Production: Not ready. Missing sandbox, CLI, observability, integration tests.

---

## 6. Readiness Verdict

### READY FOR TESTING -- with mandatory pre-testing fixes

Core architecture is sound: credential lifecycle, clone isolation, atomic task claiming, janitor evaluation, and forge A/B testing all work correctly and are well-tested at component level. v9 fixes addressed real security issues (TOCTOU race, task pickup race) and reliability gaps.

### Mandatory before testing begins

| # | Fix | Effort | Risk if skipped |
|---|-----|--------|-----------------|
| 1 | teardown.ts: execSync -> execFileSync | 30 min | Shell injection in production |
| 2 | ratchet.ts: execSync -> execFileSync | 15 min | Shell injection via template names |

Same class of fix already applied to runSetup() (v8) and runRepomix() (v9). Pattern established.

### Recommended before testing (not blocking)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 3 | Handshake JSON schema validation | 30 min | Prevents misrouting on malformed output |
| 4 | Context size guard in assemble_context() | 20 min | Prevents blown context windows |
| 5 | Conversation history persistence | 45 min | Users keep context across restarts |

### Acceptable risks for testing phase
- --dangerously-skip-permissions: known systemic issue. Acceptable for single-operator with trusted inputs.
- Forge evaluator gameability: theoretical during testing. Address before production.
- CLI stubs: acceptable if testing goes through API.

### Summary scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Security fundamentals | 8/10 | Credential lifecycle excellent; teardown.ts is the gap |
| Test coverage | 7/10 | 211 tests, good edge cases; no integration test |
| Code quality | 7/10 | Clean TS, reasonable Python; dispatcher.py monolith |
| Operational readiness | 5/10 | No CLI, no observability, no conversation persistence |
| Architecture | 8/10 | Well-segmented, shared config, good separation |
| Overall | 7/10 | Ready for controlled testing with 2 mandatory fixes |
