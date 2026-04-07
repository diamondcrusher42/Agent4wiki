# Agent4wiki

**Agent V4 Architecture — Living Knowledge Base + Implementation**

A Karpathy-pattern wiki mapping the full architecture of the next agent build, with TypeScript implementation stubs and Python orchestration committed alongside the knowledge.

> This is a compiled artifact, not a document dump. Knowledge is ingested once, structured, and compounds over time.

---

## Architecture in one line

> Seven specialized segments. One brain that never executes. Unlimited parallel clones. A janitor that doubts everything. A forge that makes everything better. A bridge that keeps the human in the loop.

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

## Implementation Status

| Phase | Segment | Code | Status |
|-------|---------|------|--------|
| 1 | Memory | `core/memory_store/interface.ts` | ✓ Complete |
| 2 | Keychain | `core/keychain/manager.ts` + `config/*.yaml` | ✓ Complete |
| 3 | Routing + User Agent | `core/routing/classifier.ts` · `core/user_agent/agent.ts` | ✓ Complete |
| 4 | Brain | `core/brain/{planner,dispatcher,prompt_builder}.ts` · `brain/dispatcher.py` | Stubs + Python MVP |
| 5 | Clones | `core/clones/lifecycle/` · `core/clones/clone_worker.ts` | Stubs |
| 6 | Janitor | `core/janitor/auditor.ts` · `core/janitor/scythe.ts` | ✓ Complete (V2) |
| 7 | Forge | `core/forge/{shadow_runner,evaluator,ratchet,metrics_db}.ts` | Stubs (deferred) |

---

## Repository Structure

```
Agent4wiki/
│
├── .gitignore              ← State Vault boundary (state/** blocked)
├── .env.example            ← Key template (Telegram, AI APIs, Keychain, MemPalace)
├── package.json            ← TypeScript + @anthropic-ai/sdk + @modelcontextprotocol/sdk
├── tsconfig.json
│
├── bin/
│   └── agent4.ts           ← CLI: start | status | audit
│
├── core/                   ← TypeScript Engine (committed, immutable logic)
│   ├── memory_store/       ← Phase 1: MemoryStore interface + MemPalace adapter
│   ├── keychain/           ← Phase 2: JIT credential injection + config YAMLs
│   │   └── config/         ← scopes.yaml · fallback.yaml · patterns.yaml · rotation.yaml
│   ├── routing/            ← Phase 3: ComplexityClassifier (DIRECT/BRAIN_ONLY/FULL_PIPELINE)
│   ├── user_agent/         ← Phase 3: UserAgent orchestrator
│   ├── brain/              ← Phase 4: planner · dispatcher · prompt_builder
│   ├── clones/             ← Phase 5: clone_worker · lifecycle/{spawner,runner,teardown}
│   │   └── templates/      ← Mission Brief templates (migrate from /templates/ in Phase 5)
│   ├── janitor/            ← Phase 6: Janitor auditor (V2) · WikiScythe
│   └── forge/              ← Phase 7: shadow_runner · evaluator · ratchet · metrics_db
│
├── brain/                  ← Python dispatcher infrastructure (Phase 4 MVP)
│   ├── dispatcher.py       ← Watch daemon: inbox/ → execute → keychain → launch
│   └── TASK-FORMAT.md      ← Task JSON spec (6 task types)
│
├── templates/              ← Mission Brief templates (root; migrate to core/clones/templates/ in Phase 5)
│   └── code-clone-TASK.md  ← Master Code Clone Template V2
│
├── state/                  ← Runtime Vault (fully gitignored via state/**)
│   ├── keychain/           ← Encrypted credential vaults
│   ├── memory/             ← Local vector DB + forge_metrics.db
│   ├── user_agent/         ← Compressed context (state.json, soul-private.md)
│   └── worktrees/          ← Clone execution sandboxes (temporary, auto-cleaned)
│
├── events/                 ← Event streams (events/*.jsonl gitignored)
├── forge/                  ← Forge output (forge/events.jsonl gitignored)
│
├── raw/                    ← Immutable source documents (never edit, only append)
│
└── wiki/                   ← The Brain's OS (fully committed)
    ├── CLAUDE.md           ← Wiki schema, wikilink convention, tiering, token budget
    ├── Soul.md             ← Agent identity: voice, values, delegation style
    ├── index.md            ← Master catalog (49 pages)
    ├── log.md              ← Append-only operation record
    ├── segments/           ← 7 segment pages
    ├── concepts/           ← 13 concept pages
    ├── tools/              ← 8 tool pages
    ├── entities/           ← 2 entity pages
    └── decisions/          ← 19 decision + review pages
```

---

## Quick Navigation

| Type | Pages |
|------|-------|
| **Segments** | [Memory](wiki/segments/segment-memory.md) · [User Agent](wiki/segments/segment-user-agent.md) · [Brain](wiki/segments/segment-brain.md) · [Clones](wiki/segments/segment-clones.md) · [Janitor](wiki/segments/segment-janitor.md) · [Forge](wiki/segments/segment-forge.md) · [Bridge](wiki/segments/segment-bridge.md) |
| **Concepts** | [Token Economics](wiki/concepts/concept-token-economics.md) · [Mission Briefs](wiki/concepts/concept-mission-briefs.md) · [Shadow Benchmarking](wiki/concepts/concept-shadow-benchmarking.md) · [AAAK Compression](wiki/concepts/concept-aaak-compression.md) · [Git Worktrees](wiki/concepts/concept-git-worktrees.md) · [Soul.md](wiki/concepts/concept-soul-md.md) · [Wiki Pattern](wiki/concepts/concept-wiki-pattern.md) · [Clone Skill Templates](wiki/concepts/concept-clone-skill-templates.md) · [Fallback Chains](wiki/concepts/concept-fallback-chains.md) · [Summary Pipeline](wiki/concepts/concept-summary-pipeline.md) · [Inter-Agent Protocol](wiki/concepts/concept-inter-agent-protocol.md) · [Dispatcher](wiki/concepts/concept-dispatcher.md) · [Wiki Tiering](wiki/concepts/concept-wiki-tiering.md) |
| **Tools** | [MemPalace](wiki/tools/tool-mempalace.md) · [LLM Wiki](wiki/tools/tool-llm-wiki.md) · [BitNet](wiki/tools/tool-bitnet.md) · [Keychain Agent](wiki/tools/tool-keychain-agent.md) · [last30days](wiki/tools/tool-last30days.md) · [hstack](wiki/tools/tool-hstack.md) · [AI Personal OS](wiki/tools/tool-ai-personal-os.md) · [MCP Protocol](wiki/tools/tool-mcp-protocol.md) |
| **Entities** | [Hardware](wiki/entities/entity-hardware.md) · [Telegram Bots](wiki/entities/entity-telegram-bots.md) |
| **Decisions** | [Seven Segments](wiki/decisions/decision-seven-segments.md) · [Brain Never Executes](wiki/decisions/decision-brain-never-executes.md) · [Forge Independence](wiki/decisions/decision-forge-independence.md) · [TypeScript + Python](wiki/decisions/decision-typescript-python.md) · [Directory Scaffold](wiki/decisions/decision-directory-scaffold.md) |
| **Reviews** | [Gemini 1-6](wiki/decisions/) · [Opus 1-4](wiki/decisions/) · [PDF Ecosystem](wiki/decisions/review-pdf-agentic-ecosystem.md) |

---

## Key Design Principles

**Separation of concerns — hard rules:**
- Brain plans. It never executes. ([decision-brain-never-executes](wiki/decisions/decision-brain-never-executes.md))
- Janitor is reactive. Forge is proactive. Janitor can veto Forge promotions.
- TypeScript for the Core Orchestrator. Python for specialized Clones + tooling. ([decision-typescript-python](wiki/decisions/decision-typescript-python.md))
- Credentials never touch disk. JIT spawn injection, revoked on exit via try/finally.
- ALL user-facing output goes through The Bridge (Telegram). Console is invisible.

**The production pipeline:**
```
User message
  → ComplexityClassifier (DIRECT / BRAIN_ONLY / FULL_PIPELINE)
  → Brain: Sequential Thinking → Mission Brief
  → PromptBuilder: Soul + wiki context + task injected
  → Keychain: JIT credentials provisioned
  → Clone: isolated worktree, full context, runs to completion
  → Janitor: BLOCK / SUGGEST / NOTE  (circuit breaker: 3 retries max)
  → NOTE: merge + ForgeRecord written to forge/events.jsonl
  → Bridge: result delivered to Telegram
```

---

## How to use this wiki

**Ingest a new source:**
Copy raw document to `raw/`, create or update pages in `wiki/`, add to `wiki/index.md`, append to `wiki/log.md`.

**Query:**
Read `wiki/index.md` → follow wikilinks to relevant pages → synthesize. Good answers can be filed back as new pages.

**Lint:**
Check for contradictions, stale claims, orphan pages, missing cross-references. The Janitor segment owns this.

**Run the CLI (when Phase 5 is complete):**
```bash
cp .env.example .env  # fill in your keys
npm install
npx ts-node bin/agent4.ts start
```

See `wiki/CLAUDE.md` for full schema and conventions.

---

*49 pages · last updated 2026-04-07 · sources: 8 repos/articles + 1 architecture session + 9 external reviews + 1 implementation plan + 1 research PDF*
