# Forge Experiments

Active experiments, queue, and past outcomes.

---

## Active experiments

None currently running. Opus v9 build just completed. Next: review cycle then potential merge to main.

---

## Queue (prioritized)

### Q1: Janitor 2-tier benchmark
**Priority:** High
**Trigger:** Jure observation that Opus+extended produces qualitatively better Janitor findings
**What to run:** 5 test cases × 3 model configs (Haiku max, Sonnet medium, Opus max+extended)
**Expected output:** Routing decision for `janitor_tier` dispatcher field
**Blocking:** Forge needs to be running (dispatcher active). Currently only tested via manual Claude sessions.
**See:** [[forge-benchmarks]], [[decision-janitor-tiered-benchmark]]

### Q2: runRepomix execFileAsync vs shell interpolation (already fixed, log the result)
**Status:** Fixed in plan-build-v9. No A/B needed — correctness issue, not performance tradeoff.

### Q3: Brief optimization — test structured vs narrative mission briefs
**Priority:** Medium
**What to run:** Same task, two brief styles (structured with explicit sections vs natural language paragraph). Measure: test pass rate, tokens consumed, scope creep rate.
**Blocking:** Need 10+ real clone runs to have enough data.

### Q4: Confidence gate threshold tuning
**Priority:** Medium
**Current:** `confidenceGateThreshold: 0.7` in `clone_config.json`
**What to test:** 0.5, 0.6, 0.7, 0.8 — measure BLOCK rate vs false BLOCK rate
**Blocking:** Need real mission runs.

### Q5: Wiki context budget (2000 vs 4000 chars)
**Priority:** Low
**Current:** 2000 chars (~500 tokens) for all wiki pages. Gemini review MED-1 flagged this as too tight.
**What to test:** Does doubling to 4000 chars improve Brain routing quality?

---

## Past experiments

### [2026-04-08] Effort level routing — Phase 1

| Task type | Winner | Margin |
|---|---|---|
| Security fix | max | Clear — more precise, catches edge cases |
| Precision wiring | max | Clear — less hallucination |
| General implementation | medium | Marginal — speed wins |

**Promoted:** `decision-effort-level-routing.md` updated. Clone config uses medium as default.

---

### [2026-04-08] Context window size — Phase 2

| Model × effort | Correctness | Tokens | Time |
|---|---|---|---|
| Opus medium | 10/10 | 6k | 1.6 min |
| Sonnet max | 10/10 | ~8k | ~2 min |
| Haiku medium | 10/10 | 19.6k | ~3 min |

**Promoted:** Opus medium as Forge evaluation default. Forge runs scheduled at token reset.

---

### [2026-04-09] Janitor false positive tuning — agent-janitor v1.0.1

**Not a model benchmark** — this was a pattern/config tuning experiment based on real scan.

| Pattern | Before | After |
|---|---|---|
| high_entropy_base64 (40→60 chars) | 17 false positives | 0 |
| generic_password_assignment ($VAR fix) | 8 false positives | 0 |
| Python dead code (indentation check) | 39 false positives | 0 |
| .claude/skills exclude_path | 16 false positives | 0 |

**Total:** 80 false positives → 0. 61+47 findings → 13+8 findings.
**Promoted:** agent-janitor v1.0.1 defaults.
