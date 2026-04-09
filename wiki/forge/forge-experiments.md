# Forge Experiments

Active experiments, queue, and past outcomes.

---

## Active experiments

None. Opus extended thinking scan on claude-agent-template completed — 3-way tier gap confirmed.

---

## Queue (prioritized)

### Q1: Janitor 2-tier benchmark — extended thinking retest
**Priority:** High
**Trigger:** Jure observation that Opus+extended produces qualitatively better Janitor findings
**Update 2026-04-09:** 3-way structural comparison (Haiku/Sonnet/Opus) showed zero quality gap on objective findings. Extended thinking Opus scan on claude-agent-template in progress — results will show the semantic gap (if any).
**New finding:** Haiku 4.5+ supports extended thinking. Must retest Haiku --max WITH extended thinking prompt ("think hard") on claude-agent-template for true apples-to-apples comparison.
**What to run next:** Haiku --max + extended thinking prompt vs Opus --max + extended thinking on claude-agent-template
**Expected output:** Does extended thinking prompt unlock semantic findings (bare except, type hints) regardless of model tier? Or is Opus reasoning qualitatively better even with same prompt?
**See:** [[forge-benchmarks]], [[decision-janitor-tiered-benchmark]]

### Q1.5: Front-end design skill testing — agent-janitor website
**Priority:** High
**Trigger:** Jure idea to test skill variants the same way Forge tests model × effort
**What to run:** 3 skill variants (baseline, aggressive-cta, edu-focus) × same prompt on agent-janitor wiki data. Stack: React + Tailwind + Framer Motion. Target: `docs/index.html`.
**Scoring:** Gemini-refined scorecard (6 categories × 5 points = 30 max). Promote if ≥ 24/30.
**See:** [[forge-skill-testing]], [[skill-eval-scorecard]]
**Blocking:** Need to run worktrees when ready.

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

### [2026-04-09] Janitor Tier 1 — Haiku --max on forge-benchmark

**Verdict:** Tier 1 viable for objective findings.

| Metric | Value |
|---|---|
| Health Score | 83/100 |
| BLOCK | 0 (correct) |
| SUGGEST | 2 (both valid) |
| NOTE | 1 (false positive — dict literal) |
| Tokens | 29,104 |
| Duration | 34 seconds |
| Cost | ~$0.01 |

Haiku found all structural issues (missing tests for report.py + score.py). Correctly identified 0 secrets/blocking issues. One false positive on multi-line dict return. Missed (as expected for Tier 1): bare `except: pass`, missing type hints, docstrings.

**Partial Tier 1 confirmation.** Objective findings caught correctly. Semantic quality findings (bare except, type hints) need Tier 2 (Opus) to detect. 2-tier benchmark still needed with standardized test cases to quantify the gap.

### [2026-04-09] Janitor Tier 1 — Haiku vs Sonnet blind comparison on forge-benchmark

**Verdict:** Haiku = Sonnet for objective findings. Haiku wins on cost.

| Metric | Haiku --max | Sonnet --medium |
|---|---|---|
| Health Score | 83/100 | 83/100 |
| Verdict | SUGGEST | SUGGEST |
| BLOCK | 0 | 0 |
| SUGGEST | 2 | 2 |
| NOTE | 1 (FP) | 1 (same FP) |
| Tokens | 29,104 | 21,937 |
| Duration | 34s | 38s |
| Cost | ~$0.01 | ~$0.05 |

Both models flagged **identical findings** at identical file:line locations, including the same false positive on `score.py:33`. Sonnet used fewer tokens but was marginally slower. Zero quality difference on structural/objective findings.

**Promoted:** Haiku confirmed as Tier 1 default. No reason to pay 5× more for same findings on objective structural checks. Tier 2 (Opus) still needed for semantic quality gap validation.

### [2026-04-09] Janitor 3-way comparison — Haiku vs Sonnet vs Opus (forge-benchmark)

**Verdict:** Zero quality gap on this repo. Need a semantically richer codebase to surface Tier 2 advantages.

| Metric | Haiku --max | Sonnet --medium | Opus --max |
|---|---|---|---|
| Health Score | 83/100 | 83/100 | 83/100 |
| Verdict | SUGGEST | SUGGEST | SUGGEST |
| BLOCK | 0 | 0 | 0 |
| SUGGEST | 2 | 2 | 2 |
| NOTE | 1 (FP) | 1 (FP) | 1 (FP) |
| Tokens | 29,104 | 21,937 | 20,727 |
| Duration | 34s | 38s | 33s |
| Cost | ~$0.01 | ~$0.05 | ~$0.15 |

All three models: identical findings, identical false positive, identical health score. Opus found nothing Haiku missed.

**Root cause:** forge-benchmark is too simple (2 Python files, no complex logic, no error handling patterns). The Tier 2 semantic gap — bare `except: pass`, missing type hints on complex functions, docstring gaps — requires a richer codebase to emerge.

**Next:** Run 3-way on claude-agent-template (larger, more complex) to surface the semantic gap.

### [2026-04-09] Janitor 3-way tier comparison — claude-agent-template (semantic gap confirmed)

**Verdict: Tier gap is real and large. Opus+extended finds 71% more issues than Haiku/Sonnet.**

| Metric | Haiku --max | Sonnet --med | Opus --max+extended |
|---|---|---|---|
| Health Score | 0/100 | 0/100 | 0/100 |
| Tool findings | 21 | 21 | 21 (identical) |
| Extended semantic findings | 0 | 0 | 36 |
| Total findings | 21 | 21 | 57 |
| Tokens | 28,200 | 23,487 | 107,550 |
| Duration | 31s | 55s | 232s |
| Cost | ~$0.01 | ~$0.05 | ~$1.50 |

**What Opus found that Haiku/Sonnet completely missed:**
- 5 swallowed errors (`except Exception: pass` in security gate, self_evolution, qdrant_memory)
- 4 hardcoded values (personal chat_id data leak, machine-specific paths, hardcoded exchange rate)
- 5 error handling anti-patterns (fail-fast violations, corrupt state silent returns)
- 5 silent failure logic bugs (security scan incomplete flag, MD5 collision risk, embedding dim mismatch)
- 3 security concerns (shell token injection, StrictHostKeyChecking=no, unquoted credentials)
- 3 DRY violations (load_env() 4×, send_telegram() 6×, Garmin logic duplicated)
- 4 fragile patterns (bare except in shell heredocs, GNU-only date flag, lambda closure risk)
- Missing type hints and docstrings (4+3 functions)

**Top 5 fixes (Opus priority list):**
1. `wachete.py:144` — hardcoded personal Telegram chat_id `564661663` = data leak in template repo
2. `qdrant_memory.py:61-66` — zero-padded 384-dim vectors mixed with 768-dim → silent garbage search
3. `skill_security_gate.py:221-222` — security advisory check silently swallowed
4. `security_monitor.py:398` — logic bug: `incomplete = bool(all_errors) and not all_findings` → should be `bool(all_errors)`
5. `system_check.sh:35` — hardcoded `/home/claudebot/.nvm/.../bin/claude` → `$(which claude)`

**Promoted:** 2-tier routing confirmed. Haiku/Sonnet = Tier 1 (structural, objective). Opus+extended = Tier 2 (semantic, qualitative). Cost ratio: 150× between tiers. Quality gap: 171% more findings.

**Next queue item:** Retest Haiku --max WITH extended thinking prompt to answer: is it the model or the prompt that unlocks semantic findings?

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
