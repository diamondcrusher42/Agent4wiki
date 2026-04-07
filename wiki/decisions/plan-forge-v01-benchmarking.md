# Forge V0.1 — Benchmarking First Strategy

> Source: `raw/Gemini-review2-Forge-v01.md` | Ingested: 2026-04-07
> Reviewer: Gemini. Prompt: run model benchmarks as the Forge's first task.

---

## The Idea

Instead of building the full [[segment-forge]] (Phase 7, months of engineering), extract its most valuable core mechanism — benchmarking — and ship it as an **immediate, actionable Forge V0.1**.

Run every task type through the model cascade in order:

```
Sonnet → Haiku → Ollama (local, up to 70B quantized) → BitNet 2B → Opus
```

The output is a **model routing matrix** — a hardcoded table the [[segment-brain]] uses to route tasks without guessing. This is the Capability Map (`forge/capabilities/map.json`) that the full Forge would eventually maintain dynamically, built manually from real data first.

---

## Why this works

**Kills the vaporware critique.** The [[review-architecture-audit]] flagged the Forge as "pure theory, months of engineering." Forge V0.1 is a script that runs in a week. It produces real data immediately.

**Replaces assumptions with hard data.** The [[review-architecture-audit]] called out that routing complex tasks to BitNet 2B is wishful thinking. This cascade defines exactly where the capability floor is, per task type. No more guessing.

**Establishes the baseline principle.** Sonnet first — you need to know what "perfect execution" looks like before compressing cost with smaller models. Every model is graded against Sonnet's output as ground truth.

**Produces the Brain's routing table.** Once benchmarks are complete, the Brain references a data-driven matrix instead of heuristics.

---

## The Cascade

| Step | Model | Purpose |
|------|-------|---------|
| 1 | Claude Sonnet | Baseline — defines "correct" output + writes grading criteria |
| 2 | Claude Haiku | Cost reduction test — can it match Sonnet for this task type? |
| 3 | Ollama local (up to 70B quantized) | Local inference test — RTX 3090 can push serious models |
| 4 | BitNet 2B | Ultra-cheap test — find the hard floor |
| 5 | Claude Opus | Reality check on hardest tasks — Sonnet often matches or beats it |

**Hardware note (from [[entity-hardware]]):** The RTX 3090 (24GB VRAM) can run quantized models up to ~70B parameters. Don't limit local benchmarks to toy 8B models — test the ceiling of what the hardware can actually run.

---

## The Evaluator Problem — Solved

The [[review-architecture-audit]] flagged quality grading as completely unsolved. For Forge V0.1, Gemini's solution:

**Use Sonnet as LLM-as-judge.**

1. Sonnet runs the task first → defines the "perfect" output or writes unit tests
2. Haiku/Ollama/BitNet run the same task → produce outputs
3. Sonnet grades the outputs blindly (without knowing which model produced them)

Three-criterion grading (in order of reliability):
1. **Unit tests** — deterministic pass/fail where applicable (code tasks)
2. **LLM-as-judge** — Sonnet grades against its own output as ground truth
3. **Human review** — manual check for edge cases and final calibration

This is also the grading framework to carry forward into Phase 6 (Janitor quality grading) and the full Forge.

---

## Opus Reality Check

Testing Opus last for hard tasks is correct, but be prepared: **Sonnet often matches or beats Opus** in specific domains:
- Pure coding tasks
- Fast agentic tool-calling
- Structured output / formatting

Opus is better reserved for:
- Deep logical synthesis
- Creative writing requiring nuance
- Highly ambiguous planning tasks

The benchmark will define this empirically rather than by assumption.

---

## Output: The Model Routing Matrix

After the cascade completes, the Brain gets a lookup table:

| Task Type | Routed To | Rationale |
|-----------|-----------|-----------|
| Text summary / classification | Haiku | Benchmark confirmed sufficient |
| Local file parse / formatting | Ollama (local) | Free, fast enough |
| Code — feature development | Sonnet | Haiku fails unit tests |
| Complex architecture / planning | Sonnet | Opus only marginally better |
| Deep synthesis / ambiguous brief | Opus | Sonnet insufficient here |
| QA / linting | BitNet 2B | Formatting-only, confirmed sufficient |

*This table is populated by benchmark results, not assumptions.*

---

## Build Scope (V0.1)

Forge V0.1 is a single script, not a segment:

- [ ] Define 5-10 representative task types (one per skill template from [[concept-clone-skill-templates]])
- [ ] Write Sonnet baseline run + unit test / grading criteria per task
- [ ] Run cascade: Haiku → Ollama → BitNet → Opus
- [ ] Score each model per task using the three-criterion framework
- [ ] Output: `forge/capabilities/map.json` with routing assignments
- [ ] Output: `forge/benchmarks/v01-results.md` with full scoring data
- [ ] Wire routing matrix into Brain's task dispatch logic

This ships before Phase 6 (Janitor) and provides the quality grading foundation Phase 6 needs.

---

## Impact on Implementation Plan

Forge V0.1 moves **out of Phase 7 and into Phase 5**, running in parallel with clone execution:

```
Phase 5: Clones + Forge V0.1 (benchmarking script, runs alongside)
Phase 6: Janitor — uses V0.1 grading framework for quality assessment
Phase 7: Full Forge — now has routing matrix + grading system from V0.1
```

This directly addresses the biggest unsolved problem in the plan: quality grading. V0.1 solves it before Phase 6 needs it.

---

*See also: [[segment-forge]], [[concept-token-economics]], [[concept-shadow-benchmarking]], [[plan-implementation-v4]], [[review-architecture-audit]]*
