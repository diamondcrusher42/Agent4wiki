# Review: Gemini Review 6 — Phase 4, 5, 7 File Structure

> Source: raw/Gemini-review6-missing-phases.md | Reviewer: Gemini

## The Strategic Map Is Now Complete

This review provides explicit file structures for the three phases that were previously single-file stubs. Applied immediately.

## Phase 4: Brain — Split into 3 files

Separation of concerns: thinking vs. delegating vs. prompt assembly.

```
core/brain/
├── planner.ts          ← Uses Sequential Thinking MCP. Step-by-step logic. (existed as stub)
├── dispatcher.ts       ← Routing switchboard: takes plan → selects Mission Brief → requests creds
└── prompt_builder.ts   ← Dynamic injection: Soul.md + allowedPaths + wikiContext + task → final prompt
```

- **planner.ts**: Brain thinks without worrying about execution mechanics
- **dispatcher.ts**: Selects correct skill template + credential scope from scopes.yaml
- **prompt_builder.ts**: Assembles final clone prompt string; handles Soul.md two-file merge (generic + private); loads requested wiki pages into 500-token context budget

> Applied to: `core/brain/dispatcher.ts` + `core/brain/prompt_builder.ts` (new)

## Phase 5: Clones — lifecycle/ subdirectory + clone_worker.ts

Orphaned worktrees eat storage. The lifecycle must be strictly managed with dedicated classes.

```
core/clones/
├── templates/          ← Mission Briefs (existing)
├── lifecycle/
│   ├── spawner.ts      ← Creates isolated git worktree (moved from core/clones/spawner.ts)
│   ├── runner.ts       ← Triggers setup.sh + Repomix hook + launches Claude + captures handshake
│   └── teardown.ts     ← CRITICAL: commits code (if NOTE), removes worktree, prunes branch
└── clone_worker.ts     ← Orchestrator: spawner → runner → Janitor → teardown + retry loop
```

Key design points:
- `teardown.ts` is always called (even if runner crashed) via try/finally in KeychainManager
- `runner.ts` enforces timeout (default 30 min) — hung clones are killed and returned as FAILED_REQUIRE_HUMAN
- `clone_worker.ts` owns the SUGGEST retry loop — appends Janitor feedback to objective, increments retry counter

> Applied to: `core/clones/lifecycle/runner.ts` + `lifecycle/teardown.ts` (new); `spawner.ts` moved to `lifecycle/`; `core/clones/clone_worker.ts` (new)

## Phase 7: Forge — 4 specific files (replaces benchmark.ts)

```
core/forge/
├── shadow_runner.ts    ← Parallel background execution of Variant B (never merges to main)
├── evaluator.ts        ← LLM-as-a-Judge: Sonnet grades A vs B on quality/efficiency/speed
├── ratchet.ts          ← 5-Win Promotion Logic: B wins 5× in a row → promote to production
└── metrics_db.ts       ← SQLite wrapper: latency/tokens/rejection rates/win-loss streaks
```

SQLite rationale: Forge queries (avg latency, win streak) are easier in SQL than JSONL scan. The Janitor's `forge/events.jsonl` remains the append-only audit log; `state/memory/forge_metrics.db` is the Forge's queryable analytics store.

Promotion safety: before any template rewrite → `git tag forge/promotion/<timestamp>` + Janitor veto check. Auto-revert on Janitor BLOCK.

> Applied to: `core/forge/` — `benchmark.ts` removed, 4 new files created

## Structural Change Summary

| Before | After |
|--------|-------|
| `core/clones/spawner.ts` | `core/clones/lifecycle/spawner.ts` |
| `core/forge/benchmark.ts` | `core/forge/{shadow_runner,evaluator,ratchet,metrics_db}.ts` |
| `core/brain/planner.ts` (only) | `core/brain/{planner,dispatcher,prompt_builder}.ts` |

*See also: [[segment-brain]], [[segment-clones]], [[segment-forge]], [[decision-directory-scaffold]]*
