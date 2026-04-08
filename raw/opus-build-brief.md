# Opus Build Brief — Agent V4

> You are Claude Opus. You are about to implement a personal AI agent system from a well-architected scaffold to a working autonomous loop.
>
> Read this document top to bottom before writing a single line of code. It starts with why this was built and what it is. The technical implementation details come after you understand the system.

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
  → PromptBuilder: Soul + wiki context + task → final prompt
  → Keychain: JIT credentials provisioned for this skill scope
  → Clone: isolated git worktree, runs to completion, outputs JSON handshake
  → Janitor: evaluates handshake → BLOCK / SUGGEST / NOTE
      BLOCK  → Brain re-plans or escalates to human
      SUGGEST → clone retries with Janitor feedback appended (max 3×)
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

`ComplexityClassifier` routes every input with zero API cost (regex only):
- `DIRECT` → hardcoded/local response, <1s, no API call
- `BRAIN_ONLY` → Brain reads memory and answers, no clones spawned
- `FULL_PIPELINE` → full V4 sequence: Brain → Keychain → Clones → Janitor → Bridge

Compresses conversation history every 10 turns via local model (BitNet 2B). State schema: `state/user_agent/state.json` — ≤500 tokens.

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
The Janitor reads this handshake. The clone does not decide its own fate.

**Handshake parsing rule:** The clone MUST output its JSON handshake as the **final line of stdout**. Parser in `CloneRunner`: split stdout by `\n`, reverse-iterate to find the last line starting with `{`, `JSON.parse()` that line. If no valid JSON found → `FAILED_REQUIRE_HUMAN`. Do not use a greedy regex on the full output — it will match debug logs, not the handshake.

**Fleet routing:** `target_node` and `required_platform` fields are reserved in the task schema but **ignored by the current dispatcher — this is Phase 5+, not this build**. All tasks execute locally for now.

### Segment 5 — Janitor (The Muscle)
Doubts everything. Prunes. Audits.

The Janitor evaluates every clone output against structural criteria before anything is merged:
- **BLOCK**: BLOCKED_IMPOSSIBLE, fatal failures, security violations → escalate to human
- **SUGGEST**: scope creep, missing tests, architectural smell, FAILED_RETRY → re-queue with feedback (max 3×)
- **NOTE**: clean output → merge worktree, write ForgeRecord

`detectStructuralIssue()` runs structural checks with no LLM needed: scope creep (>5 files + "also fixed" language), missing tests (source files without test files), shared config mutation (edits to tsconfig/package.json/.gitignore).

WikiScythe handles knowledge base maintenance: delete stale entries (expired `valid_until`), flag contradictions, surface orphan pages.

### Segment 6 — Forge (Perpetual Improvement)
Proactive where Janitor is reactive. Runs after every successful clone to find better approaches.

Shadow runner executes a Variant B alongside every production task (different model, prompt, or approach). Evaluator (Sonnet-as-judge) scores A vs B. Ratchet applies the 5-win promotion rule: when Variant B beats production 5 times, it becomes production. Git tag rollback if promotion degrades quality. Metrics DB (SQLite, gitignored) tracks latency, tokens, rejection rates, and win streaks per skill.

The Forge never touches production directly. Janitor can veto any Forge promotion.

### Segment 7 — Bridge (The Output Layer)
Everything the user sees. The only segment with a path to the outside world.

**Hard rule: ALL output goes via Bridge. No exceptions. Console is invisible.**

5-channel fallback cascade:
```
Telegram (primary) → Email/AgentMail → Discord webhook → Slack webhook → SMS/Twilio
```

`send()` cascades on failure (stops at first success). `broadcast()` fires all channels simultaneously — used for BLOCK directives and security alerts. `ping()` is Telegram-only for session lifecycle messages.

The watchdog process maintains the Telegram connection continuously. Exact launch command (never modify):
```bash
claude --effort $EFFORT --permission-mode auto --channels plugin:telegram@claude-plugins-official
```

**Three long-running processes — all must be running for the system to work:**
```
1. Telegram watchdog:  claude --effort $EFFORT --permission-mode auto --channels plugin:telegram@claude-plugins-official
2. Python dispatcher:  source venv/bin/activate && python brain/dispatcher.py watch
3. (Future) Fleet node: not yet implemented
```
The watchdog belongs to the Bridge (it is the Bridge's always-on process). The dispatcher belongs to the orchestration layer. Neither is optional.

---

## 4. Repository Structure

```
Agent4wiki/
│
├── .gitignore              ← State Vault boundary (state/** blocked)
├── .env.example            ← All required vars documented with setup instructions
├── package.json            ← TypeScript + @anthropic-ai/sdk + @modelcontextprotocol/sdk
├── tsconfig.json           ← ES2022, strict, excludes state/
│
├── scripts/
│   ├── bootstrap-linux.sh  ← One-command Linux node setup (apt/dnf/pacman, systemd)
│   ├── bootstrap-windows.ps1 ← One-command Windows node setup (winget, Task Scheduler)
│   └── wiki-lint.sh        ← Verify wiki page count matches index entries
│
├── bin/
│   └── agent4.ts           ← CLI: start | status | audit (stub)
│
├── core/                   ← TypeScript Engine (committed, immutable logic)
│   ├── memory_store/       ← MemoryStore interface + MemPalaceAdapter
│   ├── keychain/           ← JIT credential injection
│   │   └── config/         ← scopes.yaml · fallback.yaml · patterns.yaml · rotation.yaml
│   ├── routing/            ← ComplexityClassifier
│   ├── user_agent/         ← UserAgent orchestrator
│   ├── brain/              ← planner · router (was dispatcher.ts) · prompt_builder
│   ├── clones/             ← clone_worker · lifecycle/{spawner,runner,teardown}
│   │   └── templates/      ← Mission Brief templates (migration target)
│   ├── janitor/            ← auditor V2 · WikiScythe (stub)
│   └── forge/              ← shadow_runner · evaluator · ratchet · metrics_db (all stubs)
│
├── brain/                  ← Python orchestration layer
│   ├── dispatcher.py       ← Watch daemon: inbox/ → execute → Janitor → Bridge
│   ├── bridge.py           ← Multi-channel Bridge relay (5 channels)
│   └── TASK-FORMAT.md      ← Task JSON spec (6 task types)
│
├── templates/              ← Mission Brief templates (consolidate to core/clones/templates/)
│   └── code-clone-TASK.md  ← Master Code Clone Template V2
│
├── state/                  ← Runtime Vault (fully gitignored via state/**)
│   ├── keychain/           ← Encrypted credential vaults
│   ├── memory/             ← Local vector DB + forge_metrics.db
│   ├── user_agent/         ← state.json, soul-private.md
│   ├── worktrees/          ← Clone execution sandboxes (temporary, auto-cleaned)
│   └── fleet/              ← Node registry + heartbeat files
│
├── events/                 ← Event streams (events/*.jsonl gitignored)
├── forge/                  ← Forge output (forge/events.jsonl gitignored)
│
├── raw/                    ← Immutable source documents (never edit, only append)
│   ├── repomix-full-context.txt  ← Full repo pack — read this before touching code
│   ├── opus-build-brief.md       ← This document
│   └── [all review sources]
│
└── wiki/                   ← The Brain's OS (57 pages, fully committed)
    ├── CLAUDE.md           ← Wiki schema, wikilink convention, tiering, token budget
    ├── Soul.md             ← Agent identity: voice, values, delegation style
    ├── index.md            ← Master catalog
    ├── log.md              ← Append-only operation record
    ├── segments/           ← 7 segment pages
    ├── concepts/           ← 16 concept pages
    ├── tools/              ← 8 tool pages
    ├── entities/           ← 2 entity pages
    └── decisions/          ← 22 decision + review + plan pages
```

**Three-zone separation (never cross these boundaries):**
- `core/` + `brain/` + `wiki/` — committed logic and knowledge
- `state/` — gitignored runtime vault (credentials, worktrees, memory)
- `events/` + `forge/` — gitignored runtime logs

---

## 5. Key Design Principles

These are non-negotiable. They were established through 9 external reviews and hard-won operational incidents. Violating them introduces the exact failure modes the architecture was designed to prevent.

**Brain never executes.** If `BrainPlanner` writes a file, calls a subprocess, or touches a credential, the architecture is broken. Brain plans → writes MissionBrief → exits. That is the complete scope.

**Credentials never touch disk at rest.** `provisionEnvironment()` writes a temporary `.env` to the worktree. `revokeEnvironment()` must delete it in a `finally` block — unconditionally, even if the clone crashes. `scanForLeaks()` confirms the key is absent from all modified files before returning clean.

**TS writes, Python reads. Never the reverse.** `core/user_agent/agent.ts` writes `brain/inbox/task-{id}.json`. `brain/dispatcher.py` reads it. The inbox directory is the API contract. TypeScript and Python never call each other directly. This boundary is the firewall.

**Janitor runs after every clone.** The NOTE/SUGGEST/BLOCK system is not optional scaffolding to be added later. Every clone output goes through `janitor_evaluate()`. An agent that can produce bad results fast is worse than a slow agent.

**Teardown always runs.** `CloneTeardown.teardown()` must execute in a `finally` block. Orphaned worktrees accumulate silently and fill disk. A clone that crashes without cleanup leaves the system degraded.

**ALL output via Bridge.** `brain/bridge.py` is the only exit. Import `get_bridge()` and use `bridge.send()` for completions, `bridge.broadcast()` for BLOCK/security. Console output is invisible to the user.

**Compile before deploy.** `npx tsc --noEmit` must exit 0 before any code is run. Six compile errors exist in the current scaffold — they must be fixed in Phase 0 before Phase 1 begins.

**Strict language mandate — TypeScript owns `core/` and `bin/`. No exceptions.** The entire Core Engine (`core/` and `bin/`) MUST be written in strict TypeScript (Node.js). The Repomix context contains heavy Python references because AI tooling is Python-heavy — do not be misled. Clones may execute Python scripts inside their worktrees, but every file in `core/` that you write or modify is TypeScript. If you find yourself writing Python in `core/`, stop and reconsider.

**Path traversal defence — always `path.resolve()`.** When building `KeychainManager` and clone execution environments, all paths MUST be resolved to absolute paths using Node's `path.resolve()`. Verify that the resolved path strictly starts with the allowed worktree path before proceeding. `path.includes(allowed)` is not sufficient — it is vulnerable to `../../../` traversal. Required pattern:
```typescript
const resolved = path.resolve(requestedPath);
if (!resolved.startsWith(path.resolve(worktreePath))) {
  throw new Error(`Path traversal attempt: ${requestedPath}`);
}
```

**`runner.ts` must execute `setup.sh` before the LLM mission.** Every clone worktree contains a `setup.sh` (written by `spawner.ts`). The runner must execute it before launching the claude session. This ensures npm/pip dependencies are installed. A clone that starts without its dependencies installed will fail the Janitor audit immediately. If `setup.sh` is missing, proceed but log a warning — it is optional, not mandatory.

**`state.json` updates are asynchronous and triggered, not per-turn.** `state.json` is updated only when: (a) the ComplexityClassifier routes to `FULL_PIPELINE`, or (b) every 5 `DIRECT` interactions have accumulated. Do NOT update on every prompt — this burns tokens on trivial turns. Implement a lightweight `flushState()` method called from these two trigger points only.

**Python dispatcher calls the TypeScript lifecycle as a subprocess — this is the TS↔Python bridge.** The dispatcher.py does NOT call TypeScript functions directly. The integration contract is:
```
dispatcher.py spawns: npx ts-node core/clones/clone_worker.ts --task <path-to-task.json>
clone_worker.ts reads the task JSON, runs the full TS lifecycle:
  spawn worktree → provision credentials → run clone → Janitor evaluate → teardown
clone_worker.ts outputs a CloneResult JSON to stdout (last line).
dispatcher.py reads that JSON and calls bridge.py to deliver the result.
```
This is the only TS↔Python communication path. No shared memory, no sockets, no direct calls.

**`KeychainManager.executeCloneMission()` is DEPRECATED — delete it in Phase 0.** It was the V1 lifecycle that owned the full clone execution. `CloneWorker.execute()` is the V2 lifecycle. The Keychain provides `provisionEnvironment()` and `revokeEnvironment()` as primitives; `CloneWorker` orchestrates them. Remove `executeCloneMission()` and `launchClone()` from `manager.ts` in Phase 0 — they create two competing lifecycle patterns that will confuse any future reader.

**`CloneRunner.run()` is the ONLY place that spawns a claude process.** `KeychainManager.launchClone()` is DEPRECATED (V1 pattern) — delete it alongside `executeCloneMission()`. The runner receives credentials via `provisionEnvironment()` writing `.env` to the worktree; the process inherits them through the environment.

**`setup.sh` is written by `spawner.ts` during worktree creation with this content:**
```bash
#!/bin/bash
set -e
cd "$(dirname "$0")"
[[ -f package.json ]] && npm install --silent
[[ -f requirements.txt ]] && pip install -r requirements.txt --quiet
echo "Setup complete."
```
If the task template specifies additional setup commands, append them. `runner.ts` executes this file before the LLM mission. If missing: warn and proceed.

**Injection variable names are standardised — templates MUST use these exact strings:**
```
{INJECT_SOUL_HERE}              — wiki/Soul.md + state/user_agent/soul-private.md
{INJECT_ALLOWED_PATHS_HERE}     — filesystem scope for this clone
{INJECT_ALLOWED_ENDPOINTS_HERE} — network scope from scopes.yaml
{INJECT_WIKI_CONTEXT_HERE}      — relevant wiki pages (max ~500 tokens)
{INJECT_TASK_HERE}              — the mission objective
```
`prompt_builder.ts` replaces exactly these five. If `templates/code-clone-TASK.md` uses different variable names (the old template uses `{INJECT_SOUL_MD_HERE}`, `{INJECT_ALLOWED_PATH_HERE}`), update the template to match, not the builder.

**Wiki pages are in subdirectories — `loadWikiContext()` must search recursively.** Page names like `"segment-brain"` resolve to `wiki/segments/segment-brain.md`, not `wiki/segment-brain.md`. Implement as:
```typescript
for (const subdir of ['segments', 'concepts', 'tools', 'entities', 'decisions', '']) {
  const p = subdir ? path.join(WIKI_PATH, subdir, `${pageName}.md`) : path.join(WIKI_PATH, `${pageName}.md`);
  if (fs.existsSync(p)) { /* use p */ break; }
}
```
Without this fix, wiki context injection silently fails on every task.

**MemPalace MCP API is partially unknown — use `// TODO` markers.** The `repomix-full-context.txt` does not include the MemPalace server's tool definitions. When implementing `MemPalaceAdapter`, assume the MCP server exposes tools named: `create_room`, `add_memory`, `search_vault`, `get_aaak_summary`, `delete_memory`, `list_rooms`. Generate TypeScript interfaces assuming standard MCP JSON-RPC protocol. Where the exact parameter schema is uncertain, leave a `// TODO: Map to exact MemPalace MCP schema` comment. Do not guess and proceed silently — make unknowns explicit.

---

## 6. Decision Summary

Every major decision is documented in `wiki/decisions/`. Summary:

| Decision | Ruling |
|----------|--------|
| **Monorepo vs split** | Stay monorepo. Wiki and engine are coupled by design — contracts change together. CI uses `paths:` filters to separate wiki lint from TypeScript CI. |
| **TypeScript vs Python** | TypeScript for Core Orchestrator (User Agent, Brain, Janitor, Keychain). Python for dispatcher + Clones. MCP is the physical firewall between them. |
| **Brain never executes** | Absolute rule. Planning process = no execution. Execution = clones only. |
| **6 segments vs 7** | 7. The Bridge earns segment status: distinct failure modes, own reliability contract, independent evolution path. Output reliability = execution reliability. |
| **Forge independence** | Forge never touches production directly. Janitor can veto any Forge promotion. |
| **MemoryStore interface** | All memory access through `MemoryStore` interface. Swap MemPalace for any backend = one file change. |
| **Async-first** | All MemoryStore methods return `Promise<>`. Prevents blocking if backend is remote. |
| **ComplexityClassifier = regex** | No LLM for routing. Regex heuristics only. A classifier that re-introduces the latency it was designed to eliminate is worthless. |
| **Credential injection** | JIT process-memory injection via `provisionEnvironment()`. Try/finally revocation. Never .env files on disk except ephemerally in worktree. |
| **Worktrees** | git worktrees for clone isolation. Parallel branches, shared history, auto-cleaned by `CloneTeardown`. |
| **Inbox as API** | `brain/inbox/` is the contract between TS and Python. Filesystem-mediated, unidirectional, decoupled. TS writes, Python reads. A TS bug can't crash the Python daemon. |
| **Janitor directives** | NOTE → merge. SUGGEST → re-queue with feedback (max 3×). BLOCK → escalate to human + broadcast via all Bridge channels. |
| **ForgeRecord** | Forge logs to `forge/events.jsonl` (JSON-lines, gitignored), not wiki/log.md. Structured: task_id, skill, directive, tokens_consumed, duration_seconds, files_modified. |
| **Bridge cascade** | Telegram primary. Email → Discord → Slack → SMS fallback. `send()` cascades. `broadcast()` fires all. |
| **Sequential Thinking** | Brain must complete a Sequential Thinking pass before any Mission Brief. No shortcuts. |
| **Repomix mandate** | Every coding clone runs `npx repomix` as its first step. 70% token reduction. Never skip. |

---

## 7. Model Governance — Sonnet as Benchmark Baseline

**First implementation rule: Claude Sonnet 4.6 is the default model for ALL tasks.**

This is not a permanent configuration — it is the benchmarking baseline. Every skill (code, research, devops, docs, qa) runs on Sonnet first to establish a quality and cost baseline. Only after baselines are established do we test downward.

**Optimization path (after baseline established):**

```
Claude Sonnet 4.6  ← baseline — implement everything here first
    ↓ test down
Claude Haiku 4.5   ← routing, classification, simple tasks
    ↓ test down
Ollama (local)     ← no API cost, acceptable quality for some tasks
    ↓ test down
BitNet 2B          ← extreme efficiency, CPU-only, summarization
```

**Where this applies in code:**

`BrainPlanner.plan()` — use `claude-sonnet-4-6` in the initial implementation. The Forge will benchmark Haiku later.

`ComplexityClassifier` — stays regex-based (no LLM). This is a routing decision, not a quality decision.

`CloneWorker` — launch command uses `claude-sonnet-4-6` for all clone sessions initially. Do not add model-routing logic yet. That is the Forge's job.

`UserAgent.compressHistory()` — Sonnet for MVP. BitNet is the long-term target but requires local setup.

**In `brain/dispatcher.py` task format**, add a `model` field (default `"claude-sonnet-4-6"`):
```json
{
  "id": "task-001",
  "type": "clone",
  "model": "claude-sonnet-4-6",
  ...
}
```

When the Forge begins A/B testing, it will vary this field. The dispatcher should already pass it through to the clone launch command.

**How the `model` field reaches the clone:**

The clone launch command in `CloneRunner.run()` must pass the model explicitly:
```bash
claude --model ${task.model} --print --dangerously-skip-permissions -p "${prompt}"
```

If `--model` is not supported by the installed Claude CLI version, fall back to setting the environment variable before spawning:
```python
env["CLAUDE_MODEL"] = task.get("model", "claude-sonnet-4-6")
```

Check which variant works: `claude --help | grep model`. Use whichever is supported. Default `"claude-sonnet-4-6"` if the field is absent.

---

## 8. Current State

### What runs today
- `python brain/dispatcher.py watch` — watch daemon, picks up inbox tasks
- `brain/bridge.py` — 5-channel Bridge, all channels implemented
- `core/routing/classifier.ts` — ComplexityClassifier (regex, complete)
- `core/janitor/auditor.ts` — Janitor V2 (structural checks, ForgeRecord output)
- `core/brain/prompt_builder.ts` — template injection (complete)
- `scripts/bootstrap-linux.sh` + `scripts/bootstrap-windows.ps1`

### What is a stub or broken

| File | Issue |
|------|-------|
| `core/keychain/manager.ts` | `loadMasterVault()` returns `{}`, `scanForLeaks()` always returns `true`, missing 3 methods |
| `core/memory_store/mempalace_adapter.ts` | Missing `writeSummary()`, `audit()`, wrong `readContext()` signature |
| `core/brain/planner.ts` | `plan()` throws |
| `core/clones/lifecycle/spawner.ts` | `createWorktree()` throws |
| `core/clones/lifecycle/runner.ts` | All 3 methods throw |
| `core/clones/lifecycle/teardown.ts` | All 3 methods throw |
| `core/user_agent/agent.ts` | `triggerFullPipeline()` returns placeholder string |
| `core/forge/` | All 4 files are stubs |

### Compile-blocking bugs (fix these first — nothing builds)
1. `MissionBrief` defined in both `manager.ts` (4 fields) and `planner.ts` (10 fields)
2. `clone_worker.ts` calls `keychain.provisionEnvironment()` — doesn't exist
3. `clone_worker.ts` calls `keychain.revokeEnvironment()` — doesn't exist
4. `core/brain/dispatcher.ts` calls `keychain.getScopeKeys()` — doesn't exist
5. `mempalace_adapter.ts` missing `writeSummary()` + `audit()`
6. `mempalace_adapter.ts` `readContext(tier: string)` should be `readContext(tier: MemoryTier)`

---

## 9. Build Order

Phases have hard dependencies. Do not reorder.

```
Phase 0 (Day 1-2)   Fix 8 compile errors → npx tsc --noEmit exits 0
Phase 1 (Week 1)    Fix dispatcher.py paths + add Janitor integration + pytest suite
Phase 2 (Week 2)    loadMasterVault() MVP + scanForLeaks() with patterns.yaml
Phase 3 (Weeks 3-4) Clone lifecycle: spawner + runner + teardown
Phase 4 (Weeks 5-6) BrainPlanner.plan() (Sonnet) + triggerFullPipeline() → first autonomous loop
```

Full phase-by-phase instructions with exact code and test commands:
**`wiki/decisions/plan-build-v1.md`**

---

## 10. Full Repo Context

The codebase is packed into a focused Repomix file (excludes raw/ review documents — cleaner signal):
**`raw/repomix-focused-context.txt`** (7,976 lines)

This includes: `core/`, `brain/`, `wiki/segments/`, `wiki/concepts/`, `wiki/decisions/plan-build-v1.md`, `decision-*.md`, `templates/`, `scripts/`.

Read this before modifying any file. Do not assume — read the actual code.

A full pack (including all review history) is also available at `raw/repomix-full-context.txt` (634KB / 13,980 lines) if you need historical context, but start with the focused version.

---

## 11. Definition of Done

Phase 4 is complete when this runs without manual intervention:

```
1. $ npx ts-node -e "
   import { UserAgent } from './core/user_agent/agent';
   new UserAgent().handleUserInput('Write a Python hello world to /tmp/v4-test/hello.py');
   "
   → Telegram: "Task queued: task-{id}."

2. brain/dispatcher.py watch (running in background)
   → picks up task-{id}.json from brain/inbox/
   → spawns state/worktrees/task-{id}/
   → provisions .env, launches clone (Sonnet)
   → clone writes /tmp/v4-test/hello.py
   → revokeEnvironment() deletes .env

3. janitor_evaluate(handshake) → NOTE
   → write_forge_record() → forge/events.jsonl
   → bridge.send() → Telegram notification

4. Verify:
   ✓ cat /tmp/v4-test/hello.py  (file exists, contains hello world)
   ✓ ls brain/completed/        (task-{id}.json present)
   ✓ ls state/worktrees/        (empty — cleaned up)
   ✓ tail forge/events.jsonl    (ForgeRecord entry present)
   ✓ Telegram received the notification

5. Verify security:
   ✓ ls state/worktrees/task-{id}/.env   → must NOT exist (revoked)
   ✓ grep -r "sk-ant" state/worktrees/   → must return nothing (no leaked keys)
```

---

## 12. Scope Guard — Do NOT

These are out of scope for this build. Do not implement them.

- **Fleet routing**: Phase 5+. `target_node` and `required_platform` fields are reserved but must be ignored. Do not write any multi-machine routing code.
- **Forge**: All 4 Forge files are intentional stubs. Do not implement shadow benchmarking, ratchet, or evaluator logic. The stubs exist so the build compiles — leave them as stubs.
- **New npm dependencies**: Do not add packages not already in `package.json`. If a third-party library seems needed, flag it and stop.
- **Wiki pages**: `wiki/` is content, not code. Do not modify any wiki page during this build.
- **MemPalace MCP integration**: Mark any MemPalace call as `// TODO: Map to exact MemPalace MCP schema`. Do not guess the API surface.
- **`.env` files outside worktrees**: Write `.env` only to `state/worktrees/{task-id}/.env`. Never write secrets to the project root or any other location.
- **console.log as primary output**: Use `bridge.send()` or `bridge.ping()` for all user-facing notifications. `console.log` is for debug only — never the main output path.

---

## 13. Output Protocol — Staged Generation (Critical)

**Do NOT attempt to write the entire codebase in one response.**

You will run out of output tokens partway through a critical file. A half-written `KeychainManager` is worse than no implementation.

Follow this staged protocol:

```
Step 1: Output complete code for Phase 0 only (all 8 compile fixes).
        → STOP. Wait for "Proceed to Phase 1."

Step 2: Output complete code for Phase 1 (dispatcher.py fixes + Janitor integration).
        → STOP. Wait for "Proceed to Phase 2."

Step 3: Output complete code for Phase 2 (loadMasterVault + scanForLeaks).
        → STOP. Wait for "Proceed to Phase 3."

Step 4: Output complete code for Phase 3 (spawner + runner + teardown).
        → STOP. Wait for "Proceed to Phase 4."

Step 5: Output complete code for Phase 4 (BrainPlanner + triggerFullPipeline).
        → STOP. Declare: "First autonomous loop ready. Run Section 11 DoD checklist."
```

Each step: write complete, compilable, test-passing files. No placeholders. No stubs except where the build plan explicitly permits them.

If you are unsure whether to proceed: stop and ask. An incomplete file is worse than no file.

Start with Phase 0. Good luck.
