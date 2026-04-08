# Routing Classifier

> Zero-cost complexity routing at the User Agent layer. Regex-only — no LLM, no latency. Three output classes: DIRECT, BRAIN_ONLY, FULL_PIPELINE.

## What It Does

The `ComplexityClassifier` in `core/routing/classifier.ts` is the first thing that runs on every user input. It decides how to route the request before any LLM is invoked.

The fundamental rule: **don't burn tokens on tasks that don't need them.**

```
User input
    ↓
ComplexityClassifier.classify(input)  ← regex only, < 1ms
    ↓
DIRECT          → UserAgent answers directly (< 1s)
BRAIN_ONLY      → BrainPlanner.plan(), no clone (2-5s)
FULL_PIPELINE   → Full 7-segment loop, clone execution (10-60s+)
```

## Classification Rules

Implemented as regex heuristics, in priority order:

| Class | Pattern examples | Rationale |
|-------|-----------------|-----------|
| `DIRECT` | "what is X", "status", "show me", simple queries | No execution needed — UserAgent answers from state |
| `BRAIN_ONLY` | "plan X", "how would you approach", analysis tasks | Needs planning, no code execution |
| `FULL_PIPELINE` | "write", "build", "fix", "create", "implement", "run" | Requires clone execution |

Ambiguous inputs default to `BRAIN_ONLY`. The Brain can escalate to `FULL_PIPELINE` if it decides a clone is needed.

## Why Regex, Not LLM

Flagged in [[review-gemini-review3]]: a LLM classifier reintroduces the latency it was designed to eliminate. The classifier runs synchronously before any API call. It costs zero tokens and adds < 1ms.

The classifier does NOT need to be perfect — it needs to be fast and conservative. Over-classifying as FULL_PIPELINE wastes tokens; under-classifying as DIRECT is the worse error (fails silently). When in doubt: escalate.

## state.json Update Trigger

The classifier's output drives when `state.json` updates:
- `FULL_PIPELINE` routing → always flush state after completion
- `DIRECT` interaction: every 5th interaction → flush state

Never update on every prompt (token cost).

## Implementation

```typescript
// core/routing/classifier.ts
export type ComplexityClass = 'DIRECT' | 'BRAIN_ONLY' | 'FULL_PIPELINE';

export class ComplexityClassifier {
  classify(input: string): ComplexityClass {
    // Phase 0-complete — regex implementation
  }
}
```

The classifier is one of the few complete, non-stub components in the current repo.

## Relationship to Dispatcher

The classifier runs in TypeScript (User Agent layer). The Python dispatcher never classifies — it only executes what the Brain has already decided. The Brain writes a task JSON to `brain/inbox/` with `type: "clone"` already set.

Classification happened earlier, at the UserAgent layer.

*See also: [[segment-user-agent]], [[concept-dispatcher]], [[concept-mission-briefs]], [[concept-token-economics]]*
