# Agent4wiki

**Agent V4 Architecture — Living Knowledge Base + Implementation**

A Karpathy-pattern wiki mapping the full architecture of a multi-machine AI agent system, with TypeScript implementation and Python orchestration committed alongside the knowledge. The architecture describes a system where a Brain plans, Clones execute on any machine in the fleet, a Janitor audits quality, a Forge improves templates over time, and a Bridge keeps the human in the loop via Telegram.

> This is a compiled artifact, not a document dump. Knowledge is ingested once, structured, and compounds over time.

---

## Why This Exists

Most AI agent frameworks give you agents that can *run*. What they can't give you is an agent that is *yours* — one that knows your voice, guards your credentials, learns from every session, improves its own tools, and reaches you on your phone when something finishes at 2am.

**The specific problems that made existing tools unusable:**
- They reset every session — an agent with no memory is just an expensive CLI
- They can't keep secrets — credentials leak into logs, context windows, config files
- They're single-machine — a coding task and a browser task need different hardware
- Their output is invisible — console output doesn't reach your phone
- They don't improve — the 100th task runs the same as the 1st

**The design answers each problem directly:**
- Memory segment (The Vault) — compounding knowledge, AAAK compression, zero runtime tokens
- Keychain — JIT injection, credentials exist in process memory only, confirmed destroyed after
- Distributed fleet — any machine with git + Python + claude CLI is an execution node
- Bridge — 5-channel fallback (Telegram → Email → Discord → Slack → SMS), never silent
- Forge — shadow benchmarks, A/B testing, 5-win promotion, self-improving templates

Full origin story and design philosophy: [wiki/decisions/decision-system-philosophy.md](wiki/decisions/decision-system-philosophy.md)

---

## How It Was Built

**Knowledge first, code second.** Before a line of code was written, 9 external reviews were commissioned (Gemini × 4, Claude Opus × 5) to stress-test the architecture. Every finding is compiled into the wiki. The next session reads a 5-minute summary instead of re-discovering the same issues.

**Key tools and technologies:**

| Layer | Technology |
|-------|-----------|
| Core orchestration | TypeScript + Node.js (async I/O, MCP SDK native) |
| Clone execution | Python 3.9+ (AI/ML ecosystem, subprocess control) |
| Memory | MemPalace MCP server (96.6% LongMemEval, AAAK compression) |
| Context packing | Repomix (70% token reduction) |
| Execution isolation | git worktrees (parallel, sandboxed) |
| Credentials | JIT injection — process memory only, try/finally lifecycle |
| Routing | ComplexityClassifier (regex — zero latency, zero cost) |
| Bridge | Telegram primary + Email/Discord/Slack/SMS fallbacks |
| Knowledge | This wiki (Karpathy LLM Wiki pattern) |

---

## What's Next

| Stage | What |
|-------|------|
| **This week** | Phase 0: fix 8 compile errors. Phase 1-2: dispatcher paths + credential MVP |
| **First loop** | `triggerFullPipeline()` auto-writes to inbox → first end-to-end autonomous run |
| **Fleet** | Bootstrap second node, `target_node` routing, fleet health droid |
| **Forge** | Shadow runner → evaluator → ratchet → self-improving templates |
| **WikiScythe** | Automated wiki maintenance — prune stale, flag contradictions |

Full build plan with exact code specs + unit tests: [wiki/decisions/plan-build-v1.md](wiki/decisions/plan-build-v1.md)

---

## Architecture in one line

> Seven specialized segments. One brain that never executes. Unlimited parallel clones across any machine. A janitor that doubts everything. A forge that makes everything better. A bridge that keeps the human in the loop.

```
Memory (The Vault)          — persists everything, zero runtime tokens
User Agent (Virtual Clone)  — always-on, guards credentials, minimal tokens
Brain (The Architect)       — plans, delegates, never executes
Clones (Special Ops)        — one mission, full context, disposable
Janitor (The Muscle)        — doubts everything, prunes, audits
Forge (Improvement Engine)  — shadows every process, ratchets quality upward
Bridge (The Output Layer)   — everything the user sees; Telegram relay; never radio silent
```

---

## Current State (as of 2026-04-07)

### What is real, working code

| Component | File | Status |
|-----------|------|--------|
| MemoryStore interface | `core/memory_store/interface.ts` | ✓ Complete — V2 with MemoryTier, writeSummary, audit |
| Keychain JIT injection | `core/keychain/manager.ts` | ✓ Logic complete — vault loading is a stub (see issues) |
| Credential leak scanner | `core/keychain/scanner.ts` | ✓ Pattern config in `config/patterns.yaml` — scanner stub |
| Complexity classifier | `core/routing/classifier.ts` | ✓ Complete — regex-based DIRECT/BRAIN_ONLY/FULL_PIPELINE |
| Janitor auditor | `core/janitor/auditor.ts` | ✓ Complete V2 — structural checks, ForgeRecord output |
| Python dispatcher | `brain/dispatcher.py` | ✓ Watch loop works — Janitor integration missing |
| Task format spec | `brain/TASK-FORMAT.md` | ✓ 6 task types documented |
| Code clone template | `templates/code-clone-TASK.md` | ✓ V2 — network scope, BLOCKED_IMPOSSIBLE, handshake |
| Keychain config | `core/keychain/config/*.yaml` | ✓ scopes, fallback, patterns, rotation |
| Bootstrap scripts | `scripts/bootstrap-linux.sh` | ✓ Installs full node in one command |
| Bootstrap scripts | `scripts/bootstrap-windows.ps1` | ✓ Windows equivalent with Task Scheduler |
| .env template | `.env.example` | ✓ All required vars documented |

### What is a stub (throws NotImplementedError)

| Component | File | What's missing |
|-----------|------|----------------|
| Vault decryption | `core/keychain/manager.ts:loadMasterVault()` | AES-256 decrypt — currently returns `{}` |
| Credential scanner | `core/keychain/manager.ts:scanForLeaks()` | Regex scan — currently returns `true` always |
| MemPalace adapter | `core/memory_store/mempalace_adapter.ts` | `writeSummary()` and `audit()` not implemented |
| Brain planner | `core/brain/planner.ts` | Sequential Thinking MCP call |
| Brain router | `core/brain/dispatcher.ts` | `getScopeKeys()` call on Keychain (method missing) |
| Prompt builder | `core/brain/prompt_builder.ts` | File reads work — template variable injection |
| Clone spawner | `core/clones/lifecycle/spawner.ts` | `git worktree add` |
| Clone runner | `core/clones/lifecycle/runner.ts` | setup.sh + Repomix + Claude launch |
| Clone teardown | `core/clones/lifecycle/teardown.ts` | Merge + worktree remove + branch prune |
| Clone worker | `core/clones/clone_worker.ts` | Orchestrates stubs above |
| WikiScythe | `core/janitor/scythe.ts` | All three operations (delete/contradiction/orphan) |
| Forge (all 4 files) | `core/forge/` | Shadow runner, evaluator, ratchet, metrics DB |
| CLI | `bin/agent4.ts` | Wires up stubs — nothing implemented yet |
| User Agent | `core/user_agent/agent.ts` | BitNet integration, state persistence |

### Known bugs (from code-audit-1)

**Compile-blocking (TypeScript won't build):**
- `clone_worker.ts` calls `keychain.provisionEnvironment()` — method doesn't exist
- `clone_worker.ts` calls `keychain.revokeEnvironment()` — method doesn't exist
- `brain/dispatcher.ts` calls `keychain.getScopeKeys()` — method doesn't exist
- `mempalace_adapter.ts` missing `writeSummary()` + `audit()` — interface not satisfied
- `MissionBrief` defined twice with incompatible shapes (manager.ts vs planner.ts)

**Security (must fix before any real credentials):**
- `loadMasterVault()` returns `{}` — all credentials fail
- `scanForLeaks()` returns `true` — scanner is off

**Structural:**
- Python dispatcher paths don't match repo structure (soul.md, state.json, templates/)
- Python dispatcher has no Janitor integration — BLOCK/SUGGEST/NOTE bypassed
- Templates exist in 3 locations, none canonical
- `TypeScript dispatcher.ts` name clashes with Python `dispatcher.py` — rename to `router.ts`

Full audit: `wiki/decisions/review-code-audit-1.md`

---

## What's Needed to Start Running

### Phase 0 — Fix compile errors (1-2 days)

These must be done before anything else compiles:

```
[ ] Delete MissionBrief from keychain/manager.ts — use brain/planner.ts version only
[ ] Add KeychainManager.provisionEnvironment(path, keys) method
[ ] Add KeychainManager.revokeEnvironment(path) method
[ ] Add KeychainManager.getScopeKeys(skill) — reads config/scopes.yaml
[ ] Add MemPalaceAdapter.writeSummary() — store InteractionDigest
[ ] Add MemPalaceAdapter.audit() — return AuditReport
[ ] Fix MemPalaceAdapter.readContext(tier: MemoryTier) — use enum not raw string
[ ] Rename core/brain/dispatcher.ts → core/brain/router.ts (avoid Python name clash)
```

### Phase 1 — Minimal working dispatcher (1 week)

The Python dispatcher is the only thing that actually runs. Make it complete:

```
[ ] Fix AGENT_BASE_DIR env var to point to actual repo root
[ ] Fix SOUL_MD path: wiki/Soul.md (not user-agent/profile/soul.md)
[ ] Fix USER_STATE path: state/user_agent/state.json
[ ] Fix TEMPLATES path: core/clones/templates/ (after consolidating)
[ ] Consolidate templates: move templates/code-clone-TASK.md → core/clones/templates/code_task.md
[ ] Add Janitor integration to dispatcher.py:
      - Parse handshake JSON from clone stdout
      - Call janitor_evaluate(handshake, retry_count)
      - BLOCK → move to failed/, optionally re-queue
      - SUGGEST → re-queue with janitor_feedback appended to objective
      - NOTE → move to completed/, write ForgeRecord
[ ] Export MAX_RETRIES=3 constant (shared between Janitor and dispatcher)
```

### Phase 2 — Credential system (1 week)

```
[ ] Implement loadMasterVault() — read from state/keychain/vault.enc
    Minimum MVP: AES-256 with password from env var (not full Argon2id yet)
[ ] Implement scanForLeaks() — regex scan using config/patterns.yaml
[ ] Test: provision a clone with a real ANTHROPIC_API_KEY, verify it runs
[ ] Test: scanForLeaks catches a hardcoded key in test output
```

### Phase 3 — Clone lifecycle (1-2 weeks)

```
[ ] Implement CloneSpawner.createWorktree():
      git worktree add state/worktrees/<id> -b clone/<id>
[ ] Implement CloneRunner.runSetup(): exec setup.sh in worktree
[ ] Implement CloneRunner.runRepomix(): npx repomix in worktree
[ ] Implement CloneRunner.launchClause(): spawn claude --print -p <prompt>
[ ] Implement CloneTeardown.mergeWorktree(): git add -A + commit + merge to main
[ ] Implement CloneTeardown.removeWorktree(): git worktree remove --force
[ ] Wire CloneWorker.execute() end-to-end — full lifecycle test
```

### Phase 4 — Brain planning (1-2 weeks)

```
[ ] Implement BrainPlanner.plan() — Sequential Thinking MCP call
[ ] Implement PromptBuilder.build() — template variable injection
[ ] Implement BrainRouter.dispatch() — reads scopes.yaml, selects template
[ ] Wire Brain → CloneWorker end-to-end: plan → dispatch → execute
```

### Phase 5 — Fleet (when Phase 3 is stable)

```
[ ] Bootstrap a second node using scripts/bootstrap-linux.sh
[ ] Add target_node field to Task schema
[ ] Add node filtering to dispatcher.py (skip tasks for other nodes)
[ ] Implement fleet health droid: brain/fleet_health_droid.py
[ ] Test: dispatch code task to KEVIN, gui task to MIKE
```

---

## Quick Start (what you can run today)

```bash
# 1. Bootstrap this machine
bash scripts/bootstrap-linux.sh --node-type code
# or on Windows: .\scripts\bootstrap-windows.ps1 -NodeType code

# 2. Fill in credentials
cp .env.example .env
nano .env  # ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, AGENT_BASE_DIR

# 3. Authenticate claude
claude auth

# 4. Start the dispatcher (watch mode)
source venv/bin/activate
python brain/dispatcher.py watch

# 5. Drop a task file into brain/inbox/ to trigger a clone
cat > brain/inbox/test-001.json << 'EOF'
{
  "id": "test-001",
  "type": "clone",
  "skill": "code",
  "objective": "Create a hello.py that prints hello world and run it",
  "source": "manual",
  "priority": 3,
  "required_keys": [],
  "wiki_pages": [],
  "constraints": ["only create files in /tmp/test-001/"],
  "timeout_minutes": 10
}
EOF

# 6. Watch it run
python brain/dispatcher.py status
```

---

## Repository Structure

```
Agent4wiki/
│
├── .gitignore              ← State Vault boundary (state/** blocked)
├── .env.example            ← Key template (Telegram, AI APIs, Keychain, MemPalace)
├── package.json            ← TypeScript + @anthropic-ai/sdk + @modelcontextprotocol/sdk
├── tsconfig.json
├── requirements.txt        ← Python: zero required deps for core; optional per node type
│
├── scripts/
│   ├── bootstrap-linux.sh  ← One-command Linux/Mac/Kali node setup
│   └── bootstrap-windows.ps1 ← One-command Windows node setup
│
├── bin/
│   └── agent4.ts           ← CLI: start | status | audit (stub)
│
├── core/                   ← TypeScript Engine (committed, immutable logic)
│   ├── memory_store/       ← Phase 1: MemoryStore interface + MemPalace adapter
│   ├── keychain/           ← Phase 2: JIT credential injection + config YAMLs
│   │   └── config/         ← scopes.yaml · fallback.yaml · patterns.yaml · rotation.yaml
│   ├── routing/            ← Phase 3: ComplexityClassifier (DIRECT/BRAIN_ONLY/FULL_PIPELINE)
│   ├── user_agent/         ← Phase 3: UserAgent orchestrator
│   ├── brain/              ← Phase 4: planner · router · prompt_builder
│   ├── clones/             ← Phase 5: clone_worker · lifecycle/{spawner,runner,teardown}
│   │   └── templates/      ← Mission Brief templates
│   ├── janitor/            ← Phase 6: Janitor auditor V2 · WikiScythe
│   └── forge/              ← Phase 7: shadow_runner · evaluator · ratchet · metrics_db
│
├── brain/                  ← Python dispatcher (the only thing running today)
│   ├── dispatcher.py       ← Watch daemon: inbox/ → execute → Janitor → result
│   └── TASK-FORMAT.md      ← Task JSON spec (6 task types)
│
├── templates/              ← Mission Brief templates (consolidate to core/clones/templates/ — TODO)
│   └── code-clone-TASK.md  ← Master Code Clone Template V2
│
├── state/                  ← Runtime Vault (fully gitignored via state/**)
│   ├── keychain/           ← Encrypted credential vaults
│   ├── memory/             ← Local vector DB + forge_metrics.db
│   ├── user_agent/         ← Compressed context (state.json, soul-private.md)
│   ├── worktrees/          ← Clone execution sandboxes (temporary, auto-cleaned)
│   └── fleet/              ← Node registry + heartbeat files
│
├── events/                 ← Event streams (events/*.jsonl gitignored)
├── forge/                  ← Forge output (forge/events.jsonl gitignored)
├── raw/                    ← Immutable source documents (never edit, only append)
│
└── wiki/                   ← The Brain's OS (fully committed — 52 pages)
    ├── CLAUDE.md           ← Wiki schema, wikilink convention, tiering, token budget
    ├── Soul.md             ← Agent identity: voice, values, delegation style
    ├── index.md            ← Master catalog
    ├── log.md              ← Append-only operation record
    ├── segments/           ← 7 segment pages
    ├── concepts/           ← 15 concept pages (incl. distributed clones, node setup)
    ├── tools/              ← 8 tool pages
    ├── entities/           ← 2 entity pages
    └── decisions/          ← 20 decision + review + audit pages
```

---

## Key Design Principles

**Hard rules:**
- Brain plans. It never executes. ([decision-brain-never-executes](wiki/decisions/decision-brain-never-executes.md))
- Janitor is reactive. Forge is proactive. Janitor can veto Forge promotions.
- TypeScript for the Core Orchestrator. Python for Clones + dispatcher + tooling.
- Credentials never touch disk. JIT spawn injection, revoked via try/finally.
- ALL user-facing output goes through The Bridge (Telegram). Console is invisible.
- Any machine with git + claude CLI + Python 3.9 can be a clone execution node.

**The production pipeline:**
```
User message (Telegram)
  → ComplexityClassifier (DIRECT / BRAIN_ONLY / FULL_PIPELINE)
  → Brain: Sequential Thinking MCP → MissionBrief
  → PromptBuilder: Soul + wiki context + task injected into template
  → Keychain: JIT credentials provisioned for this skill scope
  → Clone: isolated git worktree, runs to completion, outputs JSON handshake
  → Janitor: evaluates handshake → BLOCK / SUGGEST / NOTE
      BLOCK  → Brain re-plans or escalates to human
      SUGGEST → clone retries with Janitor feedback appended (max 3x)
      NOTE   → merge worktree → ForgeRecord written → Bridge delivers result
  → Bridge: result delivered via Telegram reply tool
```

---

## Quick Navigation

| Type | Pages |
|------|-------|
| **Segments** | [Memory](wiki/segments/segment-memory.md) · [User Agent](wiki/segments/segment-user-agent.md) · [Brain](wiki/segments/segment-brain.md) · [Clones](wiki/segments/segment-clones.md) · [Janitor](wiki/segments/segment-janitor.md) · [Forge](wiki/segments/segment-forge.md) · [Bridge](wiki/segments/segment-bridge.md) |
| **Setup** | [Node Setup Guide](wiki/concepts/concept-node-setup.md) · [Distributed Clones](wiki/concepts/concept-distributed-clones.md) |
| **Audit** | [Code Audit 1](wiki/decisions/review-code-audit-1.md) — 6 critical bugs, fix order |
| **Decisions** | [Seven Segments](wiki/decisions/decision-seven-segments.md) · [Brain Never Executes](wiki/decisions/decision-brain-never-executes.md) · [TypeScript + Python](wiki/decisions/decision-typescript-python.md) · [Directory Scaffold](wiki/decisions/decision-directory-scaffold.md) |
| **Why / How** | [decision-system-philosophy.md](wiki/decisions/decision-system-philosophy.md) — origin story, design decisions, roadmap |
| **Build plan** | [plan-build-v1.md](wiki/decisions/plan-build-v1.md) — Phase 0-4 with exact code + unit tests |
| **All pages** | [wiki/index.md](wiki/index.md) — 56 pages total |

---

*56 pages · last updated 2026-04-08 · sources: 8 repos/articles + 1 architecture session + 9 external reviews + 2 build plans + 1 research PDF + 1 multi-channel bridge*
