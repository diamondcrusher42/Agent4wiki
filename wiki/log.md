# Wiki Log

Chronological record of all wiki operations. Append-only.

## [2026-04-07] init | Wiki created

Initial wiki build from architecture session. 7 external sources ingested (MemPalace, Git Worktrees article, Karpathy LLM Wiki, last30days, AI Personal OS Skills, hstack, BitNet). 1 original architecture spec synthesized. 28 wiki pages created across segments, concepts, tools, entities, and decisions.

## [2026-04-07] ingest | MemPalace (github.com/milla-jovovich/mempalace)

Source: GitHub repo README. Key takeaways: palace structure (wings/halls/rooms/closets/drawers), AAAK 30x compression, temporal knowledge graph on SQLite, 96.6% LongMemEval raw score, specialist agents with diaries, MCP server with 19 tools, auto-save hooks for Claude Code. Pages created/updated: [[tool-mempalace]], [[segment-memory]], [[concept-aaak-compression]].

## [2026-04-07] ingest | Git Worktrees + Claude Code (Medium article by Dogukan Tuna)

Source: Medium article. Key takeaways: git worktree for parallel Claude Code sessions, each on separate branch with full isolation, shared git history, TASK.md per worktree as mission brief, cleanup scripts for merged branches. Pages created/updated: [[concept-git-worktrees]], [[segment-clones]].

## [2026-04-07] ingest | LLM Wiki (gist by Karpathy)

Source: GitHub gist. Key takeaways: three-layer pattern (raw sources → wiki → schema), wiki as persistent compounding artifact, ingest/query/lint operations, index.md + log.md navigation, Obsidian as viewer, knowledge compiled once not re-derived. Pages created/updated: [[tool-llm-wiki]], [[concept-wiki-pattern]], [[segment-memory]].

## [2026-04-07] ingest | last30days (github.com/mvanhorn/last30days-skill)

Source: GitHub repo README. Key takeaways: multi-source research across Reddit/X/YouTube/HN/Polymarket/TikTok/Instagram/Bluesky, composite scoring pipeline, watchlist mode with SQLite accumulation, progressive source unlocking, comparative mode, two-phase search. Pages created/updated: [[tool-last30days]], [[segment-clones]].

## [2026-04-07] ingest | AI Personal OS Skills (github.com/BayramAnnakov/ai-personal-os-skills)

Source: GitHub repo README. Key takeaways: onboarding creates CLAUDE.md/SOUL.md/user-profile.md, daily-log for energy/mood/focus, atomize for Zettelkasten extraction, cos-review for system health scoring, skill progression as layered rollout. Pages created/updated: [[tool-ai-personal-os]], [[concept-soul-md]], [[concept-summary-pipeline]], [[segment-user-agent]].

## [2026-04-07] ingest | hstack (github.com/kamens/hstack)

Source: GitHub repo README. Key takeaways: four health specialist skills, shared preamble + skill-specific instructions, subagent separation (clinical truth vs human delivery), red/yellow/green severity framework, LLM eval tests for quality checking. Pages created/updated: [[tool-hstack]], [[segment-janitor]], [[concept-clone-skill-templates]].

## [2026-04-07] ingest | BitNet (github.com/microsoft/BitNet)

Source: GitHub repo README. Key takeaways: 1.58-bit models, 2.37x-6.17x speedup on x86, 70-82% energy reduction, 100B model at human reading speed on single CPU, CPU and GPU kernels, official 2B model. Pages created/updated: [[tool-bitnet]], [[concept-token-economics]].

## [2026-04-07] ingest | Keychain Agent (original design)

Source: Architecture session output. Key takeaways: encrypted vault (AES-256-GCM + Argon2id), scoped injection per-agent, leak scanning with pattern matching, audit logging, rotation scheduler, fallback chains, droids as lightweight watchpost monitors. Pages created/updated: [[tool-keychain-agent]], [[concept-fallback-chains]], [[segment-user-agent]].

## [2026-04-07] ingest | Gemini-review2-Forge-v01.md (Forge benchmarking strategy)

Source: raw/Gemini-review2-Forge-v01.md. Reviewer: Gemini. Key insight: extract benchmarking as Forge V0.1 — ship immediately instead of waiting for full Phase 7. Model cascade: Sonnet baseline → Haiku → Ollama local (up to 70B on RTX 3090) → BitNet 2B → Opus. Grading framework: unit tests → Sonnet-as-LLM-judge → human review. Output: model routing matrix for Brain dispatch. Opus reality check: Sonnet often beats Opus for coding/tool-calling/formatting. Pages created: [[plan-forge-v01-benchmarking]]. Pages patched: [[segment-forge]] (V0.1 bootstrapping section), [[concept-token-economics]] (routing matrix + Opus reality check), [[plan-implementation-v4]] (Phase 5 updated to include Forge V0.1). Index updated (32 pages).

## [2026-04-07] ingest | implementation-plan-v4.md

Source: raw/implementation-plan-v4.md. 7-phase plan sequenced by strict dependency order (Memory → Keychain → User Agent → Brain → Clones → Janitor → Forge). Incorporates all findings from [[review-architecture-audit]] and [[review-gemini-review1]]: MemoryStore interface abstraction, filesystem allowedPaths enforcement per worktree, complexity classifier for tiered routing, Janitor directive tiers (BLOCK/SUGGEST/NOTE), circuit breaker (3-retry limit), quality grading design deferred to Phase 6, Forge deferred to Phase 7. Deferred items listed. Immediate next actions defined. Pages created: [[plan-implementation-v4]]. Index updated (31 pages).

## [2026-04-07] ingest | Gemini-review1.md (external LLM review)

Source: raw/Gemini-review1.md. Reviewer: Gemini. Key new findings not in prior audit: (1) Ping-Pong Deadlock — Janitor rejection loops with no circuit breaker burn tokens indefinitely; (2) RTT latency — full 6-segment pipeline for simple tasks is wasteful, needs fast-path routing at User Agent; (3) Filesystem scope attack — clone working directory at ~/+ gives rogue clone access to .claude.json, keychain tokens, AppData. Requires --allowed-dirs enforcement per worktree. Also reinforced: Brain Never Executes, Janitor, Forge ratchet. Synergies reinforced: Git Worktrees + parallel PRs, Brain=cloud/rest=local model split. Pages created: [[review-gemini-review1]]. Pages that need updates: [[segment-janitor]] (deadlock risk), [[concept-token-economics]] (fast-path routing), [[concept-git-worktrees]] (allowed-dirs enforcement), [[tool-keychain-agent]] (filesystem scope gap). Index updated.

## [2026-04-07] review | Full architecture audit — critical review filed

Deep challenge of all 6 segments, 10 concepts, 7 tools, 3 decisions. 7 strengths confirmed, 6 critical weak spots (🔴), 6 significant risks (🟡), 5 synergies outlined, build order bottlenecks mapped. Key: Forge is Phase 7, quality grading unsolved, Keychain Agent is critical vaporware, MemPalace needs interface abstraction, Claude Code is unacknowledged single dep. Page: [[review-architecture-audit]].

## [2026-04-07] synthesis | Six-segment architecture finalized

Combined all sources into unified architecture. Added Segment 6 (The Forge) for perpetual improvement. Established 12 core architecture rules. Defined 5-phase implementation plan. Pages created: [[segment-forge]], [[concept-shadow-benchmarking]], [[decision-six-segments]], [[decision-brain-never-executes]], [[decision-forge-independence]].

## [2026-04-08] ingest | Claude-Agentic-Workflow-Ecosystem-Deep-Dive.pdf (MCP ecosystem research)

Source: raw/Claude-Agentic-Workflow-Ecosystem-Deep-Dive.pdf. Type: external research report (8 sections). Key findings: (1) MCP as native inter-agent protocol — JSON-RPC 2.0 over stdio/SSE, reflective discovery, Keychain Agent should be an MCP server; (2) Code Mode (Code Execution with MCP) — 98.7% token reduction (150k → 2k tokens), Brain should use Code Mode by default; (3) E2B Firecracker microVMs — hardware-level isolation, Tier 3 above Docker for high-security clones; (4) Credential proxying — secrets as HTTP headers via host proxy, never as env vars inside sandbox; (5) MCP security threats: command injection (ACE via metadata poisoning), credential scraping (Shai Hulud campaign), supply chain rug pull, Confused Deputy (misconfigured OAuth scopes); (6) Repomix for codebase context packing (70% token reduction); (7) Sequential Thinking skill for Brain planning; (8) Evidence-Anchored Synthesis for research clone output format. Pages created: [[tool-mcp-protocol]], [[review-pdf-agentic-ecosystem]]. Pages patched: [[concept-inter-agent-protocol]] (MCP as target protocol), [[concept-token-economics]] (Code Mode), [[concept-git-worktrees]] (three-tier isolation with E2B), [[tool-keychain-agent]] (credential proxying + MCP server + Confused Deputy). Index updated (40 pages).

## [2026-04-07] ingest | Gemini-review4-Can-it-work.md (feasibility check)

Source: raw/Gemini-review4-Can-it-work.md. Reviewer: Gemini. 4 new findings: (1) Engine vs. State repo separation — `core/` (immutable logic, committed) vs `state/` (heavily gitignored vault + worktrees + memory) vs `wiki/`; (2) Docker container sandboxing as escalation path beyond allowedPaths — containerized clones have no host filesystem access; (3) Clone environment bootstrap requirement — every Mission Brief must include a bootstrap block (npm install / pip install / etc.) before clone starts; (4) Irreversible actions mandatory human gate — money/mass sends/public posts cannot use retry logic, require explicit Telegram approval before execution. Pages created: [[review-gemini-review4]]. Pages patched: [[concept-git-worktrees]] (Docker sandboxing + bootstrap), [[concept-mission-briefs]] (bootstrap block format), [[segment-janitor]] (irreversible action gate), [[plan-implementation-v4]] (Phase 4 brief format + action classification). Index updated (38 pages).

## [2026-04-07] ingest | Opus-review1-deep-dive-review.md (full architecture deep dive)

Source: raw/Opus-review1-deep-dive-review.md. Reviewer: Claude Opus. Scope: full architecture — blind spots, conflicts, repo structure, productization, autonomy, upgrades, quick wins. 5 new blind spots not previously flagged: (1) inter-agent communication protocol undefined — no message bus, no event system, no queue; (2) concurrency and locking — parallel clones writing to same files without single-writer rule; (3) dispatcher missing — no way for droids to launch Brain sessions automatically; (4) wiki growth without bounds — needs hot/warm/cold tiering and 500-token index cap; (5) no rollback mechanism for Forge promotions — fix: git tags + probation period + auto-revert. 3 conflicts resolved: Janitor vs Forge territory (Janitor first, reactive; Forge after, proactive; Janitor can veto), Brain context vs wiki richness (500-token index cap), clone isolation vs collaboration (through Memory, not directly). Also: full GitHub repo structure, productization tiers (Free/Premium/Individual/Business), autonomy levels (High/Medium/Low), 6 obvious upgrades (MCP Keychain, Obsidian viewer, voice/Whisper, pre-commit hook, wiki diff reports, cost tracking droid), 6 low-hanging fruit actions. Pages created: [[review-opus-review1]], [[concept-inter-agent-protocol]], [[concept-dispatcher]], [[concept-wiki-tiering]]. Pages patched: [[segment-janitor]] (Janitor/Forge territory rule), [[segment-brain]] (dispatcher missing piece), [[concept-wiki-pattern]] (tiering warning), [[plan-implementation-v4]] (Phase 4: event protocol, dispatcher, single-writer rule). Index updated (37 pages).

## [2026-04-07] ingest | Gemini-review3-Implementation.md (implementation plan validation)

Source: raw/Gemini-review3-Implementation.md. Reviewer: Gemini. Overall verdict: plan is rock-solid. 4 strategic tweaks: (1) MemoryStore interface must use async-first signatures — cloud swap could block execution thread, Phase 3 RTT classifier must account for retrieval latency; (2) Complexity classifier MVP = heuristics/regex only — LLM classifier re-introduces the latency it was designed to eliminate; (3) Worktree creation script must include automated teardown/archival on Janitor approval — orphaned directories fill disk; (4) Phase 5 A/B tracking + model splits = manually building the Forge Capability Map — treat as dual-purpose from day one. Pages created: [[review-gemini-review3]]. Pages patched: [[plan-implementation-v4]] (Phase 1 async note, Phase 3 regex-only rule, Phase 4 teardown deliverable). Index updated (33 pages).
