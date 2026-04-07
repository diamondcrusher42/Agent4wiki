# V4 Implementation Plan

> Created: 2026-04-07
> Based on: Agent V4 architecture spec + architecture audit + Gemini external review
> Status: Draft — awaiting Jure review

---

## Guiding Principles

1. Build in dependency order — no phase starts until its prerequisites are solid
2. Keychain Agent before any multi-agent work — security is not optional
3. Start with manually curated templates — don't wait for the Forge to improve them
4. Every clone runs in a locked worktree — filesystem scope enforced from day one
5. Solve quality grading per skill type before building the Forge
6. The Forge is Phase 7 — not Day 1, not Phase 2
7. Brain = cloud API. Everything else = local wherever possible

---

## Phase 1 — Foundation: Memory + Wiki Schema

**Goal:** A working, queryable knowledge base that survives session restarts. Everything the Brain needs to start fresh and reconstruct intent.

### Deliverables

- [ ] Directory structure: `memory/raw/`, `memory/wiki/`, `memory/palace/`
- [ ] Wiki schema finalized (CLAUDE.md conventions locked — file naming, wikilinks, page structure)
- [ ] `memory/wiki/index.md` and `memory/wiki/log.md` operational
- [ ] MemPalace installed and tested: `pip install mempalace`, verify MCP server starts
- [ ] **Interface abstraction layer**: define `MemoryStore` interface (read, write, search, list) — MemPalace implements it, nothing calls MemPalace directly
- [ ] L0/L1/L2/L3 loading tiers tested: wake-up cost ≤ 170 tokens verified
- [ ] AAAK compression verified: test 1000-token input → ~120 token output with zero info loss

### Success Criteria
- Brain can start from `/new`, load index.md, pull state.json, and reconstruct last session's intent in < 5 messages
- If MemPalace is replaced with a stub, nothing outside `memory/` breaks

### Risks addressed
- MemPalace single external dep → interface layer decouples it
- raw/ currently empty → seed with architecture spec + all review files

---

## Phase 2 — Security: Keychain Agent MVP

**Goal:** Scoped credential injection working before any agent touches a real credential. This is the gate for all multi-agent work.

### Deliverables

- [ ] Vault: AES-256-GCM encryption, Argon2id KDF, all .env files migrated in
- [ ] Scoped injection: agents request `capability:telegram-send`, get token — never get raw .env
- [ ] Leak scanner: regex patterns for API keys, tokens, IBANs, Slovenian IDs — runs on every clone output before it's committed
- [ ] **MVP scope only**: vault + scoped injection + leak scan. Skip six droids and rotation scheduler for now.
- [ ] Worktree isolation enforced: every clone launch sets `allowedPaths` to its own worktree dir only — no `~/` access
- [ ] Kids bot flag: `--isolated` enforced, separate MemPalace wing, zero admin credential scope

### Success Criteria
- No agent can access a credential it didn't explicitly request
- A clone running a bad prompt cannot read `~/.claude/settings.json` or any file outside its worktree
- Leak scanner catches a planted test API key in clone output

### Risks addressed
- Keychain Agent vaporware → MVP built here, droids added in Phase 6
- Filesystem scope attack → `allowedPaths` locked per worktree from this phase forward

---

## Phase 3 — User Agent

**Goal:** A persistent, minimal-token user representative that never resets and holds current state.

### Deliverables

- [ ] `user/state.json`: current priorities, mood, energy, open tasks — updated after every interaction
- [ ] `user/profile.md` + `user/soul.md`: created via AI Personal OS onboarding conversation
- [ ] `user/services.json`: all running services, ports, health status tracked
- [ ] Summary Pipeline operational: every interaction → structured digest `{timestamp, intent, entities, outcome, open_items, confidence}` — raw conversation never reaches User Agent
- [ ] **Complexity classifier**: BitNet 2B task at User Agent entry — Direct / Brain-only / Full pipeline routing
- [ ] `user/patterns.json`: intent pattern accumulation begins
- [ ] User Agent runs on BitNet 2B daemon — near-zero energy, never resets

### Success Criteria
- User Agent state survives 10 consecutive `/new` sessions without losing open tasks
- Simple query ("what's the weather?") routed Direct, never wakes Brain
- User Agent state object stays ≤ 500 tokens

### Risks addressed
- Soul.md frozen at onboarding → schedule quarterly refresh conversations, flag in Janitor audit
- RTT latency → complexity classifier at entry point prevents full pipeline for simple tasks

---

## Phase 4 — Brain + Clone Infrastructure

**Goal:** The Brain can plan, create mission briefs, and dispatch clones into isolated git worktrees.

### Deliverables

- [ ] `brain/registry.json`: all repos, files, purposes, last modifier
- [ ] `brain/plan.json`: current execution plan with task dependency tree
- [ ] **Mission brief templates** (manual curation — don't wait for Forge):
  - `brain/templates/code.md`
  - `brain/templates/docs.md`
  - `brain/templates/research.md`
  - `brain/templates/devops.md`
  - `brain/templates/qa.md`
  - `brain/templates/accounting.md`
  - `brain/templates/telegram.md`
- [ ] Git worktree creation script: `tools/clone_create.sh` extended with `allowedPaths` enforcement
- [ ] TASK.md format finalized: objective, context pages, constraints, output format, success criteria, credential capabilities
- [ ] Soul.md injected into every TASK.md automatically
- [ ] Brain session startup sequence validated: `/new` → index.md → state.json → AAAK wake-up → plan

### Success Criteria
- Brain dispatches a code clone with a TASK.md and the clone produces a working diff without asking clarifying questions
- Clone worktree cannot read outside its own directory (verified by test)
- Brain session startup cost ≤ 500 tokens including full wake-up

### Risks addressed
- Mission brief as critical path → start with manually curated templates, not auto-generated
- Brain starts fresh = planning quality = wiki quality → wiki must be current before each Brain session

---

## Phase 5 — Clones

**Goal:** Specialist clones executing missions reliably, with results that feed back into Memory.

### Deliverables

- [ ] Clone lifecycle: create worktree → inject TASK.md + CLAUDE.md → launch Claude Code session → execute → commit → signal Brain → cleanup
- [ ] All 8 skill types operational: code, docs, research, devops, qa, health, accounting, telegram
- [ ] Model tiering applied:
  - Cloud (Sonnet): code, docs, research, accounting, telegram clones
  - GPU (Nemotron): sensitive data clones
  - CPU (BitNet 2B): QA, linting, formatting only — not evaluation
- [ ] Clone output format: structured result + decision log + wiki atomization candidates
- [ ] Atomize pass: clone output → atomic Zettelkasten notes → rewritten in Soul.md voice → filed in Memory
- [ ] **A/B template tracking**: 2 variants per skill type, track acceptance rate — lightweight Forge precursor

### Success Criteria
- Research clone produces a wiki-ready summary without Brain revision
- Code clone diff passes QA clone review on first attempt ≥ 70% of the time
- All clone outputs pass leak scanner before commit

### Risks addressed
- Context extraction failures → wiki pages pre-loaded in TASK.md, not assembled by RAG at runtime
- BitNet too weak for eval → QA clone uses BitNet for formatting only, Sonnet for actual review

---

## Phase 6 — Janitor

**Goal:** Scheduled adversarial auditor keeping the system healthy, with circuit breakers preventing deadlock.

### Deliverables

- [ ] Janitor runs on schedule: weekly full audit + triggered after every major change
- [ ] **Directive tiers implemented**:
  - `BLOCK`: re-delegate, mission failed — specific fix required in brief
  - `SUGGEST`: accept result + flag for improvement — does NOT re-delegate
  - `NOTE`: log only, no action required
- [ ] **Circuit breaker**: if same mission fails 3× with same Janitor rejection pattern → escalate to user, do not retry
- [ ] **Rejection specificity requirement**: BLOCK directives must include exact reason + what the new brief must change
- [ ] Audit domains active: file audits, memory/wiki audits, clone audits, security audits, system health scoring
- [ ] Keychain Agent droids (deferred from Phase 2): credential-expiry, leak-watch, service-health, rate-limit, telegram-heartbeat, private-info-scan
- [ ] Health score dashboard: 0-25 scale, tracked over time, bi-weekly ONE-action review

### Success Criteria
- Janitor detects a planted wiki contradiction within one audit pass
- No ping-pong deadlock in 20 consecutive test missions (circuit breaker fires correctly)
- Security audit catches a planted test credential in a clone output

### Risks addressed
- Ping-Pong Deadlock → BLOCK/SUGGEST/NOTE tiers + 3-retry circuit breaker
- Quality grading still informal → this phase produces enough data to design grading system for Forge

---

## Phase 7 — The Forge

**Goal:** Self-improving system that benchmarks every process and promotes winners.

**Prerequisite:** Phases 1-6 stable + sufficient execution history (minimum 100 clone missions) + quality grading system designed.

### Quality Grading System (must be designed before Forge builds)
- Code: test pass rate + diff review score (Sonnet-as-judge)
- Research: coverage score (does output answer the brief's questions?) + freshness
- Mission briefs: output acceptance rate on first Janitor pass
- Wiki pages: cross-reference completeness + contradiction-free score

### Deliverables

- [ ] Shadow infrastructure: parallel worktree per production process, same input, both graded
- [ ] Brief A/B testing: promote winning templates after 5 consecutive wins, archive losers with scores
- [ ] Error pattern database: structured log of all failures, pattern analysis
- [ ] Tool building loop: recurring manual patterns → scripts → skills → clone specializations
- [ ] Capability map: `forge/capabilities/map.json` — what can the system do today?
- [ ] Predictive diagnostics: rate limit burn rates, credential expiration trajectories, disk trends
- [ ] Self-improvement meta-loop: Forge benchmarks its own detection speed and prediction accuracy
- [ ] Dashboard: `forge/dashboard.json` — current state of all 7 improvement loops

### Success Criteria
- One production process replaced by a Forge-promoted shadow within 30 days of Forge launch
- Error prediction accuracy ≥ 60% (Forge correctly predicts a failure type before it occurs)
- At least one new tool built from detected manual patterns and promoted to production

---

## Dependency Map

```
Phase 1: Memory
    ↓
Phase 2: Keychain Agent
    ↓
Phase 3: User Agent
    ↓
Phase 4: Brain + Clone Infrastructure
    ↓
Phase 5: Clones
    ↓
Phase 6: Janitor
    ↓
Phase 7: Forge
```

No shortcuts. No skipping phases. Each phase is the foundation of the next.

---

## What NOT to build (yet)

| Item | Why deferred |
|------|-------------|
| Forge improvement loops | Needs execution history that doesn't exist yet |
| Keychain droids (6x) | MVP vault + scoped injection is enough for Phase 2 |
| last30days TikTok/Instagram | API reliability too low — build when source is stable |
| Model-agnostic interface layer (Claude Code runtime abstraction) | Important but not blocking for Phase 1-5 |
| Soul.md drift detection | Phase 6 Janitor adds this as a scheduled audit |
| GPU job queue | Add when GPU contention is actually observed, not before |

---

## Immediate Next Actions

1. **Create `memory/` directory structure** — 2 hours
2. **Install and test MemPalace** — 1 day
3. **Define MemoryStore interface** — 4 hours
4. **Begin Keychain Agent MVP** — 3-5 days
5. **Migrate all .env files into vault** — 1 day (once vault is running)

---

*This plan is a living document. Update as phases complete. File changes in wiki/log.md.*
