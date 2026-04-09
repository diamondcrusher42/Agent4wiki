# Agent Architecture Wiki — Index

> Last updated: 2026-04-09
> Total pages: 112
> Sources ingested: 8 repos/articles + 1 architecture session + 14 external reviews + 2 implementation plans + 1 research PDF + 1 template + 1 multi-channel bridge + Phase 1 benchmark results + Phase 2 Forge automated benchmark
> Branch: main (merged from opus-build 2026-04-09, v0.9.0, commit 3f73f10)

## Templates

- `templates/code-clone-TASK.md` — Code clone mission brief V1. Injection variables, Janitor handshake JSON, Repomix trap. See concept-clone-skill-templates.

## Forge Wiki

- [[forge-home]] — Forge wiki index: current state of all 7 loops, key decisions, links to all sub-pages
- [[forge-benchmarks]] — All benchmarks run: Phase 1 effort routing, Phase 2 context window, planned 2-tier Janitor
- [[forge-experiments]] — Active experiments, prioritized queue (Q1-Q5), past experiment outcomes
- [[forge-improvement-log]] — Append-only log of every improvement: proposed, tested, promoted or rejected
- [[forge-skill-testing]] — Framework for testing Claude Code skill variants with git worktrees. First test: frontend-design for agent-janitor website. Model benchmarks vs skill benchmarks compared.
- [[skill-eval-scorecard]] — Gemini-refined scorecard: 6 categories × 5 points, AI execution checklist, scoring history, decision gate (≥24/30 promote)

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
- [[concept-skill-budget]] — 28-skill ceiling (hard cap, silent drop), 4-gate filter, segment allocation (25 active + 3-4 buffer), graduation pipeline, ASO for descriptions, CLAUDE.md 3-layer architecture.
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
- [[plan-build-v2]] — Phase 5-7 build brief for Opus. AES vault, MCP transport, WikiScythe, fleet routing, Forge core. Target: 57→82 tests.
- [[decision-system-philosophy]] — Why this was built, design choices, tools used, full roadmap. Origin story.
- [[decision-model-governance]] — Sonnet 4.6 as benchmark baseline for all tasks. Optimisation path: Haiku → Ollama → BitNet. Forge drives the transitions.
- [[review-gemini-review8]] — Opus brief audit: 6 findings applied (MemPalace blind spot, TS mandate, state.json trigger, path traversal fix, setup.sh hook, staged output protocol).
- [[review-gemini-review9]] — Final brief audit: 14 findings applied (TS↔Python boundary, deprecated methods, handshake parsing, injection variables, wiki lookup paths, model flag, scope guard, security DoD tests). Brief v4 ready to send.
- [[review-janitor-audit2]] — Full repo Janitor audit: 17/25 health score (up from 14). 5 RED (R1-R3 in plan, R3 fixed), 11 YELLOW (Y1/Y3/Y7/Y11 fixed, Y2 fixed with new pages), 6 GREEN. Compile-blocking state unchanged.
- [[review-mempalace-issues]] — MemPalace independent audit: 7 false README claims, AAAK is lossy (84.2%), wake-up 600-900 tokens not 170, contradiction detection nonexistent, 96.6% is raw ChromaDB. Architecture safe (MemoryStore interface). 5 pages corrected.
- [[review-gemini-code-review68]] — Gemini review of opus-build branch: path traversal fix (path.relative), entropy 8→16. False positive: .env 0o600 already correct. MCP transport known TODO. 57 tests green.
- [[review-opus-extended]] — Opus extended thinking review: 39 findings (4 blockers fixed, 7 total applied). Extended thinking vs Gemini: 10x more findings, caught 4 integration failures Gemini missed. 57/57 tests pass.
- [[build-state-2026-04-08]] — Full system snapshot: Phases 0-4 done (57 tests), 2 security patches, known TODOs (MCP transport, AES vault, WikiScythe). opus-build branch 6 commits ahead of main.
- [[build-state-2026-04-08-phase57]] — Phase 5-7 complete: AES vault, MCP transport, WikiScythe, fleet routing, Forge core. 84 tests all green. Commit 2960b4d.
- [[review-gemini-review88]] — Gemini Phase 5-7 review: 2 critical (stdout JSON parsing, git-as-queue), 3 blind spots (Docker isolation, file locking, orphan watchdog), 3 low-hanging fruits. Priority action order included.
- [[review-opus-review88]] — Opus 5-role deep review: 3 critical security (SSH injection, VAULT_MASTER_PASSWORD in clone env, noLeaks ignored), dual-pipeline debt, Forge entirely unproven. Scores: Brain 7, UA 4, Clone 5, Forge 3, Janitor 6, Docs 9.
- [[plan-build-v3]] — Phase A/B/C Opus build brief: 3 security fixes, 5 reliability fixes (incl. B3b wiki path), 3 quality improvements. Target: 84 → 104 tests.
- [[plan-forge-benchmarking]] — Full benchmark plan: 3 concrete tasks from Agent4wiki codebase, JSONL automation, Phase 1 (effort) + Phase 2 (context window) + Forge integration path.
- [[benchmark-results]] — Phase 1+2 results. Phase 2 (Forge): all 6 combos 10/10 correctness. Opus medium wins (6k tok, 1.6 min). Haiku medium worst (19.6k tok). Forge scheduling: run at token reset for $0 cost.
- [[decision-effort-level-routing]] — When to use --effort max vs medium. Max wins on security fixes + precision wiring. Never use high. Routing rules included.
- [[build-state-2026-04-08-forge]] — Forge Benchmark tool: parallel model×effort runner, zero manual steps, prompt-as-file. Scorer bugs fixed: worktree path + test location. Repo: diamondcrusher42/forge-benchmark.
- [[build-state-2026-04-08-v3]] — Plan-build-v3 complete: 84→103 tests. 3 security + 5 reliability + 3 quality fixes. opus-build @ 3b5513e. 9 TODOs queued for plan-build-v4.
- [[build-state-2026-04-08-v4]] — Plan-build-v4 complete: 103→126 tests. 2-pass classifier, Janitor unified, Forge cost cap, exactMatchSecrets fix, executeDirect+Soul.md, ShadowRunner tokens fixed, WikiScythe gate. opus-build @ af40e52.
- [[review-opus-review91]] — Opus post-v4 review: Security 7, Reliability 7, Tests 6.5, Architecture 7.5, Prod 5.5. Critical: Forge budget structurally broken (events.jsonl vs metrics table), executeDirect duplicate message, routeToBrain missing history, spawner cloneId injection.
- [[review-gemini-review91]] — Gemini post-v4: validates classifier/cost cap/janitor wins. New: loadWikiContext() no total budget cap (24k chars possible), spawner injection confirmed, setup.sh thrashing fix (cp node_modules).
- [[plan-build-v5]] — Phase A (Forge budget fix, duplicate msg, routeToBrain history) + Phase B (spawner validation, wiki cap) + Phase C (promote filter, setup.sh cache, exactMatchSecrets Set). Target 126→141 tests.
- [[build-state-2026-04-08-v5]] — Plan-build-v5 complete: 126→140 tests. Forge budget real, duplicate msg fixed, spawner injection blocked, wiki budget cap, exactMatchSecrets Set, dispatcher file handle. opus-build @ 83e6ba8.
- [[review-opus-review92]] — Opus post-v5: Top 3: cleanupStaleWorktrees registry format mismatch (always clears on startup), dispatcher.py create_worktree() missing task ID validation, TS/Python Janitor divergence on tests_passed:false. Also: scythe filePath injection, planner no JSON retry.
- [[review-gemini-review92]] — Gemini post-v5: scanForLeaks OOM (2GB file → Node crash, silently skipped), dispatcher stdout captures secrets to disk, registry race condition at MAX_CONCURRENT=3, routeToBrain double call, setup.sh supply chain (--ignore-scripts).
- [[plan-build-v6]] — Phase A (registry fix, dispatcher validation, OOM guard) + Phase B (scythe sanitization, --ignore-scripts) + Phase C (planner retry, soul TTL, routeToBrain single call). Target 140→156 tests.
- [[build-state-2026-04-08-v6]] — Plan-build-v6 complete: 140→157 tests. Registry fix, OOM guard, dispatcher injection, scythe array exec, soul TTL, routeToBrain single call. opus-build @ d9ac4ba.
- [[review-opus-review93]] — Opus post-v6: Top 5: vault password leak via Python path, dual lifecycle paths, confidence not gating execution, scanForLeaks git diff blind spot, routeToBrain=executeDirect (needs differentiation). Also: spawner setup.sh gap, tests_passed undefined bug.
- [[review-gemini-review93]] — Gemini post-v6: 1MB scanner loophole (pad to 1.1MB to bypass), self-reporting token metrics bypass, brittle regex fallback for nested JSON, env deny-list vs allowlist, git worktree orphan branches.
- [[plan-build-v7]] — Phase A (Python vault leak, git status scan, tests_passed fix, large file flag) + Phase B (env allowlist, spawner setup.sh) + Phase C (MAX_RETRIES config, BRAIN_ONLY wiki context, confidence gate). Target 157→175 tests.
- [[build-state-2026-04-08-v7]] — Plan-build-v7 complete: 157→174 tests. Python vault leak fixed, git status porcelain, env allowlist, confidence gate, shared clone_config.json. opus-build latest.
- [[review-opus-review94]] — Opus post-v7: TS/Python Janitor decision tree divergence (COMPLETED+tests_passed:false → TS=BLOCK, Python=SUGGEST), REQUIRED_ENV_KEYS missing SHELL/USER, git status rename parsing bug, symlink boundary bypass, hardcoded wiki pages in routeToBrain.
- [[review-gemini-review94]] — Gemini post-v7: Two Brains problem (TS/Python drift), synchronous watch loop (queue blocking), shell injection in runner.ts, quarantine mode missing, context truncation mid-JSON, blind teardown forensic loss.
- [[plan-build-v8]] — Phase A (Janitor unification, rename parsing, SHELL/USER, symlink guard) + Phase B (watch concurrency, shell safety, config externalization) + Phase C (quarantine mode, line-boundary truncation, method rename). Target: 174 → ~192 tests.
- [[build-state-2026-04-08-v8]] — Plan-build-v8 complete: 174→198 tests. Janitor decision tree unified (Python mirrors TS), rename parsing, symlink guard, watch() threaded, execFile array form, confidence+wiki config, quarantine mode. opus-build @ 96002ec.
- [[review-gemini-review95]] — Gemini post-v8: dead code in Python Janitor (botched merge), quarantine EXDEV crash (cross-filesystem renameSync), Python env still blacklist. Also: regex recompilation, MAX_HISTORY_ENTRIES dead code, watchdog race.
- [[review-janitor-audit3]] — Janitor audit 3 (Opus-as-Janitor, post-v8): SUGGEST. B1 dead code confirmed, B3 template mismatch, S1 threading race, S5 stale raw/dispatcher.py. 6 fixes before testing. Good patterns preserved. Branch comparison matrix. Design notes for standalone Janitor product.
- [[plan-build-v9]] — Stripped to 6 real gaps (Opus confirmed 7 items already done in v8): A1 dead code in janitor_evaluate, A2 TOCTOU atomic fd symlink fix, A3 atomic task rename, B1 runRepomix execFileAsync, B2 ForgeRecord unified policy, B3 prompt file cleanup. Target: 198 → ~212 tests.
- [[review-opus-review95]] — Opus multi-perspective post-v8 (72% readiness). CRIT-1: dead code janitor_evaluate. CRIT-2: TOCTOU symlink race (openSync→fstatSync→readFileSync). HIGH-5: atomic rename task pickup. HIGH-6: runRepomix shell injection. HIGH-1: ForgeRecord policy asymmetry. 7 of 9 v8 plan items already implemented.
- [[decision-janitor-standalone]] — Janitor as standalone product (agent-janitor repo). Architecture, credential sharing, v1.0.1 false positive fixes, what it finds vs linters. First real scan learnings.
- [[build-state-2026-04-09-v9]] — Plan-build-v9 complete: 198→211 tests (+13). A1 dead code, A2 TOCTOU fd, A3 atomic claim, B1 runRepomix, B2 ForgeRecord all verdicts, B3 prompt file finally. opus-build @ 5ffb5e4.
- [[review-gemini-v9]] — Gemini review of v9: PromptBuilder .replaceAll() prompt injection (CRIT), stdout JSON parse fragile (HIGH), .env exposure before teardown (HIGH), WikiScythe per-file git log inefficiency.
- [[review-opus-v9]] — Opus 7-segment review of v9: teardown.ts shell injection (CRIT), ratchet.ts tag injection (HIGH), --dangerously-skip-permissions systemic risk, Forge evaluator gameability. 2 mandatory pre-testing fixes, 3 recommended.
- [[janitor-opus-build-pre-merge]] — Janitor pre-merge gate on opus-build: SUGGEST, 0 BLOCKs after v9.1 fixes. Extended thinking enabled. test/ + raw/ excluded as FP patterns.
- [[build-state-2026-04-09-v9-1]] — v9.1: teardown.ts execSync→execFileSync (6 calls), ratchet.ts execSync→execFileSync + tag validation, bare except narrowed. All shell injection surfaces closed.
- [[build-state-2026-04-09-merged]] — Merged opus-build → main (commit 3f73f10). v0.9.0. 211 tests, TSC clean, 0 BLOCKs. Ready for single-machine testing. Pending: handshake schema, context size guard, conversation history persistence.
- [[decision-janitor-tiered-benchmark]] — Forge benchmark plan for 2-tier Janitor: Tier 1 (Haiku max/Sonnet medium) for routine scans, Tier 2 (Opus max+extended) for deep audits. 5 test cases, scoring matrix, routing decision gate.
- [[review-skills-playbook]] — V4 Skills Playbook: 28-skill ceiling, 4-gate triage, 5-layer security (Docker sandbox, Nemotron LLM-on-LLM, Keychain scoping), Quarantine→Probation→Production pipeline, Forge owns lifecycle.
- [[code-suggestions-skills]] — 7 concrete code changes: required_skills task field, provisionSkills() spawner, skills/ library, Docker sandbox flag, per-skill scopes.yaml, GitHub Actions gate, Janitor skill audit. Ordered by phase.
- [[review-opus-review89]] — Opus 5-perspective review (post Phase 5-7): Security 4, Reliability 5, Tests 6, Architecture 7, Prod 3. Top 3 beyond v3: unify TS/Python Janitor, 2-pass classifier, Forge cost cap. 6 more candidates for plan-build-v4.
- [[review-opus-review90]] — Opus 5-perspective review (post plan-build-v3): Security 5.5, Reliability 5.5, Tests 6, Architecture 7, Prod 3.5. New findings: exactMatchSecrets gap, executeDirect blank-slate, ShadowRunner tokens still 0, spawner cloneId injection, routeToBrain useless.
- [[plan-build-v4]] — Phase A/B/C: 2-pass classifier, Janitor unification, Forge cost cap, exactMatchSecrets fix, executeDirect Soul.md injection, ShadowRunner tokens. Target 103→126 tests.

## Log

See [[log]] for chronological record of all wiki operations.
