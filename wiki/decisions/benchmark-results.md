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

> Date: —
> Time (CEST): —

```
claude --effort medium
# /model sonnet
```

| Task | Composite | Tokens | Duration | Read:Edit | Corrections | Correctness | Root Cause |
|------|-----------|--------|----------|-----------|-------------|-------------|------------|
| A | — | — | — | — | — | — | — |
| B | — | — | — | — | — | — | — |
| C | — | — | — | — | — | — | — |
| **Avg** | — | — | — | — | — | — | — |

Notes: —

---

### Run: S-HIGH — Sonnet 4.6 / effort high

> Date: —
> Time (CEST): —

```
claude --effort high
# /model sonnet
```

| Task | Composite | Tokens | Duration | Read:Edit | Corrections | Correctness | Root Cause |
|------|-----------|--------|----------|-----------|-------------|-------------|------------|
| A | — | — | — | — | — | — | — |
| B | — | — | — | — | — | — | — |
| C | — | — | — | — | — | — | — |
| **Avg** | — | — | — | — | — | — | — |

vs S-MED baseline: Δ composite = —, Δ tokens = —

---

### Run: S-MAX — Sonnet 4.6 / effort max

> Date: —
> Time (CEST): —

```
claude --effort max
# /model sonnet
```

| Task | Composite | Tokens | Duration | Read:Edit | Corrections | Correctness | Root Cause |
|------|-----------|--------|----------|-----------|-------------|-------------|------------|
| A | — | — | — | — | — | — | — |
| B | — | — | — | — | — | — | — |
| C | — | — | — | — | — | — | — |
| **Avg** | — | — | — | — | — | — | — |

vs S-MED baseline: Δ composite = —, Δ tokens = —

---

### Run: H-MED — Haiku 4.5 / effort medium

> Date: —
> Time (CEST): —

```
claude --effort medium
# /model haiku
```

| Task | Composite | Tokens | Duration | Read:Edit | Corrections | Correctness | Root Cause |
|------|-----------|--------|----------|-----------|-------------|-------------|------------|
| A | — | — | — | — | — | — | — |
| B | — | — | — | — | — | — | — |
| C | — | — | — | — | — | — | — |
| **Avg** | — | — | — | — | — | — | — |

vs S-MED baseline: Δ composite = —, Δ tokens = —

---

## Summary Table (fill as runs complete)

| Run | Model | Effort | Avg Composite | Avg Tokens | Cost Index | Winner? |
|-----|-------|--------|---------------|------------|------------|---------|
| S-MED | Sonnet | medium | — | — | 1.0× (baseline) | — |
| S-HIGH | Sonnet | high | — | — | — | — |
| S-MAX | Sonnet | max | — | — | — | — |
| H-MED | Haiku | medium | — | — | — | — |

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
