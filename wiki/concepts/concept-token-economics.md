# Token Economics

> How tokens are budgeted across the six segments.

## Model Tiers

| Tier | Model | Used By |
|------|-------|---------|
| Cloud premium | Claude/Opus or Claude/Sonnet | [[segment-brain]], critical [[segment-clones]] |
| GPU local | Nemotron on RTX 3090 | Specialized clones, sensitive data |
| CPU local | [[tool-bitnet]] 2B | Routine clones, [[segment-user-agent]], [[segment-janitor]], [[segment-forge]] monitoring |

## Key Principle

Expensive models for judgment, free models for grunt work. Brain gets the best. Routine clones and monitoring run for free on BitNet. User Agent never resets because it runs on a tiny always-on local model consuming only summaries via [[concept-summary-pipeline]].

Wake-up cost for full world context: ~170 tokens via [[concept-aaak-compression]].

## ⚠️ RTT Latency: Simple Task Problem

> Flagged by: [[review-gemini-review1]]

The full 6-segment pipeline (User Agent → Brain → Memory → Clone → Janitor → Forge) is designed for complex tasks. Running it for simple requests (status check, single-fact query, quick lookup) burns tokens and adds latency for no gain.

**Required: tiered routing at the User Agent layer**

| Tier | Trigger | Path | Latency |
|------|---------|------|---------|
| Direct | Simple query, no execution needed | User Agent → response | < 1s |
| Brain-only | Planned task, no clone needed | User Agent → Brain → response | 2-5s |
| Full pipeline | Multi-step, requires execution | All 6 segments | 10-60s+ |

Complexity classifier runs at User Agent on [[tool-bitnet]] (zero cost). Routes before the Brain is even woken. See [[segment-user-agent]], [[segment-brain]].

## Model Routing Matrix (from Forge V0.1)

> See [[plan-forge-v01-benchmarking]] for how this is built empirically.

The Brain routes tasks using a data-driven matrix, not assumptions. Populated by the Forge V0.1 benchmarking cascade. Template until benchmarks run:

| Task Type | Route To | Notes |
|-----------|----------|-------|
| Text summary / classification | Haiku | Benchmark to confirm |
| Local file parse / formatting | Ollama local | Free, hardware-limited |
| Code — feature development | Sonnet | Haiku often fails unit tests |
| Complex architecture / planning | Sonnet | Opus only marginal gain |
| Deep synthesis / ambiguous brief | Opus | Sonnet insufficient |
| QA / linting / formatting | BitNet 2B | Confirmed floor task |

**Opus reality check (from Gemini):** Sonnet often matches or beats Opus for coding, tool-calling, and structured output. Reserve Opus for deep logical synthesis, creative writing, and highly ambiguous planning. Verify empirically via V0.1 cascade.

## Model Split (Gemini recommendation)

Brain = cloud API only. Everything else (Clones, Janitor, Forge monitoring, User Agent) = local wherever possible. This collapses operational cost to near zero, turning multi-agent overhead into a hardware constraint rather than a financial one.
