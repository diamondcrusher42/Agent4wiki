# Decision — Effort Level Routing (--effort flag)

> Status: DECIDED
> Date: 2026-04-08
> Evidence: [[benchmark-results]] Phase 1 runs (S-MED, S-HIGH, S-MAX)

## Decision

Default to `--effort medium`. Use `--effort max` for specific task types listed below.
**Do not use `--effort high`** — it was consistently worse than both medium and max in benchmarks.

## Evidence Summary

| Effort | Tokens | Duration | Corrections | Read-before-edit |
|--------|--------|----------|-------------|-----------------|
| medium | 13,088 | 5.3 min  | 27          | 100%            |
| high   | 15,519 | 5.7 min  | 34          | 50%             |
| max    | 10,818 | 4.3 min  | 30          | 100%            |

Max was **17% fewer tokens, 19% faster, matched medium's read discipline, fewer edits per file**.
High was **worst on every metric** — most tokens, most corrections, lowest read discipline.

## When to Use `--effort max`

Max thinking earns its cost on tasks where:

### 1. Root cause security / correctness bugs
Tasks requiring the model to reason about why something is wrong before touching code.
Example: path traversal bugs, logic errors that appear simple but have subtle edge cases.
Why: Extended thinking lets it reason through the attack surface before editing. Fewer wrong edits.

### 2. Single-file, high-precision feature wiring
Implementing a stub from a spec (MCP transport, API adapter, protocol integration).
Why: More internal reasoning → correct implementation first time, fewer correction cycles.

### 3. Architecture and decision analysis
Evaluating trade-offs, reviewing design decisions, writing decision docs.
Why: Quality of reasoning matters more than speed; no edit loop to slow things down.

### 4. Code review / audit passes
Reviewing a file for issues without editing it.
Why: Max thinking produces more thorough analysis with the same or fewer output tokens.

## When NOT to Use Max

- Routine refactoring across many files — medium is faster and equally accurate
- Repetitive tasks (rename, reformat, migrate patterns) — thinking overhead wasted
- Tasks where the model needs many read→edit→verify cycles — extended thinking per step adds up
- Any task where you'd run it more than once (parallelised research, clone work) — cost multiplies

## Why `--effort high` Underperforms

Based on benchmark data, `high` effort appears to fall into a middle ground:
- Enough thinking budget to slow down, but not enough to reason to a complete plan before acting
- Result: more tentative edits, more re-reads triggered by confusion, more human corrections
- `max` appears to "front-load" reasoning and commit to a plan before touching files

This is not a definitive finding — Phase 2 (more task types, Task C) may reveal cases where high outperforms.

## Routing Rule for Agent Orchestrator

```
if task.type in [security_fix, root_cause_debug, protocol_wiring, architecture_review]:
    effort = "max"
elif task.type in [multi_file_refactor, repetitive_migration, parallel_research]:
    effort = "medium"
else:
    effort = "medium"  # default — never use high
```

## Open Questions

- Does max advantage hold for multi-file tasks? (Task C — cross-wiki update — not yet run)
- Does Haiku + medium match Sonnet + medium on simpler tasks? (H-MED pending)
- Is the high effort penalty consistent across models (Opus)?
