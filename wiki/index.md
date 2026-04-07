# Agent Architecture Wiki — Index

> Last updated: 2026-04-07
> Total pages: 37
> Sources ingested: 7 repos/articles + 1 architecture session + 5 external reviews + 1 implementation plan

## Segments

- [[segment-memory]] — The Vault. Persistent external store. MemPalace + LLM Wiki.
- [[segment-user-agent]] — The Virtual Clone. Privacy-first credential guardian. Minimal tokens.
- [[segment-brain]] — The Architect. Plans, delegates, never executes. Starts fresh every session.
- [[segment-clones]] — Special Ops. Disposable executors in git worktrees. Unlimited parallel.
- [[segment-janitor]] — The Muscle. Doubts everything. Prunes, simplifies, audits.
- [[segment-forge]] — Perpetual Improvement. Shadow benchmarks. Tool building. Process replacement.

## Concepts

- [[concept-shadow-benchmarking]] — Running alternatives against production to find better approaches.
- [[concept-token-economics]] — How tokens are budgeted across the six segments.
- [[concept-mission-briefs]] — How the Brain instructs Clones. Not conversations — precision briefs.
- [[concept-wiki-pattern]] — Karpathy's LLM Wiki: compile knowledge, don't re-derive it.
- [[concept-aaak-compression]] — MemPalace's 30x lossless compression dialect for AI context.
- [[concept-fallback-chains]] — Graceful degradation when services or credentials fail.
- [[concept-clone-skill-templates]] — Per-skill instruction sets that improve over time.
- [[concept-summary-pipeline]] — How interactions get compressed before reaching the User Agent.
- [[concept-git-worktrees]] — Parallel isolated execution environments for clones.
- [[concept-soul-md]] — Voice and personality persistence across all agents.
- [[concept-inter-agent-protocol]] — JSON-lines event log per channel. How segments communicate.
- [[concept-dispatcher]] — Lightweight script bridging always-on droids to session-based Brain/Clone launches.
- [[concept-wiki-tiering]] — Hot/warm/cold archive tiers. 500-token index cap. Prevents wiki growth failure.

## Tools

- [[tool-mempalace]] — Local-first AI memory system. Palace structure, AAAK, knowledge graph.
- [[tool-llm-wiki]] — Karpathy's pattern for compounding knowledge bases.
- [[tool-last30days]] — Multi-source research skill. Reddit, X, YouTube, HN, Polymarket.
- [[tool-bitnet]] — 1-bit LLM inference. CPU-native, 70-82% energy reduction.
- [[tool-hstack]] — Health specialist agents. Subagent separation pattern.
- [[tool-ai-personal-os]] — Onboarding, daily logging, Zettelkasten, system review.
- [[tool-keychain-agent]] — Digital keychain. Encrypted vault, scoped injection, leak scanning.

## Entities

- [[entity-telegram-bots]] — Admin bot, company bots, kids coding bot. The communication layer.
- [[entity-hardware]] — RTX 3090, WSL2, Docker, Ollama. The local compute stack.

## Decisions

- [[decision-six-segments]] — Why six segments, not three or ten.
- [[decision-brain-never-executes]] — The Brain plans. Period.
- [[decision-forge-independence]] — Why the Forge never touches production directly.
- [[review-architecture-audit]] — Full critical review: what works, what breaks, what's untested.
- [[review-gemini-review1]] — Gemini external review: ping-pong deadlock, RTT latency, filesystem scope attack vector.
- [[plan-implementation-v4]] — 7-phase build plan sequenced by dependency. Phase 1=Memory, Phase 7=Forge.
- [[plan-forge-v01-benchmarking]] — Forge V0.1: model benchmarking cascade. Sonnet→Haiku→Ollama→BitNet→Opus. Produces routing matrix.
- [[review-gemini-review3]] — Gemini review 3: plan validated as bulletproof + 4 tweaks (async MemoryStore, regex classifier, worktree teardown, Phase 5 as Forge seed).
- [[review-opus-review1]] — Opus deep-dive: 5 new blind spots, 3 conflicts, repo structure, productization, autonomy levels, 6 upgrades, 6 quick wins.

## Log

See [[log]] for chronological record of all wiki operations.
