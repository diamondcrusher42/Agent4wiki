# Build State — Forge Benchmark Tool (2026-04-08)

## What was built

A standalone parallel benchmarking tool ("Forge Benchmark") for measuring Claude Code model × effort performance on any repeatable coding task.

## Problem it solves

Previous benchmarking was manual and error-prone:
- Human had to paste prompts into each session manually
- Had to remember to run reset.sh before every run
- JSONL paths were hunted manually after each session
- Runs were sequential (6 combos = 6× the time)
- Scoring was semi-manual, correctness checks required human judgement

## Solution

Fully automated parallel benchmark runner:
1. **Parallel execution**: All 6 model/effort combos run simultaneously in isolated git worktrees
2. **Zero manual steps**: setup.sh runs automatically, prompts injected via `claude -p`, JSONL auto-detected
3. **Deterministic paths**: each worktree has a unique path → JSONL location is predictable
4. **Automated scoring**: score.py called per task after each run, results saved as JSON
5. **Prompt-as-file**: edit `prompts/task-A.md`, re-run — no session interaction needed

## Architecture

```
forge-benchmark/
├── scripts/
│   ├── run_parallel.sh    # Orchestrator: spawns all combos in parallel
│   ├── report.py          # Generates comparison table from stored results
│   └── suite_init.sh      # Creates template suite directory
└── suites/
    └── example/           # Bundled example suite
        ├── prompts/
        │   └── task-A.md  # Task prompt(s)
        ├── setup.sh        # Idempotent worktree reset
        └── score.py        # Metrics extractor (tokens, duration, correctness)
```

## Default matrix

Haiku × (medium, max) + Sonnet × (medium, max) + Opus × (medium, max) = 6 parallel runs

## Key design decisions

- `claude -p` (non-interactive print mode) instead of PTY sessions — enables full automation
- Git worktrees for isolation — each clone gets a clean, independent copy
- JSONL path deterministic from worktree path — no glob hunting needed
- score.py is per-suite — the tool measures what you define, not what we hardcode
- Results persist in `~/.claude/benchmark/` — survive sessions, comparable across runs

## Repos

- Tool: https://github.com/diamondcrusher42/forge-benchmark
- Test suite (agent4wiki tasks): ~/benchmarks/agent4wiki/
- Claude Code skill: ~/.claude/skills/benchmark/

## Benchmark results (Phase 1 — manual runs)

See [[benchmark-results]] for Sonnet medium/high/max comparison from manual runs on 2026-04-08.

Key finding: `--effort max` outperformed medium (fewer tokens, faster, better discipline). `--effort high` was worst on all metrics.

## Next steps

- Run full 6-combo parallel benchmark on agent4wiki suite
- Add Opus results
- Add Task C (cross-wiki token update) to the suite
- Publish benchmark results to wiki after each model update
