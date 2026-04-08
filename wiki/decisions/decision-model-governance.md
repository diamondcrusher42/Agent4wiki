# Decision: Model Governance

> Status: Locked
> Applies to: all clone executions, Brain planning, User Agent compression, dispatcher task format

---

## The Rule: Sonnet as Benchmark Baseline

**Claude Sonnet 4.6 is the default model for ALL tasks in the first implementation.**

This is not a permanent configuration — it is the benchmarking baseline. Every skill (code, research, devops, docs, qa) runs on Sonnet first to establish a quality and cost reference point. Only after baselines are established do we optimise downward.

## Why Baseline Before Optimise

Running different models on different tasks before any baseline exists means you can never measure whether an optimisation actually worked. You don't know if Haiku is "good enough" for coding tasks unless you know what Sonnet produces on the same tasks. The Forge's A/B testing and ratchet mechanism only function correctly when there is a production baseline to beat.

**Rule:** measure first, optimise second. The Forge does the optimising — not the initial implementation.

## Optimisation Path (after baseline established)

```
Claude Sonnet 4.6   ← baseline — all tasks start here
        ↓ Forge tests
Claude Haiku 4.5    ← routing, classification, simple tasks
        ↓ Forge tests
Ollama (local)      ← zero API cost, acceptable quality for some tasks
        ↓ Forge tests
BitNet 2B           ← extreme efficiency, CPU-only, summarisation
```

Movement along this path is driven entirely by Forge benchmark results. The Forge evaluator scores Variant B against production, the ratchet promotes after 5 wins. No manual model assignments per task until the Forge has generated the routing matrix.

## Implementation in Code

### Dispatcher task format

Every task JSON includes a `model` field (default `"claude-sonnet-4-6"`):
```json
{
  "id": "task-001",
  "type": "clone",
  "skill": "code",
  "model": "claude-sonnet-4-6",
  "objective": "..."
}
```

The dispatcher passes this to the clone launch command:
```python
subprocess.run([
    "claude", "--print", "--dangerously-skip-permissions",
    "--model", task.model,
    "-p", f"@{prompt_file}"
])
```

When the Forge begins A/B testing, it varies the `model` field in Variant B tasks. The dispatcher already handles it without changes.

### BrainPlanner

Use `claude-sonnet-4-6` in the Anthropic API call. Haiku is the long-term target for Brain planning (cheap routing decision), but Sonnet runs first to establish what quality a Haiku plan needs to match.

### ComplexityClassifier

Stays regex-based — no model needed, no change from baseline rule.

### UserAgent.compressHistory()

Sonnet for MVP. BitNet 2B is the long-term target (zero API cost), but requires local model setup and validation against Sonnet output quality first.

## What the Forge Will Test

Once the first autonomous loop is running, the Forge's first A/B campaign:

| Skill | Variant A (production) | Variant B (test) |
|-------|----------------------|-----------------|
| code | Sonnet 4.6 | Haiku 4.5 |
| research | Sonnet 4.6 | Haiku 4.5 |
| docs | Sonnet 4.6 | Haiku 4.5 |

Evaluator criteria: task completion, test pass rate, Janitor directive (NOTE vs SUGGEST vs BLOCK), token consumption, duration.

5-win promotion: if Haiku produces NOTE on the same task 5 times where Sonnet also produces NOTE, Haiku becomes production for that skill. If Haiku gets more SUGGEST/BLOCK than Sonnet, it does not promote.

## Model IDs (current)

| Model | ID | Relative cost |
|-------|-----|--------------|
| Claude Opus 4.6 | `claude-opus-4-6` | $$$$  |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | $$ — default |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | $ |
| Ollama (local) | varies by model | $0 |
| BitNet 2B | local inference | $0 |

*See also: [[plan-forge-v01-benchmarking]], [[segment-forge]], [[concept-token-economics]], [[plan-build-v1]]*
