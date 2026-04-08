# The Forge Wiki

> The Forge is where the system gets better. This wiki is where that process is documented.

Every benchmark, every improvement, every experiment lives here. The Forge wiki is the memory of what was tried, what worked, what failed, and what's next.

## Pages

- [[forge-benchmarks]] — All benchmarks run: methodology, results, routing decisions made
- [[forge-experiments]] — Active experiments, queue, and past experiments with outcomes
- [[forge-improvement-log]] — Log of every improvement proposed, tested, and promoted or rejected

## What the Forge does

The Forge runs shadows. When the system does something, the Forge tries doing it differently — different model, different effort level, different approach. When the shadow consistently beats production, the Forge proposes promotion.

Seven improvement loops: Brief Optimization → Error Diagnosis → Tool Building → Process Replacement → Capability Growth → Predictive Diagnostics → Self-Improvement.

See [[segment-forge]] for the full architecture.

## Current state

| Loop | Status |
|---|---|
| Benchmark runner | ✅ Built (`diamondcrusher42/forge-benchmark`) |
| Shadow runner | ✅ Built (`forge/shadow_runner.ts`) |
| Evaluator | ✅ Built (`forge/evaluator.ts`) |
| Ratchet (promotion) | ✅ Built (`forge/ratchet.ts`) |
| Metrics DB | ✅ Built (`forge/metrics_db.ts`) |
| Brief optimization | 🔧 Pending data |
| Predictive diagnostics | 🔧 Pending data |

## Key decisions already made

- [[decision-effort-level-routing]] — When to use --effort max vs medium. Max wins on security + precision. Never use high.
- [[benchmark-results]] — Phase 1 (effort) + Phase 2 (context window). Opus medium wins on Forge tasks.
- [[decision-janitor-tiered-benchmark]] — 2-tier Janitor: Haiku/Sonnet routine vs Opus+extended deep audit.
