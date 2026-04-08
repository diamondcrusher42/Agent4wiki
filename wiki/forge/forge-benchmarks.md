# Forge Benchmarks

All benchmarks run through the system. Each entry has: what was tested, methodology, results, and the routing decision made.

---

## Phase 1 — Effort Level Routing (2026-04-08)

**Question:** Does `--effort max` produce measurably better results than `--effort medium`? When is the cost justified?

**Tasks tested:** 3 concrete agent4wiki tasks
1. Security fix: fix shell injection in runner.ts
2. Precision wiring: implement confidence gate in clone_worker.ts
3. General implementation: add OOM guard to scanForLeaks

**Models tested:** Sonnet 4.6 × {medium, high, max}

**Results:**
- Max wins on security fixes and precision wiring (exact code correctness required)
- Medium wins on general implementation (speed + correctness roughly equal, 40% cheaper)
- High: never use — no measurable improvement over medium, costs ~60% more

**Decision:** [[decision-effort-level-routing]]
- Security / precision wiring → max
- General implementation → medium
- Classification / routing / summaries → Haiku medium

---

## Phase 2 — Context Window + Forge Integration (2026-04-08)

**Question:** Does more context (Repomix full repo vs focused files) improve output quality? Which model handles large context best?

**Tasks tested:** Same 3 tasks from Phase 1, with full repo context via Repomix

**Models × effort tested:** All 6 combos (Sonnet × {med, max}, Haiku × {med, max}, Opus × {med, max})

**Results:**
- All 6 combos: 10/10 correctness on the 3 tasks
- Opus medium: 6k tokens, 1.6 min — wins on efficiency
- Haiku medium: 19.6k tokens — worst (compensates for weaker reasoning with more retrieval)
- Context window: larger context helped Haiku most (it needs more hints); Opus didn't need it

**Decision:** Forge scheduling — run at token reset for $0 marginal cost. Opus medium as default for Forge evaluation tasks.

**Source:** [[benchmark-results]]

---

## Planned: Janitor 2-Tier Benchmark (TBD)

**Question:** Can Haiku/Sonnet catch the same findings as Opus+extended on Janitor audits?

**Test cases:**
1. Dead code with divergent behavior — `janitor_evaluate()` with V1 block. Does model identify V1 vs V2 behavioral difference?
2. Design contradiction — "credentials never on disk" comment + `.env` write. Does model flag the contradiction specifically?
3. Silent failure mode — template variable mismatch (`{INJECT_SOUL_MD_HERE}` vs `{INJECT_SOUL_HERE}`). Does model identify the silent failure path?
4. Stale artifact — `raw/dispatcher.py` with wrong `BASE_DIR`. Does model flag stale duplicate risk?
5. Good pattern preservation — AES-256-GCM vault, task ID validation, circuit breaker. Does model correctly flag these as KEEP?

**Models to test:** Haiku --max, Sonnet --medium, Opus --max (+ extended)

**Scoring:** 0-5 per model per test case. Decision gate:
- Tier 1 ≥ 4/5 → single tier (Sonnet medium) sufficient
- Gap ≥ 2 between Tier 1 and Opus → 2-tier routing justified
- Gap < 1 → single tier

**Expected outcome:** 2-tier validated. Justifies `janitor_tier` field in dispatcher.

**Source:** [[decision-janitor-tiered-benchmark]]

---

## Benchmark methodology

All benchmarks use the forge-benchmark runner (`diamondcrusher42/forge-benchmark`):

```bash
# Run all model × effort combos on a prompt set
python run_benchmark.py --prompts forge/prompts/ --output forge/results/

# Grade results
python grade.py --results forge/results/ --rubric forge/rubrics/
```

Scoring:
- Correctness: does the output match the expected behavior?
- Precision: does it do exactly what was asked, no more?
- Token efficiency: how many tokens consumed?
- Time: wall clock duration

Results logged to `forge/metrics_db.ts` and surfaced in `forge/dashboard.json`.
