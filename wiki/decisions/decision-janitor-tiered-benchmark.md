# Decision: 2-Tier Janitor + Forge Benchmark Plan

> Date: 2026-04-09
> Source: Jure — observation from Opus extended-thinking review quality

## Hypothesis

The Janitor currently runs as a static TypeScript tool (no LLM). When the Janitor is used in agent pipeline context (evaluating AI agent handshakes, writing detailed audit notes), the quality of findings correlates with the model doing the evaluation.

Jure observed that Opus with extended thinking produced qualitatively better audit findings (review-janitor-audit3, review-opus-review95) than the same audit run without extended thinking. The hypothesis: pointing different models at the same code should produce similar BLOCK findings (objective) but diverge on SUGGEST/NOTE quality and design contradiction detection (subjective/semantic).

## Proposed 2-tier architecture

### Tier 1 — Routine Janitor
- Model: Haiku `--effort max` OR Sonnet `--effort medium`
- Use case: CI gate, pre-merge scan, routine dead code + secrets check
- Target: fast (< 30s), cheap, catches the obvious
- Expected to match on: secrets, dead code, missing tests, warn keywords
- May miss: design contradictions, silent failure modes, stale artifact context

### Tier 2 — Power Janitor
- Model: Opus `--effort max` + extended thinking
- Use case: pre-release deep audit, branch merge review, post-build evaluation
- Target: thorough, higher cost, catches semantic issues
- Expected to catch additionally: design contradictions, confusion traps, silent failures, architectural inconsistencies

## Forge benchmark design

**Goal:** Quantify quality gap between tiers on the same codebase.

**Tasks to test (concrete):**
1. Dead code detection — agent4wiki `janitor_evaluate()` with V1 dead block present. Score: did model find it and correctly identify V1 vs V2 behavioral difference?
2. Design contradiction — `raw/dispatcher.py` with "credentials never on disk" comment + `provisionEnvironment()` writing `.env`. Score: did model flag the contradiction specifically?
3. Silent failure mode — template variable mismatch (`{INJECT_SOUL_MD_HERE}` vs `{INJECT_SOUL_HERE}`). Score: did model identify the silent failure path?
4. Stale artifact — `raw/dispatcher.py` with wrong BASE_DIR. Score: did model flag stale duplicate risk?
5. Good pattern preservation — did model correctly identify AES-256-GCM vault, task ID validation, circuit breaker as things to keep?

**Scoring matrix:**
| Finding | Haiku max | Sonnet med | Opus max+extended |
|---|---|---|---|
| Dead code found | — | — | — |
| V1/V2 diff noted | — | — | — |
| Design contradiction | — | — | — |
| Silent failure | — | — | — |
| Stale artifact | — | — | — |
| Good patterns | — | — | — |
| Total / 6 | — | — | — |

**Secondary metrics:** tokens consumed, wall time, cost estimate.

**Decision gate:** If Haiku/Sonnet score ≥ 4/6 on objective findings → Tier 1 viable for routine use. If gap ≥ 2 points → 2-tier makes sense. If gap < 1 → single tier (Sonnet medium) is sufficient.

## Implementation path (when Forge is ready)

1. Write 5 test cases as structured prompt files (same format as existing forge-benchmark)
2. Run via forge-benchmark: `claude --model haiku --effort max`, `claude --model sonnet --effort medium`, `claude --model opus --effort max`
3. Grade each response against the 5 objective criteria
4. Publish routing decision to `decision-effort-level-routing.md` and `clone_config.json`

## If 2-tier is validated

Dispatcher gets a `janitor_tier` field in tasks:
- `"janitor_tier": "routine"` → Haiku max or Sonnet medium
- `"janitor_tier": "deep"` → Opus max extended (triggered automatically on BLOCK findings, pre-release, or explicit flag)

The Forge monitors tier routing over time — if Tier 1 miss rate rises, auto-escalate to Tier 2.
