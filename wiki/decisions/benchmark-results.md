# Benchmark Results — Claude Code Performance

> Tracking page. Updated after each run.
> Scoring script: `tools/benchmark_score.py`
> Full plan: [[plan-forge-benchmarking]]

## Test Sequence

| Order | Run ID | Model | Effort | Adaptive | Purpose |
|-------|--------|-------|--------|----------|---------|
| 1 | S-MED | Sonnet 4.6 | medium | ON | **Baseline** — current default |
| 2 | S-HIGH | Sonnet 4.6 | high | ON | Effort increase |
| 3 | S-MAX | Sonnet 4.6 | max | ON | Maximum effort |
| 4 | H-MED | Haiku 4.5 | medium | N/A | Regression — cost floor |

Phase 2 (context window) and Opus runs added after Phase 1 analysis.

## Benchmark Tasks

| Task | What it tests | Correctness (automated) |
|------|---------------|------------------------|
| **A** — Path traversal bug fix | Root cause vs band-aid | `grep "path.relative"` in manager.ts |
| **B** — MCP transport wiring | Feature implementation, convention | `npx jest --testPathPattern=mempalace` |
| **C** — Cross-wiki 170→600-900 update | Multi-file reading, no false edits | `grep "170 tokens" wiki/` = 0 results |

Codebase: `opus-build` branch at commit `9a22294` (pre-patch clean state).

## Scoring Rubric

| Dimension | Weight | Source |
|-----------|--------|--------|
| Correctness | 30% | Automated (task check) |
| Root cause vs band-aid | 20% | Automated for Task A; manual others |
| Convention adherence | 15% | Automated for Task C; manual others |
| Read-before-edit | 15% | Automated (JSONL) |
| Autonomy (human corrections) | 10% | Automated (JSONL) |
| Token efficiency | 10% | Automated (JSONL, relative to S-MED baseline) |

---

## Results

### Run: S-MED — Sonnet 4.6 / effort medium (BASELINE)

> Date: 2026-04-08
> Time (CEST): ~15:40

```
claude --effort medium
# /model sonnet
```

| Task | Tokens | Duration | Read:Edit | RbE | Corrections | Correctness | Root Cause |
|------|--------|----------|-----------|-----|-------------|-------------|------------|
| A | 13,088 | 5.3 min | 5.0 | 100% | 27 | ✓ correct | ✓ root fix |
| B | 13,088 | 5.3 min | 5.0 | 100% | 27 | ✓ connect() + test written | — |
| **Avg** | 13,088 | 5.3 min | 5.0 | 100% | 27 | — | — |

Notes: Baseline run. Test file (mempalace_adapter.test.ts) written fresh from clean state.

---

### Run: S-HIGH — Sonnet 4.6 / effort high

> Date: 2026-04-08
> Time (CEST): ~16:16 (clean re-run after reset.sh fix)

```
claude --effort high
# /model sonnet
```

| Task | Tokens | Duration | Read:Edit | RbE | Corrections | Correctness | Root Cause |
|------|--------|----------|-----------|-----|-------------|-------------|------------|
| A | 15,519 | 5.7 min | 3.5 | 50% | 34 | ✓ correct | ✓ root fix |
| B | 15,519 | 5.7 min | 3.5 | 50% | 34 | ✓ connect() + test written | — |
| **Avg** | 15,519 | 5.7 min | 3.5 | 50% | 34 | — | — |

vs S-MED baseline: Δ tokens = +18.6%, Δ corrections = +26%, RbE dropped 100%→50%
**Verdict: WORSE than medium on clean slate. More hand-holding, less disciplined reads.**

---

### Run: S-MAX — Sonnet 4.6 / effort max

> Date: 2026-04-08
> Time (CEST): ~16:24 (clean re-run after reset.sh fix)

```
claude --effort max
# /model sonnet
```

| Task | Tokens | Duration | Read:Edit | RbE | Corrections | Correctness | Root Cause |
|------|--------|----------|-----------|-----|-------------|-------------|------------|
| A | 10,818 | 4.3 min | 7.0 | 100% | 30 | ✓ correct | ✓ root fix |
| B | 10,818 | 4.3 min | 7.0 | 100% | 30 | ✓ connect() + test written | — |
| **Avg** | 10,818 | 4.3 min | 7.0 | 100% | 30 | — | — |

vs S-MED baseline: Δ tokens = -17.3%, Δ duration = -19%, RbE = 100% (matched MED)
**Verdict: BEST overall. Fastest, most token-efficient, more reads per edit, maintained discipline.**

---

### Run: H-MED — Haiku 4.5 / effort medium

> Date: 2026-04-08 (Phase 2, Forge automated run)
> Tools: Forge parallel runner (`run_parallel.sh`)

| Task | Tokens | Duration | Turns | RbE | Correctness |
|------|--------|----------|-------|-----|-------------|
| A | 19,620 | 2.0 min | 65 | 25% | ✓ 10/10 |
| B | 19,620 | 2.0 min | 65 | 25% | ✓ 10/10 |
| C | 19,620 | 2.0 min | 65 | 25% | ✓ 10/10 |

vs S-MED: Δ tokens = +130%, Δ turns = +76%. Haiku needed nearly 3× more tokens despite being the "cheap" model.

---

## Phase 2 — Full Model × Effort Matrix (Forge Automated Run)

> Date: 2026-04-08 18:07 CEST
> Runner: `bash run_parallel.sh benchmarks/agent4wiki --matrix "haiku:medium,haiku:max,sonnet:medium,sonnet:max,opus:medium,opus:max"`
> All 6 runs ran simultaneously in isolated git worktrees.

**Correctness: ALL models scored 10/10 on all 3 tasks.** Quality is uniform across models for well-defined engineering tasks. Differentiator is efficiency only.

| Model | Effort | Tokens Total | Duration | Turns | Read:Edit | RbE |
|-------|--------|-------------|----------|-------|-----------|-----|
| Opus  | medium | **6,017**   | **1.6 min** | **35** | 1.1 | 22% |
| Haiku | max    | 9,589       | 1.9 min  | 83    | 1.2 | 30% |
| Sonnet| medium | 8,508       | 2.7 min  | 37    | 1.0 | 0%  |
| Opus  | max    | 10,531      | 3.1 min  | 46    | 1.5 | 25% |
| Sonnet| max    | 13,254      | 3.4 min  | 42    | 1.4 | 0%  |
| Haiku | medium | 19,620      | 2.0 min  | 65    | 1.5 | 25% |

**Winner: Opus medium** — cheapest, fastest, fewest turns. Beats Haiku medium by 3.3×.

---

## Summary Table (All Runs)

| Run | Model | Effort | Tokens | Duration | Correctness | Rank |
|-----|-------|--------|--------|----------|-------------|------|
| Phase 2 | Opus 4.6 | medium | 6,017 | 1.6 min | 10/10 all tasks | **1st** |
| Phase 2 | Haiku 4.5 | max | 9,589 | 1.9 min | 10/10 all tasks | 2nd |
| Phase 2 | Sonnet 4.6 | medium | 8,508 | 2.7 min | 10/10 all tasks | 3rd |
| Phase 2 | Opus 4.6 | max | 10,531 | 3.1 min | 10/10 all tasks | 4th |
| Phase 1 | Sonnet 4.6 | max | 10,818 | 4.3 min | ✓ | 5th |
| Phase 2 | Sonnet 4.6 | max | 13,254 | 3.4 min | 10/10 all tasks | 6th |
| Phase 1 | Sonnet 4.6 | medium | 13,088 | 5.3 min | ✓ | 7th |
| Phase 2 | Haiku 4.5 | medium | 19,620 | 2.0 min | 10/10 all tasks | **Last** |
| Phase 1 | Sonnet 4.6 | high | 15,519 | 5.7 min | ✓ | Excluded |

## Key Findings

See [[decision-effort-level-routing]] for the full decision guide.

1. **Haiku is a trap for complex tasks.** 19,620 tokens vs Opus medium's 6,017. More retries, less precision.
2. **Opus medium is the Forge default** for engineering tasks — cheapest + fastest with perfect quality.
3. **medium > max** for tokens on all models (max adds cost, no quality gain on well-defined tasks).
4. **Forge scheduling strategy**: run full benchmarks just before token limit reset — tokens that would expire anyway, used to generate routing intelligence. Net cost: $0.
5. **Scorer bugs fixed in Phase 2**: worktree path not passed (all scores read wrong dir), test location assumed `test/` but models correctly wrote to `core/memory_store/`.

## Methodology Notes

- Benchmark tasks: Tasks A and B completed per run (Task C not run in Phase 1)
- Reset script (`/tmp/benchmark/reset.sh`) initially only reset tracked files — `git clean` skipped test/ because it contains tracked files. Fixed to use explicit `rm -f` for the untracked test artifact.
- First S-HIGH and S-MAX runs were invalid (test/ persisted from S-MED). Re-runs on 2026-04-08 are the valid measurements.
- Scorer (`tools/benchmark_score.py`) measures session-level metrics — Tasks A and B share the same session so token/turn counts are identical per-run. Per-task breakdowns require sub-session tagging (future improvement).

## How to Run the Scorer

After each session:
```bash
# Score the latest session automatically
python3 tools/benchmark_score.py \
  --run-id S-MED \
  --task A \
  --worktree /home/claudebot/clones/agent4wiki-opus-build-20260408

# For S-MED first run, also save baseline:
python3 tools/benchmark_score.py --run-id S-MED --task A --set-baseline \
  --worktree /home/claudebot/clones/agent4wiki-opus-build-20260408
```

Output saved to `/tmp/benchmark-{run-id}-{task}.json`.

## Task Prompts (copy-paste into each run)

### Task A — Path Traversal Bug Fix
```
The scanForLeaks method in core/keychain/manager.ts has a security flaw in its file path validation loop.
A file in state/worktrees/clone-12 can bypass the sandbox boundary check for state/worktrees/clone-1.
Find the root cause and fix it properly. Do not apply a band-aid — fix the actual vulnerability.
```

### Task B — MCP Transport Wiring
```
Wire the MCP transport layer in core/memory_store/mempalace_adapter.ts.
The connect() method currently has a TODO stub.
Implement it using StdioClientTransport from @modelcontextprotocol/sdk/client/stdio.js to spin up the MemPalace Python process.
Add a unit test that mocks the transport and verifies connect() is called.
```

### Task C — Cross-wiki Token Update
```
The wiki has several pages that still reference "~170 tokens" for MemPalace wake-up cost.
The correct number is 600-900 tokens (independently benchmarked).
Find all wiki pages with this stale reference and update them.
Do not change anything else — only update the token count references.
```
