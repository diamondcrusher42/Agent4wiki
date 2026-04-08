# Opus Build Brief — Agent V4

> You are Claude Opus. You are continuing the implementation of a personal AI agent system.
>
> Read this document top to bottom before writing a single line of code. The system is already substantially built — 198 tests pass, TSC is clean, and no stubs remain. Your job is to improve it, harden it, and close the known gaps. Do not rebuild what is already working.

---

## 1. Why This Was Built

Most AI agent systems solve the wrong problem. They give you agents that can *run*. What they can't give you is an agent that is *yours*.

The specific problems that made every existing tool unusable:

**No persistent memory.** An agent that resets every session is an expensive CLI. We needed an agent that compounds — every interaction makes it smarter about this specific life, this specific work.

**Credentials leak everywhere.** General-purpose frameworks pass API keys as config files, environment variables in logs, or plaintext in context windows. None of them have a system where a key exists in process memory only for the duration of the task that needs it, and is confirmed destroyed afterward.

**Single-machine.** A coding task and a browser automation task have different hardware requirements. A system that can only run on one machine is artificially constrained.

**Output is invisible.** Console output doesn't reach a phone. A system that executes perfectly but can't deliver results is, from the user's perspective, broken.

**It doesn't improve.** Most agent systems run the 100th task exactly like the 1st. There is no mechanism for the system to get better at its own skills over time.

**The design answers each problem directly:**

| Problem | Answer |
|---------|--------|
| No memory | Memory segment — compounding vault, AAAK compression, zero runtime tokens |
| Credentials leak | Keychain — JIT injection, process memory only, confirmed destroyed after |
| Single-machine | Fleet model — any machine with git + Python + claude CLI is a node |
| Output invisible | Bridge — 5-channel cascade, never silent |
| Doesn't improve | Forge — shadow benchmarks, A/B testing, 5-win ratchet |

---

## 2. What This Is

Agent V4 is a personal AI agent system built around **seven specialised segments**. Each segment has a single responsibility and communicates with others through defined interfaces.

The production pipeline:
```
User message (Telegram)
  → User Agent: ComplexityClassifier (DIRECT / BRAIN_ONLY / FULL_PIPELINE)
  → Brain: Sequential Thinking → MissionBrief
  → PromptBuilder: Soul + wiki context (truncated at line boundary) + task → final prompt
  → Keychain: JIT credentials provisioned for this skill scope
  → Clone: isolated git worktree, runs to completion, outputs JSON handshake
  → Janitor: evaluates handshake → BLOCK / SUGGEST / NOTE
      BLOCK  → worktree quarantined in state/worktrees/quarantine/, human alerted
      SUGGEST → clone retries with Janitor feedback appended (max 3×, from clone_config.json)
      NOTE   → merge worktree → ForgeRecord written → Bridge delivers result
  → Bridge: result delivered via Telegram (with Email/Discord/Slack/SMS fallback)
```

---

## 3. The Seven Segments

### Segment 1 — Memory (The Vault)
Persists everything across sessions. Zero runtime tokens — Brain never holds memories in context, it reads from the Vault on demand.

MemPalace is the backend: palace structure (wings → halls → rooms → closets), AAAK compression (30× lossless), temporal knowledge graph on SQLite, MCP server with 19 tools, 96.6% LongMemEval score. Access is abstracted behind a `MemoryStore` interface — swapping MemPalace for any other backend is one file change.

**Tiers:** L0_WAKE (≤170 tokens, identity + critical facts) → L1_RECENT (last session) → L2_DOMAIN (domain-specific) → L3_DEEP (full semantic search).

### Segment 2 — User Agent (The Virtual Clone)
The always-on lightweight process. Never resets. Guards all other segments behind a complexity classifier.

`ComplexityClassifier` (2-pass) routes every input with near-zero API cost:
- **Pass 1**: Hardcoded regex → `DIRECT` (greetings, ack, yes/no) or `FULL_PIPELINE` (verb+object patterns)
- **Pass 2**: Haiku fallback for ambiguous cases (10 tokens, "when in doubt prefer BRAIN_ONLY")

`BRAIN_ONLY` gets wiki context injected (`brainWikiPages` from `clone_config.json`).
`executeDirect` stays lightweight — no wiki, no history overhead.

Confidence gate: if `MissionBrief.confidence < confidenceGateThreshold` (from `clone_config.json`), returns a clarification request instead of dispatching a clone.

### Segment 3 — Brain (The Architect)
Plans. Delegates. **Never executes.** This is the single most important rule in the system.

The Brain is not a persistent process. It is a Claude Code session launched by the dispatcher with task context pre-loaded. It runs Sequential Thinking MCP to reason through the task, produces a structured `MissionBrief`, then hands off to the dispatcher and exits.

The Brain can read from Memory (L0/L1 tiers). It cannot write files. It cannot call APIs. It cannot spawn processes. If it ever does any of these things, the architecture is broken.

### Segment 4 — Clones (Special Ops)
Disposable executors. One mission, full context, isolated worktree.

Each clone runs in a `git worktree` — a parallel branch of the same repo with its own working directory. The clone receives a Mission Brief (TASK.md), reads the repo with Repomix, executes its task, and emits a structured JSON handshake:
```json
{
  "status": "COMPLETED | FAILED_REQUIRE_HUMAN | FAILED_RETRY | BLOCKED_IMPOSSIBLE",
  "files_modified": ["list of files"],
  "tests_passed": true,
  "tokens_consumed": 1234,
  "duration_seconds": 45,
  "janitor_notes": "what the clone thinks about its own work"
}
```
**Handshake is file-based (primary path):** runner writes to `state/handshakes/{cloneId}.json`. dispatcher reads + deletes. Falls back to stdout regex only if file is absent.

**Clone env is an allowlist.** `buildCloneEnv()` passes only: `PATH`, `HOME`, `NODE_ENV`, `TMPDIR`, `LANG`, `LC_ALL`, `SHELL`, `USER` + task-scoped keys from Keychain. Host env vars never leak.

**Failed clone → quarantine, not delete.** BLOCK verdict moves the worktree to `state/worktrees/quarantine/<cloneId>-<timestamp>/` for forensic inspection.

### Segment 5 — Janitor (The Muscle)
Doubts everything. Prunes. Audits. **Single source of truth is TypeScript `auditor.ts`.**

Decision tree order (MUST match in both TS and Python):
1. `BLOCKED_IMPOSSIBLE` status → **BLOCK**
2. `tests_passed === false` + source files present → **SUGGEST**
3. `COMPLETED` status → **NOTE** (if warn keywords → **SUGGEST**)

Python `janitor_evaluate()` is aligned to this exact order. If you change the TS tree, change Python to match.

WikiScythe handles knowledge base maintenance. Archive gate requires human `[x]` confirmation before any deletion.

### Segment 6 — Forge (Perpetual Improvement)
Proactive where Janitor is reactive. Runs after every successful clone.

Shadow runner executes Variant B. Evaluator (Sonnet-as-judge) scores A vs B. Ratchet: 5-win promotion rule. Forge budget is real: `ShadowRunner.recordMetric()` inserts into the SQLite metrics table (not just `events.jsonl`). `getTotalTokensThisCycle()` reads from that table.

The Forge never touches production directly. Janitor can veto any Forge promotion.

### Segment 7 — Bridge (The Output Layer)
Everything the user sees. The only segment with a path to the outside world.

**Hard rule: ALL output goes via Bridge. No exceptions. Console is invisible.**

5-channel fallback cascade:
```
Telegram (primary) → Email/AgentMail → Discord webhook → Slack webhook → SMS/Twilio
```

Exact watchdog launch command (never modify):
```bash
claude --effort $EFFORT --permission-mode auto --channels plugin:telegram@claude-plugins-official
```
Do NOT add `--append-system-prompt-file` or other flags — they silently break channel loading.

---

## 4. Repository Structure

```
Agent4wiki/
│
├── .gitignore              ← State Vault boundary (state/** blocked)
├── .env.example            ← All required vars documented
├── package.json            ← TypeScript + @anthropic-ai/sdk + @modelcontextprotocol/sdk
├── tsconfig.json           ← ES2022, strict, excludes state/
├── jest.config.js          ← testPathIgnorePatterns excludes state/worktrees/ (quarantine dirs)
│
├── scripts/
│   ├── bootstrap-linux.sh  ← One-command Linux node setup
│   └── bootstrap-windows.ps1
│
├── bin/
│   └── agent4.ts           ← CLI: start | status | audit
│
├── core/                   ← TypeScript Engine (committed)
│   ├── config/
│   │   └── clone_config.json  ← maxRetries, timeoutMs, watchdogMaxAgeMinutes,
│   │                             confidenceGateThreshold, brainWikiPages, maxWikiContextChars
│   ├── memory_store/       ← MemoryStore interface + MemPalaceAdapter
│   ├── keychain/           ← AES-256-GCM vault, JIT injection, scanForLeaks()
│   │   └── config/         ← scopes.yaml · fallback.yaml · patterns.yaml · rotation.yaml
│   ├── routing/            ← 2-pass ComplexityClassifier
│   ├── user_agent/         ← UserAgent (confidence gate, truncateHistory, soul TTL)
│   ├── brain/              ← planner · router · prompt_builder (truncateAtLineBoundary)
│   ├── clones/
│   │   ├── clone_worker.ts    ← buildCloneEnv() allowlist, retry loop
│   │   ├── watchdog.ts        ← stale worktree cleanup
│   │   └── lifecycle/
│   │       ├── spawner.ts     ← git worktree add, cloneId validation, --ignore-scripts
│   │       ├── runner.ts      ← execFileAsync array form (no shell injection)
│   │       └── teardown.ts    ← quarantine mode for BLOCK
│   ├── janitor/
│   │   ├── auditor.ts         ← single source of truth for Janitor decisions
│   │   ├── cli.ts             ← (planned) npx ts-node entry for Python delegation
│   │   ├── scythe.ts          ← archive-queue.md gate, execFileSync array form
│   │   └── config/
│   │       └── heuristics.json ← shared warn_keywords (TS + Python)
│   └── forge/              ← shadow_runner · evaluator · ratchet · metrics_db
│
├── brain/                  ← Python orchestration layer
│   ├── dispatcher.py       ← threaded watch(), janitor_evaluate() mirrors auditor.ts,
│   │                          build_clone_env() allowlist, SENSITIVE_ENV_KEYS strip
│   ├── bridge.py           ← Multi-channel Bridge relay
│   └── TASK-FORMAT.md
│
├── state/                  ← Runtime Vault (fully gitignored)
│   ├── keychain/           ← Encrypted vaults
│   ├── memory/             ← forge_metrics.db (SQLite)
│   ├── user_agent/         ← state.json, soul-private.md
│   ├── handshakes/         ← File-based handshakes {cloneId}.json
│   ├── worktrees/          ← Clone execution sandboxes
│   │   └── quarantine/     ← Failed (BLOCK) worktrees preserved for inspection
│   └── fleet/              ← Node registry + heartbeat
│
├── events/                 ← events/*.jsonl (gitignored)
├── forge/                  ← forge/events.jsonl (gitignored)
│
├── raw/                    ← Immutable source documents (never edit, only append)
│
└── wiki/                   ← 100 pages (fully committed)
    ├── index.md            ← Master catalog
    ├── log.md              ← Append-only operation record
    └── decisions/          ← All 8 build plans + 16 external reviews
```

---

## 5. Key Design Principles

These are non-negotiable. Established through 16 external reviews (8 Opus, 8 Gemini) and operational incidents.

**Brain never executes.** BrainPlanner writes MissionBrief → exits. No files, no subprocesses, no credentials.

**Credentials never touch disk at rest.** `provisionEnvironment()` writes `.env` to worktree. `revokeEnvironment()` deletes it in a `finally` block — unconditionally. `scanForLeaks()` confirms absence before returning clean.

**TS writes, Python reads. Never the reverse.** `core/user_agent/agent.ts` writes `brain/inbox/task-{id}.json`. `brain/dispatcher.py` reads it. TypeScript and Python never call each other directly. This boundary is the firewall.

**Janitor runs after every clone.** The NOTE/SUGGEST/BLOCK system is not optional. Every clone output goes through `janitor_evaluate()`.

**Teardown always runs in a `finally` block.** BLOCK → quarantine (not delete). COMPLETED → normal teardown.

**ALL output via Bridge.** `brain/bridge.py` is the only exit. Console output is invisible.

**Compile before deploy.** `npx tsc --noEmit` must exit 0. Currently exits 0 — do not introduce regressions.

**TypeScript owns `core/` and `bin/`. No exceptions.** Clones may execute Python inside worktrees. All orchestration in `core/` is TypeScript.

**Path traversal defence — always `path.resolve()`.** All paths must be resolved to absolute and verified to start within the allowed worktree path. `realpathSync` before reading files (symlink boundary check implemented in `scanForLeaks()`).

**Clone env is an allowlist, not a blacklist.** `REQUIRED_ENV_KEYS = ['PATH', 'HOME', 'NODE_ENV', 'TMPDIR', 'LANG', 'LC_ALL', 'SHELL', 'USER']` + task-scoped keys. Any host secret not on the list does not reach the clone.

**Python sensitive keys are stripped, not inherited.** `build_clone_env()` in `dispatcher.py` strips `VAULT_MASTER_PASSWORD`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` from the subprocess env. SENSITIVE_ENV_KEYS set is explicit.

**Janitor decision tree order is authoritative.** `auditor.ts` defines the order. `dispatcher.py` must mirror it exactly. Any change to one requires updating the other.

**Wiki context truncates at line boundaries.** `truncateAtLineBoundary(content, 800)` — not `content.slice(0, 800)`. Mid-JSON truncation degrades LLM reasoning.

**`runner.ts` uses `execFileAsync` array form.** Never `execAsync('bash "${script}"')` — shell injection risk. Always `execFileAsync('bash', [script])`.

**Config values belong in `clone_config.json`.** Magic numbers (`0.5`, `3`, `300000`) live in `core/config/clone_config.json`. Both TS and Python read from it.

**`state.json` updates are triggered, not per-turn.** `flushState()` is called only when: (a) classifier routes to `FULL_PIPELINE`, or (b) every 5 `DIRECT` interactions. Not on every prompt.

---

## 6. Decision Summary

| Decision | Ruling |
|----------|--------|
| **Monorepo** | Stay monorepo. Wiki and engine are coupled by design. |
| **TypeScript vs Python** | TypeScript for Core Orchestrator. Python for dispatcher + Clones. Inbox is the API contract. |
| **Brain never executes** | Absolute rule. No exceptions. |
| **7 segments** | Bridge earns segment status. Output reliability = execution reliability. |
| **Forge independence** | Forge never touches production directly. Janitor can veto. |
| **MemoryStore interface** | All memory access abstracted. Swap MemPalace = one file. |
| **ComplexityClassifier** | 2-pass: hardcoded regex → Haiku fallback. No LLM for routing tier 1. |
| **Credential injection** | JIT allowlist env injection. `finally` revocation. |
| **Worktrees** | git worktrees for clone isolation. Quarantine on BLOCK (preserve forensics). |
| **Inbox as API** | `brain/inbox/` is TS→Python contract. Filesystem-mediated, unidirectional. |
| **Janitor directives** | NOTE → merge. SUGGEST → re-queue (max `maxRetries` from config). BLOCK → quarantine + broadcast. |
| **Forge budget is real** | `ShadowRunner.recordMetric()` inserts into SQLite metrics table. Budget cap reads from that table. |
| **Bridge cascade** | Telegram → Email → Discord → Slack → SMS. `send()` cascades. `broadcast()` fires all. |
| **Repomix mandate** | Every coding clone runs `npx repomix` first. Never skip. |
| **File-based handshake** | Runner writes `state/handshakes/{cloneId}.json`. Dispatcher reads+deletes. Stdout fallback only. |
| **Effort routing** | `--effort max` for security fixes + precision wiring. `--effort medium` for standard tasks. Never `--effort high`. |
| **Benchmark baseline** | Sonnet 4.6 is default for all tasks. Forge drives downgrade (Haiku → Ollama → BitNet). |

---

## 7. Model Governance — Sonnet as Benchmark Baseline

**Default model: Claude Sonnet 4.6 for ALL tasks.**

This is the benchmarking baseline. All skills run on Sonnet first. Only after baselines are established does the Forge test downward.

**Optimization path:**
```
Claude Sonnet 4.6  ← baseline
    ↓ Forge tests
Claude Haiku 4.5   ← routing, classification, short tasks
    ↓ Forge tests
Ollama (local)     ← no API cost
    ↓ Forge tests
BitNet 2B          ← extreme efficiency, CPU-only
```

Benchmark results (Phase 2 Forge run, all 6 combos):
- **Opus medium**: winner (6k tokens, 1.6 min, 10/10 correctness)
- **Haiku medium**: worst (19.6k tokens)
- **Effort max** beats medium on security fixes + precision wiring. Never use `--effort high`.

---

## 8. Current State (as of 2026-04-08 — Branch `opus-build`)

**198 tests (156 Jest + 42 pytest). TSC clean. 0 stubs.**

### Build history

| Version | Tests | Key wins |
|---------|-------|----------|
| Phase 5-7 baseline | 84 | AES vault, MCP transport, WikiScythe, fleet, Forge core |
| v3 | 103 | SSH injection fix, env strip, noLeaks→BLOCK, file handshake, watchdog |
| v4 | 126 | 2-pass classifier, Janitor unified, Forge cost cap, executeDirect+Soul.md |
| v5 | 140 | Forge budget real, spawner injection blocked, wiki token cap |
| v6 | 157 | Registry fix, OOM guard, dispatcher injection, scythe, soul TTL |
| v7 | 174 | Python vault leak, git status scan, env allowlist, confidence gate |
| **v8** | **198** | Janitor unified (TS/Python), rename parsing, symlink guard, watch() threaded, execFile, config externalised, quarantine mode, truncateAtLineBoundary |

### What is implemented (nothing is a stub)

All components in `core/` are working code:
- **Keychain**: AES-256-GCM vault, scrypt KDF, `scanForLeaks()` with git status, symlink guard, `largeFilesSkipped`
- **Classifier**: 2-pass (hardcoded regex → Haiku), confidence gate
- **Janitor**: `auditor.ts` is authoritative, `heuristics.json` shared, WikiScythe with archive gate
- **Clone lifecycle**: spawner + runner (execFileAsync) + teardown (quarantine on BLOCK) + watchdog
- **Forge**: ShadowRunner budget cap, `recordMetric()` → SQLite, ratchet (5-win), evaluator
- **Bridge**: 5-channel cascade, `send()` / `broadcast()` / `ping()`
- **Python dispatcher**: threaded `watch()`, `janitor_evaluate()` mirrors TS, `build_clone_env()` allowlist

---

## 9. Known TODOs — Build Plan V9 Candidates

These are the open issues from 16 external reviews. The next build plan will prioritise from this list based on Opus+Gemini review of v8.

**Security:**
- `--dangerously-skip-permissions` is still active in `runner.ts` and `dispatcher.py`. Docker/Firecracker sandbox is the real fix. This is the biggest outstanding security gap.
- `events.jsonl` and Janitor logs capture all LLM output. PII/proprietary code is permanently logged. Data-scrubbing middleware needed before `events.jsonl` writes.
- Python `SENSITIVE_ENV_KEYS` is currently a blacklist (v7 fix). Should mirror TS allowlist approach.

**Reliability:**
- `extract_handshake()` regex fallback in `dispatcher.py` false-positives on clone output that contains handshake-shaped JSON in code examples or documentation.
- `ForgeEvaluator` brittle string parsing — `"WIN_A"` anywhere in response counts as a win.
- No integration test for full clone lifecycle end-to-end (all current tests mock components).
- Conversation history not persisted across restarts.
- JSONL concurrent writes in Forge (non-atomic appends, potential corruption).

**Architecture:**
- `dispatcher.py` monolith decomposition — one file handles watch, task processing, Janitor, Bridge, fleet. Should be split.
- `core/janitor/cli.ts` (Option A) — TypeScript CLI entry point so Python can delegate to `auditor.ts` via subprocess. Currently using Option B (aligned Python tree). Option A would be authoritative.
- Git worktree orphan branches after failed teardown (git history bloat over time).

**Quality:**
- State race condition: two rapid `FULL_PIPELINE` triggers → `flushState()` race on `state.json`.
- `compressHistory` → `truncateHistory` is done, but actual Haiku-based summarisation is not wired (TODO comment in code).
- Bootstrap scripts assume sudo/Administrator privileges — hostile to shared servers.

---

## 10. Full Repo Context

The codebase is packed into a Repomix file (excludes `raw/` review documents):
**`raw/repomix-v8.xml`** — current state after v8, 198 tests

Read this before modifying any file. Do not assume — read the actual code.

The full wiki (100 pages) is in `wiki/`. Key references:
- `wiki/decisions/build-state-2026-04-08-v8.md` — complete v8 state snapshot
- `wiki/decisions/plan-build-v8.md` — the plan Opus executed for v8
- `wiki/index.md` — master catalog of all 100 pages

---

## 11. Definition of Done — V9

The next build round (v9) targets fixing the top security + reliability gaps from the v8 review. Done when:

```
npx tsc --noEmit          → exits 0
npx jest                  → 198+ tests green (target ~215)
python3 -m pytest test/   → 42+ tests green
git log --oneline -5      → 3-4 commits on opus-build
```

**Priority order** (to be confirmed by v8 review):
1. Docker sandbox for clone execution (or at minimum, firejail on Linux)
2. `extract_handshake()` false-positive fix
3. Data-scrubbing before `events.jsonl` writes
4. Full clone lifecycle integration test (no mocks)
5. `core/janitor/cli.ts` — Option A Janitor delegation from Python

---

## 12. Scope Guard

- **No new npm dependencies** unless explicitly required by the build plan.
- **Do not modify `wiki/`** — content only, not code.
- **Do not modify `main` branch** — `opus-build` only.
- **Do not implement items not in the build plan** — the plan comes after the v8 review.
- **Do not rebuild working components** — read the code first, understand what exists.

---

## 13. Output Protocol

**Do not attempt to write the entire plan in one response.**

After each phase, run:
```bash
npx tsc --noEmit && npx jest && python3 -m pytest test/
```

All must stay green. Commit after each phase. Report test count before proceeding.

If you are unsure whether to proceed: stop and ask.
