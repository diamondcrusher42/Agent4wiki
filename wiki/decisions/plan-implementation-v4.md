# Implementation Plan — V4

> Source: `raw/implementation-plan-v4.md` | Created: 2026-04-07
> Status: Draft — awaiting review

---

## Guiding Principles

1. Build in dependency order — no phase starts until its prerequisites are solid
2. [[tool-keychain-agent]] before any multi-agent work — security is not optional
3. Start with manually curated [[concept-clone-skill-templates|templates]] — don't wait for [[segment-forge]]
4. Every clone runs in a locked worktree — filesystem scope enforced from day one (see [[concept-git-worktrees]])
5. Solve quality grading per skill type before building the Forge
6. **The Forge is Phase 7** — not Day 1
7. **[[segment-brain]] = cloud API. Everything else = local wherever possible**

---

## Phase 1 — Foundation: Memory + Wiki Schema

**Blocks:** Everything. Do this first.

### Key deliverables
- `memory/raw/`, `memory/wiki/`, `memory/palace/` structure
- [[tool-mempalace]] installed, MCP server running
- **`MemoryStore` interface abstraction** — nothing calls MemPalace directly
  - ⚠️ Design with **async-first signatures** — if MemPalace is swapped for a cloud vector DB, retrieval latency could block the execution thread; the Phase 3 RTT classifier must account for this (see [[review-gemini-review3]])
- L0/L1/L2/L3 loading tiers tested, wake-up cost ≤ 170 tokens verified ([[concept-aaak-compression]])
- CLAUDE.md wiki conventions locked

### Success criteria
- Brain starts from `/new` and reconstructs last session's intent in < 5 messages
- If MemPalace is swapped for a stub, nothing outside `memory/` breaks

### Addresses
- MemPalace single external dep → [[review-architecture-audit]]
- Async latency contract → [[review-gemini-review3]]

---

## Phase 2 — Security: Keychain Agent MVP

**Blocks:** All multi-agent work. No credentials until this exists.

### Key deliverables
- AES-256-GCM vault, Argon2id KDF, all .env files migrated in
- Scoped injection: agents request capability, get token — never raw .env
- Leak scanner on all clone outputs before commit
- **Worktree `allowedPaths` enforcement** — every clone locked to its own directory
- Kids bot isolation: `--isolated` flag + separate MemPalace wing

### MVP scope: vault + scoped injection + leak scan only. Droids deferred to Phase 6.

### Success criteria
- No agent accesses a credential it didn't explicitly request
- Clone cannot read outside its own worktree directory

### Addresses
- Keychain Agent vaporware → [[review-architecture-audit]]
- Filesystem scope attack vector → [[review-gemini-review1]]

---

## Phase 3 — User Agent

**Blocks:** Brain (needs state.json) and Clones (need credential routing).

### Key deliverables
- `user/state.json`, `user/profile.md`, `user/soul.md` (via AI Personal OS onboarding)
- Summary Pipeline operational: every interaction → structured digest ([[concept-summary-pipeline]])
- **Complexity classifier at entry**: Direct / Brain-only / Full pipeline routing ([[concept-token-economics]])
  - ⚠️ MVP classifier = **heuristics/regex only** — do NOT use an LLM (adds latency back in). Keywords like `"search"`, `"summarize"`, `"run"`, `"fetch"` → Brain; otherwise → direct (see [[review-gemini-review3]])
- User Agent runs as BitNet 2B daemon — near-zero energy, never resets

### Success criteria
- User Agent state survives 10 `/new` sessions without losing open tasks
- Simple query never wakes the Brain
- State object stays ≤ 500 tokens

### Addresses
- RTT latency on simple tasks → [[review-gemini-review1]]
- Soul.md frozen at onboarding → quarterly refresh added to Janitor schedule

---

## Phase 4 — Brain + Clone Infrastructure

**Blocks:** Clones (need brief templates and worktree tooling).

### Key deliverables
- `brain/registry.json`, `brain/plan.json`
- **Manual mission brief templates** for all 8 skill types (code, docs, research, devops, qa, health, accounting, telegram) — `brain/templates/{skill}.md`
- Git worktree creation extended with `allowedPaths` from Phase 2
- **Worktree teardown script** — create and cleanup are a pair; Janitor approval triggers teardown signal → worktree archived to `clones/archive/` or deleted. Orphaned directories fill disk fast (see [[review-gemini-review3]])
- **Inter-agent event protocol** — JSON-lines event log per channel (`events/brain-to-clones.jsonl`, `janitor-alerts.jsonl`, `clone-completions.jsonl`, `droid-alerts.jsonl`). Single writer per channel. See [[concept-inter-agent-protocol]]
- **`brain/dispatcher.py`** — lightweight Python script (~50 lines) watches `events/` directory, launches Brain/Clone sessions from task files and droid alerts. Missing glue between always-on and session-based components. See [[concept-dispatcher]]
- **Single-writer rule enforced**: only Brain writes to `wiki/index.md`, only User Agent writes to `user/state.json`, clones write only to `clones/results/{clone-id}/`
- TASK.md format finalized: objective, context pages, constraints, output format, success criteria, credential capabilities
- Soul.md auto-injected into every TASK.md
- Brain session startup sequence validated: `/new` → index.md → state.json → AAAK wake-up → plan

### Success criteria
- Brain dispatches a clone that produces a working result without clarifying questions
- Brain startup cost ≤ 500 tokens including full wake-up

### Addresses
- Mission brief as critical path → [[review-architecture-audit]] #11
- Brain starts fresh = wiki quality → wiki must be current before every session
- Inter-agent communication undefined → [[review-opus-review1]]
- Dispatcher (Brain launcher) missing → [[review-opus-review1]]
- Concurrency / single-writer rule → [[review-opus-review1]]

---

## Phase 5 — Clones + Forge V0.1

**Blocks:** Janitor (needs execution history to audit). Full Forge (needs massive history + grading system).

### Key deliverables
- Clone lifecycle: create → inject → launch → execute → commit → signal → cleanup
- All 8 skill types operational
- Model tiering enforced:
  - Cloud Sonnet: code, docs, research, accounting, telegram
  - GPU Nemotron: sensitive data
  - CPU BitNet 2B: formatting/linting QA only — not evaluation
- Clone output: structured result + decision log + wiki atomization candidates
- Atomize pass: output → Zettelkasten notes → Soul.md voice → Memory
- **A/B template tracking**: 2 variants per skill, track first-pass acceptance rate
- **Forge V0.1 — benchmarking script** (runs in parallel with clone buildout):
  - Define 5-10 representative task types
  - Cascade: Sonnet baseline → Haiku → Ollama local (up to 70B) → BitNet 2B → Opus
  - Grading: unit tests → Sonnet-as-judge → human review
  - Output: `forge/capabilities/map.json` (model routing matrix)
  - See [[plan-forge-v01-benchmarking]]

### Success criteria
- Code clone diff passes QA review ≥ 70% first attempt
- Research clone produces wiki-ready summary without Brain revision
- All outputs pass leak scanner before commit

### Addresses
- Context extraction failures → context pre-loaded in TASK.md, not assembled by RAG
- BitNet too weak for eval → only used for formatting in QA clone

---

## Phase 6 — Janitor

**Blocks:** Forge (needs clean execution data).

### Key deliverables
- **Directive tiers**: BLOCK (re-delegate, must specify exact fix) / SUGGEST (accept + flag) / NOTE (log only)
- **Circuit breaker**: same mission fails 3× → escalate to user, no more retries
- **Rejection specificity rule**: BLOCK requires exact reason + what new brief must change — vague = auto-downgrade to SUGGEST
- Weekly full audit + triggered after major changes
- Keychain droids deployed (deferred from Phase 2): credential-expiry, leak-watch, service-health, rate-limit, telegram-heartbeat, private-info-scan
- Quality grading system designed (data now exists from Phase 5)
- Health score 0-25 dashboard

### Success criteria
- No ping-pong deadlock in 20 consecutive test missions
- Circuit breaker fires correctly on 3rd identical rejection
- Wiki contradiction planted in test caught within one audit pass

### Addresses
- Ping-Pong Deadlock → [[review-gemini-review1]]
- Quality grading unsolved → [[review-architecture-audit]] #3

---

## Phase 7 — The Forge

**Prerequisite: Phases 1-6 stable + ≥100 clone missions logged + quality grading system from Phase 6.**

### Key deliverables
- Shadow infrastructure: parallel worktree per production process, both graded
- Brief A/B promotion: 5 consecutive wins → promote, archive loser with scores
- Error pattern database + prediction models
- Tool building loop: manual patterns → scripts → skills → clone specializations
- Capability map: `forge/capabilities/map.json`
- Predictive diagnostics: rate limits, credential expiry, disk trends
- Self-improvement meta-loop

### Success criteria
- One production process replaced by Forge-promoted shadow within 30 days of launch
- Error prediction accuracy ≥ 60%
- At least one new tool built from detected manual patterns

### Addresses
- Forge as pure theory → [[review-architecture-audit]] #2
- Quality grading unsolved → grading system designed in Phase 6, used here

---

## Dependency Map

```
Phase 1: Memory (MemPalace interface + wiki schema)
    ↓
Phase 2: Keychain Agent MVP
    ↓
Phase 3: User Agent (state + summary pipeline + routing)
    ↓
Phase 4: Brain + Clone Infrastructure (templates + worktrees)
    ↓
Phase 5: Clones (all 8 skills + A/B tracking)
    ↓
Phase 6: Janitor (circuit breakers + quality grading)
    ↓
Phase 7: Forge (shadow benchmarking + self-improvement)
```

---

## Deferred (do not build yet)

| Item | Reason |
|------|--------|
| Forge improvement loops | Needs Phase 5 execution history |
| Keychain droids (6x) | MVP enough for Phase 2, droids in Phase 6 |
| last30days TikTok/Instagram | API reliability too low |
| Claude Code runtime abstraction | Important, not blocking Phase 1-5 |
| GPU job queue | Add when GPU contention actually observed |
| Soul.md drift detection | Phase 6 Janitor handles this |

---

## Immediate next actions

1. Create `memory/` directory structure
2. Install MemPalace, verify MCP server
3. Define `MemoryStore` interface abstraction
4. Begin Keychain Agent MVP (vault + scoped injection + leak scan)
5. Migrate all .env files into vault once it's running

---

*See also: [[review-architecture-audit]], [[review-gemini-review1]], [[decision-six-segments]], [[decision-brain-never-executes]], [[decision-forge-independence]]*
