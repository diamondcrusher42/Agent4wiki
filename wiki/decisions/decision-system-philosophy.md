# Why We Built Agent V4

> This document captures the origin story, design philosophy, and future vision for the system. It is the answer to "why does this exist and why was it built this way?"

---

## The Problem

Every AI agent system solves the wrong problem.

Most tools (AutoGPT, CrewAI, Paperclip, LangGraph) give you agents that can *run*. What they can't give you is an agent that is *yours*: one that knows your voice, guards your credentials, learns from every session, improves its own tools, and reaches you on your phone when something finishes at 2am.

The specific problems that made existing tools unusable:

**1. They reset every session.** An agent that wakes up with zero memory is just an expensive CLI. We needed an agent that compounds — every interaction makes it smarter about this specific life, this specific work, these specific tools.

**2. They can't keep secrets.** General-purpose agent frameworks pass credentials as config files, environment variables in logs, or plaintext in context windows. None of them have a JIT (just-in-time) credential injection system where a key exists in process memory only for the duration of the task that needs it, and is confirmed destroyed afterward.

**3. They're single-machine.** A coding task and a browser automation task have fundamentally different hardware requirements. A system that can only run on one machine is artificially constrained. The fleet model — any machine with git + Python + claude CLI is an execution node — was the only architecture that solved this.

**4. Their output is invisible.** Console output is invisible from a phone. A system that executes perfectly but can't reach you is broken. The Bridge segment exists because output reliability is indistinguishable from execution reliability from the user's perspective.

**5. They don't improve.** Most agent systems execute the same way on the 100th task as they did on the 1st. The Forge segment — which runs shadow benchmarks, A/B tests prompts, and ratchets quality upward — is the answer to this.

---

## The Design Philosophy

### Compile knowledge, don't re-derive it (Karpathy LLM Wiki pattern)

Every decision, every review, every discovered failure mode goes into the wiki. The next session doesn't re-figure out that `--append-system-prompt-file` silently breaks Telegram channels — it reads the page. Knowledge compounds. This is the most important design decision in the system.

### Doubt-first architecture (The Janitor)

Every output is wrong until proven otherwise. The Janitor segment — which evaluates every clone result against structural criteria before anything merges — exists because an agent that can generate bad code fast is worse than no agent. Speed is worthless without quality gates.

### The Brain never executes

The Brain plans. The Brain delegates. The Brain never touches a file, never makes an API call, never spawns a process directly. This single rule eliminates an entire class of architectural bugs (a thinking process that is also an execution process can corrupt its own context mid-thought).

### Credentials never touch disk

JIT injection: a credential exists in process memory only. It is injected into the subprocess environment at spawn time, and the scanner confirms it is absent from all modified files at revocation time. This is not a best-practice guideline — it is an architectural invariant enforced by the Keychain's try/finally lifecycle.

### Output reliability = execution reliability

A result that doesn't reach the user might as well not exist. The Bridge segment's 5-channel cascade (Telegram → Email → Discord → Slack → SMS) and the hard rule "ALL output goes via Telegram, no exceptions" exist because three real sessions were lost to console-only output.

---

## How It Was Built

### Phase 1 — Knowledge first, code second

Before a single line of code was written, 9 external reviews were commissioned (Gemini 4 times, Claude Opus 5 times) to stress-test the architecture. Each review uncovered blind spots that would have been expensive to fix in code:

- Gemini review 1: ping-pong deadlock (Janitor rejection loops with no circuit breaker)
- Gemini review 3: async-first required for MemoryStore (cloud swap latency)
- Opus review 1: dispatcher missing — no way for droids to launch Brain sessions automatically
- Opus review 2: MissionBrief needed network scope + BLOCKED_IMPOSSIBLE status
- Gemini review 7: the exact bridge direction — TS writes, Python reads, filesystem is the API

All of this is in the wiki. Future sessions can read a 5-minute summary instead of re-discovering these issues.

### Phase 2 — Architecture locked before implementation

The key decisions were locked in wiki pages before code was written:
- `decision-typescript-python.md` — TypeScript Core, Python Clones, MCP as firewall
- `decision-brain-never-executes.md` — the single most important rule
- `decision-seven-segments.md` — why the Bridge earns segment status
- `decision-directory-scaffold.md` — canonical repo structure before scaffolding

### Phase 3 — Code audit before more code

After scaffolding the full codebase (Phases 1-7 stubs), a full code audit (`review-code-audit-1.md`) found 20 issues — 6 compile-blocking — before any implementation began. The build plan (`plan-build-v1.md`) sequences fixes by dependency order.

### Tools and Technologies

| Layer | Technology | Why |
|-------|-----------|-----|
| Core orchestration | TypeScript + Node.js | Async I/O superiority, MCP SDK native |
| Clone execution | Python 3.9+ | Native AI/ML ecosystem, MemPalace, subprocess control |
| Memory | MemPalace (MCP server) | 96.6% LongMemEval, AAAK compression, local-first |
| Context packing | Repomix | 70% token reduction via codebase summary |
| Planning | Sequential Thinking MCP | Forces reasoning before action |
| Execution isolation | git worktrees | Parallel, sandboxed, full git history |
| Credentials | JIT injection + Keychain | Try/finally lifecycle, never-on-disk invariant |
| LLM inference | Anthropic API (Sonnet default) | Routing: Haiku for classification, Sonnet for most tasks |
| Local inference | BitNet 2B / Ollama | Zero API cost for summarization, routing |
| Routing | ComplexityClassifier (regex) | Zero latency, zero cost — no LLM needed |
| Bridge primary | Telegram Bot API | Mobile-accessible, real-time, MCP plugin |
| Bridge email | AgentMail (SES) | SDK installed, tested, working |
| Bridge fallbacks | Discord + Slack webhooks | Zero deps, plain HTTP |
| Bridge last resort | Twilio SMS | 160 chars, critical only |
| Knowledge base | This wiki (Karpathy pattern) | Compiled once, compounds forever |

---

## What's Next

### This week (unblocking the first autonomous loop)

1. Phase 0: Fix 8 compile errors — `npx tsc --noEmit` exits 0
2. Phase 1: Python dispatcher paths + Janitor integration + pytest suite
3. Phase 2: `loadMasterVault()` reading from `.env` (MVP credential system)
4. Test: drop a task → clone runs → result in `brain/completed/` → Janitor evaluates → Bridge notifies

### Near term (first autonomous production loop)

- `UserAgent.triggerFullPipeline()` writes to `brain/inbox/` automatically (the Gemini review 7 bridge)
- BrainPlanner.plan() via Haiku API — no Sequential Thinking MCP needed for MVP
- First real end-to-end: Telegram message → classifier → planner → inbox → dispatcher → clone → Janitor → Bridge notification

### Medium term (fleet)

- Bootstrap second node (MIKE or a spare machine) using `scripts/bootstrap-windows.ps1`
- Add `target_node` field to Task schema
- Dispatcher filters tasks by node — coding tasks to KEVIN, browser tasks to MIKE
- Fleet health droid with heartbeat monitoring

### Long term (Forge)

- Shadow runner: Variant B executes in parallel, never merges
- Evaluator: Sonnet-as-judge, A vs B grading
- Ratchet: 5-win promotion — when Variant B beats production 5 times, it becomes production
- Metrics DB: latency, token consumption, rejection rates per skill
- Self-improving templates: the Forge makes every skill better over time, automatically

### Architecture evolution

- WikiScythe: automated wiki maintenance — delete stale entries, flag contradictions, surface orphan pages
- MCP Keychain server: expose Keychain as an MCP server so Claude Code sessions can request credentials by scope without subprocess injection
- E2B Firecracker microVMs: hardware-level isolation for high-security clones (above Docker tier)
- Multi-tenant: the architecture is ready for multiple users — Keychain vaults are already per-user isolated

*See also: [[plan-build-v1]], [[plan-implementation-v4]], [[decision-seven-segments]], [[review-gemini-review7]]*
