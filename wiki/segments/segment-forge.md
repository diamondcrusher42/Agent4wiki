# The Forge — Perpetual Improvement Engine

> Segment 6 of 6. Principle: Every action is a benchmark. Every error is a lesson. Every process can be replaced by a better version of itself.

## Role

Force driver for perpetual improvement. Shadows every process, benchmarks independently, diagnoses failures, predicts problems, builds better tools, and proposes replacements. The system never stops getting better.

## Forge V0.1 — Bootstrapping with Benchmarking First

> See [[plan-forge-v01-benchmarking]] for full details.

Before the full Forge is built (Phase 7), ship **Forge V0.1** as a single benchmarking script in Phase 5. Run every task type through the model cascade: Sonnet → Haiku → Ollama (up to 70B local) → BitNet 2B → Opus. Sonnet defines the baseline and acts as LLM-as-judge for scoring. Output: `forge/capabilities/map.json` — the model routing matrix [[segment-brain]] uses for task dispatch.

This directly solves two problems from [[review-architecture-audit]]: Forge vaporware critique, and quality grading unsolved. The three-criterion grading framework (unit tests → LLM-as-judge → human review) produced by V0.1 is reused by [[segment-janitor]] in Phase 6 and the full Forge in Phase 7.

## Core Mechanism: Shadow Benchmarking

See [[concept-shadow-benchmarking]].

Every process has a shadow. When [[segment-brain]] creates a mission brief, the Forge independently creates an alternative. When [[segment-clones|a clone]] executes, the Forge records timing, tokens, errors, quality. When [[segment-janitor]] audits, the Forge audits the audit.

Shadows run in parallel, in their own [[concept-git-worktrees|worktrees]], on their own budget. Results compared. When a shadow consistently outperforms production (5+ consecutive wins), the Forge proposes promotion. [[segment-brain]] decides. See [[decision-forge-independence]].

## Seven Improvement Loops

### 1. Mission Brief Optimization
Analyzes brief quality vs. output quality after every clone completes. A/B tests alternative brief structures. Promotes winning [[concept-clone-skill-templates|templates]]. Tracks per-skill improvement curves.

### 2. Error Diagnosis & Pattern Recognition
Every error logged in structured database. Pattern analysis: "this error type occurs when X condition is present." Predictive models: "this task has 73% chance of hitting rate limit." Generates pre-emptive fixes for [[concept-mission-briefs|mission briefs]].

### 3. Tool Building
Detects recurring manual patterns → builds new tools. Tools start as scripts, graduate to skills, evolve into clone specializations. Every tool has a benchmark. Promoted only when it measurably beats baseline.

### 4. Process Replacement
Builds full replacements that run as shadows alongside production. Same input, both produce output, both graded. 5 consecutive wins → replacement promoted, old process becomes new benchmark target. Ratchet: system can only get better.

### 5. Capability Growth
Maintains capability map: what can the system do today? Identifies gaps. Proposes new capabilities. Maturity levels: experimental → tested → production → optimized.

### 6. Predictive Diagnostics
Monitors: API rate limit burn rates, credential expiration trajectories, disk usage trends, token budget consumption, service response time degradation. Issues early warnings. Suggests preventive action. Learns from past incidents.

### 7. Self-Improvement (Meta-Loop)
The Forge benchmarks itself. How quickly does it detect patterns? How accurate are its predictions? How often do its tools get promoted? Runs retrospectives on its own performance. The improvement engine improves itself.

## File Structure

```
forge/
├── briefs/experiments/    # A/B test variants for mission briefs
├── briefs/results/        # comparison data
├── briefs/history/        # retired templates with performance scores
├── errors/database.json   # structured error log
├── errors/patterns.json   # recognized error patterns
├── errors/predictions.json# active predictions
├── errors/preventions/    # generated prevention rules
├── tools/candidates/      # tools under development
├── tools/benchmarks/      # performance baselines
├── tools/promoted/        # tools that beat their benchmark
├── tools/retired/         # superseded tools
├── replacements/active/   # shadow processes running against production
├── replacements/promoted/ # replacements that won
├── replacements/failed/   # replacements that lost (with learnings)
├── capabilities/map.json  # current system capabilities
├── capabilities/gaps.json # identified gaps
├── capabilities/proposals/# new capability proposals
├── diagnostics/monitors/  # monitoring configs
├── diagnostics/predictions/
├── diagnostics/incidents/ # past incidents with root cause
├── meta/self-benchmark.json
├── meta/retrospectives/
├── dashboard.json         # current state of all loops
├── queue.json             # prioritized improvement tasks
├── wins.json              # log of successful improvements
└── config.yaml            # thresholds, promotion criteria
```

## Independence Rule

**The Forge never modifies production directly.** It builds shadows, runs benchmarks, proposes changes, and presents evidence. [[segment-brain]] decides whether to promote. See [[decision-forge-independence]].

This prevents the improvement engine from destabilizing the system it's improving. The Forge is R&D; the Brain is the CEO who signs off on shipping.

## Token Strategy

- [[tool-bitnet]] on CPU: routine monitoring, pattern detection (20% of budget)
- Cloud API: tool building, A/B evaluation, deep analysis (80% of budget)
- Ratio: 80% building, 20% watching

## Interfaces

| Segment | Relationship |
|---------|-------------|
| [[segment-memory]] | Reads all data. Writes improvement findings to wiki. |
| [[segment-user-agent]] | Receives usage patterns. Reports improvement metrics. |
| [[segment-brain]] | Shadows brief creation. Proposes template upgrades. A/B tests planning. |
| [[segment-clones]] | Benchmarks every execution. Builds tools from patterns. Creates new skills. |
| [[segment-janitor]] | Audits the audit. Improves audit rules. |
| [[tool-keychain-agent]] | Monitors credential usage. Predicts rate limit exhaustion. Optimizes fallback ordering. |
