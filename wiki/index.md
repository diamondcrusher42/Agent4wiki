# Agent Architecture Wiki — Index

> Last updated: 2026-04-08
> Total pages: 67
> Sources ingested: 8 repos/articles + 1 architecture session + 13 external reviews + 2 implementation plans + 1 research PDF + 1 template + 1 multi-channel bridge

## Templates

- `templates/code-clone-TASK.md` — Code clone mission brief V1. Injection variables, Janitor handshake JSON, Repomix trap. See concept-clone-skill-templates.

## Segments

- [[segment-memory]] — The Vault. Persistent external store. MemPalace + LLM Wiki.
- [[segment-user-agent]] — The Virtual Clone. Privacy-first credential guardian. Minimal tokens.
- [[segment-brain]] — The Architect. Plans, delegates, never executes. Starts fresh every session.
- [[segment-clones]] — Special Ops. Disposable executors in git worktrees. Unlimited parallel.
- [[segment-janitor]] — The Muscle. Doubts everything. Prunes, simplifies, audits.
- [[segment-forge]] — Perpetual Improvement. Shadow benchmarks. Tool building. Process replacement.
- [[segment-bridge]] — The Output Layer. Everything the user sees. Telegram + multi-channel relay. Never go radio silent.

## Concepts

- [[concept-shadow-benchmarking]] — Running alternatives against production to find better approaches.
- [[concept-token-economics]] — How tokens are budgeted across the seven segments.
- [[concept-mission-briefs]] — How the Brain instructs Clones. Not conversations — precision briefs.
- [[concept-wiki-pattern]] — Karpathy's LLM Wiki: compile knowledge, don't re-derive it.
- [[concept-aaak-compression]] — MemPalace's 30x lossless compression dialect for AI context.
- [[concept-fallback-chains]] — Graceful degradation when services or credentials fail.
- [[concept-clone-skill-templates]] — Per-skill instruction sets that improve over time.
- [[concept-clone-lifecycle]] — Full clone execution sequence: spawn → keychain → setup → run → handshake → janitor → teardown. Security invariants.
- [[concept-routing-classifier]] — Zero-cost complexity routing. DIRECT / BRAIN_ONLY / FULL_PIPELINE. Regex-only, no LLM, < 1ms.
- [[concept-summary-pipeline]] — How interactions get compressed before reaching the User Agent.
- [[concept-git-worktrees]] — Parallel isolated execution environments for clones.
- [[concept-soul-md]] — Voice and personality persistence across all agents.
- [[concept-inter-agent-protocol]] — JSON-lines event log per channel. How segments communicate.
- [[concept-dispatcher]] — Lightweight script bridging always-on droids to session-based Brain/Clone launches.
- [[concept-wiki-tiering]] — Hot/warm/cold archive tiers. 500-token index cap. Prevents wiki growth failure.
- [[concept-distributed-clones]] — Multi-machine execution fabric. Node registry, per-platform capabilities, task routing, credential isolation, use case map per hardware type.
- [[concept-node-setup]] — Step-by-step setup guide: bare Linux + Windows bootstrap scripts, all dependencies, path issues, smoke tests, fleet registration format.
- [[concept-multi-channel-bridge]] — 5-channel fallback cascade (Telegram→Email→Discord→Slack→SMS). send() vs broadcast() modes. Dispatcher routing by directive.

## Tools

- [[tool-mempalace]] — Local-first AI memory system. Palace structure (metadata filtering), AAAK (lossy, 84.2% recall), ChromaDB backend (96.6% raw). KG: no entity resolution, no contradiction detection.
- [[tool-llm-wiki]] — Karpathy's pattern for compounding knowledge bases.
- [[tool-last30days]] — Multi-source research skill. Reddit, X, YouTube, HN, Polymarket.
- [[tool-bitnet]] — 1-bit LLM inference. CPU-native, 70-82% energy reduction.
- [[tool-hstack]] — Health specialist agents. Subagent separation pattern.
- [[tool-ai-personal-os]] — Onboarding, daily logging, Zettelkasten, system review.
- [[tool-keychain-agent]] — Digital keychain. Encrypted vault, scoped injection, leak scanning.
- [[tool-mcp-protocol]] — Model Context Protocol. Host-client-server triad, Code Mode (98.7% token reduction), top skills, security threats.

## Entities

- [[entity-telegram-bots]] — Admin bot, company bots, kids coding bot. The communication layer.
- [[entity-hardware]] — RTX 3090, WSL2, Docker, Ollama. The local compute stack.

## Decisions

- [[decision-six-segments]] — Why six segments (original — superseded).
- [[decision-seven-segments]] — Why seven: The Bridge earns segment status. Output reliability = execution reliability.
- [[decision-typescript-python]] — TypeScript Core (User Agent/Brain/Janitor/Keychain) + Python Clones. MCP as firewall. Locked.
- [[decision-brain-never-executes]] — The Brain plans. Period.
- [[decision-forge-independence]] — Why the Forge never touches production directly.
- [[review-architecture-audit]] — Full critical review: what works, what breaks, what's untested.
- [[review-gemini-review1]] — Gemini external review: ping-pong deadlock, RTT latency, filesystem scope attack vector.
- [[plan-implementation-v4]] — 7-phase build plan sequenced by dependency. Phase 1=Memory, Phase 7=Forge.
- [[plan-forge-v01-benchmarking]] — Forge V0.1: model benchmarking cascade. Sonnet→Haiku→Ollama→BitNet→Opus. Produces routing matrix.
- [[review-gemini-review3]] — Gemini review 3: plan validated as bulletproof + 4 tweaks (async MemoryStore, regex classifier, worktree teardown, Phase 5 as Forge seed).
- [[review-opus-review1]] — Opus deep-dive: 5 new blind spots, 3 conflicts, repo structure, productization, autonomy levels, 6 upgrades, 6 quick wins.
- [[review-opus-review2]] — Opus code review: TASK template V2, MemoryStore V2 (enum+writeSummary+audit), Keychain V2 (spawn injection, try/finally). Language decision flagged.
- [[review-gemini-review4]] — Gemini feasibility check: engine/state repo separation, Docker sandboxing, clone bootstrap, irreversible action gate.
- [[review-pdf-agentic-ecosystem]] — Research PDF: MCP as native protocol, Code Mode 98.7% token reduction, E2B microVMs, credential proxying, MCP security threats.
- [[review-gemini-review5]] — Gemini synthesis: skills → architecture mappings. Sequential Thinking for Brain, Repomix for coding clones, Absolute-Human format for Janitor audit logs. "Start building."
- [[decision-directory-scaffold]] — Canonical repo directory structure. Implementation status table. Conflict notes: brain/ (Python dispatcher) vs core/brain/ (TS planner); templates/ migration path.
- [[review-opus-review3]] — Janitor + dispatcher integration: detectStructuralIssue V2, Forge JSONL logging, SUGGEST retry loop, WikiScythe 3 operations, dispatcher→Janitor lifecycle.
- [[review-opus-review4]] — Directory + gitignore: events/ dir, keychain/config/ YAMLs, Python artifacts, worktrees-inside-repo note (deferred), Soul.md two-file split (deferred).
- [[review-gemini-review6]] — Phase 4/5/7 file structure: Brain split (planner/dispatcher/prompt_builder), Clones lifecycle/ subdir + clone_worker, Forge 4 files (shadow_runner/evaluator/ratchet/metrics_db).
- [[review-code-audit-1]] — Full codebase audit: 6 🔴 critical (compile errors, security), 9 🟡 structural, 5 🟢 weak. Priority fix order included.
- [[review-gemini-review7]] — Current state deep dive: inbox pattern validated, 3 blind spots (TS→Python bridge, vault stub, Janitor loop). "This week" path: Steps 1+2 = first autonomous loop.
- [[review-opus-review5]] — Opus Janitor audit (early state): R1 monorepo decision documented, R2/R3/Y3/Y5 fixed, Y1 partial (2 orphan links remain), Y2/Y4 open.
- [[plan-build-v1]] — Phase-by-phase build guide with exact code specs + unit tests. Phase 0 (compile fixes) → Phase 4 (first autonomous loop).
- [[decision-system-philosophy]] — Why this was built, design choices, tools used, full roadmap. Origin story.
- [[decision-model-governance]] — Sonnet 4.6 as benchmark baseline for all tasks. Optimisation path: Haiku → Ollama → BitNet. Forge drives the transitions.
- [[review-gemini-review8]] — Opus brief audit: 6 findings applied (MemPalace blind spot, TS mandate, state.json trigger, path traversal fix, setup.sh hook, staged output protocol).
- [[review-gemini-review9]] — Final brief audit: 14 findings applied (TS↔Python boundary, deprecated methods, handshake parsing, injection variables, wiki lookup paths, model flag, scope guard, security DoD tests). Brief v4 ready to send.
- [[review-janitor-audit2]] — Full repo Janitor audit: 17/25 health score (up from 14). 5 RED (R1-R3 in plan, R3 fixed), 11 YELLOW (Y1/Y3/Y7/Y11 fixed, Y2 fixed with new pages), 6 GREEN. Compile-blocking state unchanged.
- [[review-mempalace-issues]] — MemPalace independent audit: 7 false README claims, AAAK is lossy (84.2%), wake-up 600-900 tokens not 170, contradiction detection nonexistent, 96.6% is raw ChromaDB. Architecture safe (MemoryStore interface). 5 pages corrected.
- [[review-gemini-code-review68]] — Gemini review of opus-build branch: path traversal fix (path.relative), entropy 8→16. False positive: .env 0o600 already correct. MCP transport known TODO. 57 tests green.
- [[build-state-2026-04-08]] — Full system snapshot: Phases 0-4 done (57 tests), 2 security patches, known TODOs (MCP transport, AES vault, WikiScythe). opus-build branch 6 commits ahead of main.
- [[plan-forge-benchmarking]] — Full benchmark plan: 3 concrete tasks from Agent4wiki codebase, JSONL automation, Phase 1 (effort) + Phase 2 (context window) + Forge integration path.

## Log

See [[log]] for chronological record of all wiki operations.
