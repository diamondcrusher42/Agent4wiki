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

**Model governance:** Claude Sonnet 4.6 is the default for all tasks in the first implementation — establishing a benchmark baseline before optimising downward (Haiku → Ollama → BitNet). The Forge drives all model transitions through A/B testing and the 5-win ratchet. See [decision-model-governance.md](wiki/decisions/decision-model-governance.md).

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

## Current State (as of 2026-04-08) — Branch: `opus-build`

**198 tests passing (156 Jest + 42 pytest). TSC clean. 0 stubs remaining.**

### Build progress

| Version | Tests | Key wins |
|---------|-------|----------|
| Phase 5-7 baseline | 84 | AES vault, MCP transport, WikiScythe, fleet routing, Forge core |
| v3 | 103 | SSH injection fix, env strip, noLeaks→BLOCK, file handshake, watchdog |
| v4 | 126 | 2-pass classifier, Janitor unified, Forge cost cap, executeDirect+Soul.md |
| v5 | 140 | Forge budget real, spawner injection blocked, wiki token cap |
| v6 | 157 | Registry format fix, OOM guard, dispatcher injection, soul TTL |
| v7 | 174 | Python vault leak fixed, git status scan, env allowlist, confidence gate |
| **v8** | **198** | Janitor unified (TS/Python), rename parsing, symlink guard, watch() threaded, execFile, config externalised, quarantine mode |

### What is implemented

| Component | File | Status |
|-----------|------|--------|
| MemoryStore | `core/memory_store/interface.ts` | ✓ V2 — MemoryTier enum, writeSummary, audit |
| AES-256-GCM Vault | `core/keychain/manager.ts` | ✓ scrypt KDF, separate salt file, exactMatchSecrets |
| Credential scanner | `core/keychain/manager.ts:scanForLeaks()` | ✓ git status --porcelain, 1MB cap, binary skip, symlink guard |
| 2-pass Classifier | `core/routing/classifier.ts` | ✓ Hardcoded DIRECT/FULL_PIPELINE → Haiku fallback |
| Janitor auditor | `core/janitor/auditor.ts` | ✓ heuristics.json, largeFilesSkipped, tests_passed===false |
| Python dispatcher | `brain/dispatcher.py` | ✓ Threaded watch(), janitor_evaluate() mirrors TS, build_clone_env() allowlist |
| Brain planner | `core/brain/planner.ts` | ✓ Anthropic singleton, 3-tier JSON parse fallback |
| Prompt builder | `core/brain/prompt_builder.ts` | ✓ findWikiPage() recursive, truncateAtLineBoundary() |
| Clone spawner | `core/clones/lifecycle/spawner.ts` | ✓ git worktree add, cloneId validation, --ignore-scripts |
| Clone runner | `core/clones/lifecycle/runner.ts` | ✓ execFileAsync array form, setup.sh + Repomix + Claude |
| Clone teardown | `core/clones/lifecycle/teardown.ts` | ✓ Quarantine mode for BLOCK (state/worktrees/quarantine/) |
| Clone worker | `core/clones/clone_worker.ts` | ✓ buildCloneEnv() allowlist (SHELL/USER included), retry loop |
| WikiScythe | `core/janitor/scythe.ts` | ✓ archive-queue.md gate, execFileSync array form |
| Forge | `core/forge/` | ✓ ShadowRunner budget cap, metrics_db, ratchet (5-win promote) |
| User Agent | `core/user_agent/agent.ts` | ✓ confidence gate, routeToBrain wiki context, truncateHistory |
| Shared config | `core/config/clone_config.json` | ✓ maxRetries, timeoutMs, confidenceGateThreshold, brainWikiPages |
| Watchdog | `core/clones/watchdog.ts` | ✓ stale worktree cleanup |

### Known TODOs (next review cycle)

- Docker/real sandbox isolation (`--dangerously-skip-permissions` still active)
- data-scrubbing before `events.jsonl` writes (PII in Forge logs)
- `extract_handshake()` regex false-positive for handshake-shaped code in clone output
- Full clone lifecycle integration test (no mocks)
- `dispatcher.py` monolith decomposition
- ts-node CLI for Janitor (Option A deferred — Option B works)
- Conversation history not persisted across restarts

Full audit trail: `wiki/decisions/` — 8 Opus reviews + 8 Gemini reviews + 8 build plans

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
└── wiki/                   ← The Brain's OS (fully committed — 63 pages)
    ├── CLAUDE.md           ← Wiki schema, wikilink convention, tiering, token budget
    ├── Soul.md             ← Agent identity: voice, values, delegation style
    ├── index.md            ← Master catalog
    ├── log.md              ← Append-only operation record
    ├── segments/           ← 7 segment pages
    ├── concepts/           ← 18 concept pages (incl. clone lifecycle, routing classifier)
    ├── tools/              ← 8 tool pages
    ├── entities/           ← 2 entity pages
    └── decisions/          ← 28 decision + review + audit pages
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
| **Latest build plan** | [plan-build-v8.md](wiki/decisions/plan-build-v8.md) — Janitor unification, watch concurrency, quarantine mode |
| **Build history** | [build-state-2026-04-08-v8.md](wiki/decisions/build-state-2026-04-08-v8.md) — 198 tests, all wins |
| **Opus brief** | [raw/opus-build-brief.md](raw/opus-build-brief.md) — full handoff: 7 segments, decisions, model governance, DoD |
| **All pages** | [wiki/index.md](wiki/index.md) — 100 pages total |

---

*100 pages · last updated 2026-04-08 · sources: 8 repos/articles + 1 architecture session + 16 external reviews (Opus ×8, Gemini ×8) + 8 build plans + 1 research PDF + 1 multi-channel bridge + benchmark results*
