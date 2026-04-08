# Claude Code Performance Tuning Report

**Author:** Jure (via Claude analysis)
**Date:** 2026-04-08
**Subscription:** Max 5x ($100/month)
**Purpose:** Establish baseline scores, define forge test runs, and systematically tune Claude Code settings for optimal quality-to-cost ratio.

---

## 1. Background: The Opus 4.6 Regression

### What Happened

On April 2, 2026, Stella Laurenzo (Senior Director of AI, AMD) filed GitHub issue #42796 against `anthropics/claude-code`, backed by quantitative analysis of 6,852 session files, 234,760 tool calls, and 17,871 thinking blocks spanning January–April 2026. The issue was pinned by Anthropic's Boris Cherny (Claude Code creator).

### Key Findings from the Analysis

| Metric | Good Period (Jan–Feb 12) | Degraded (Mar 8+) | Change |
|--------|--------------------------|-------------------|--------|
| Read:Edit ratio | 6.6 | 2.0 | -70% |
| Stop hook violations | 0 | 173 (17 days) | 0 → 10/day |
| User interrupts / 1K calls | 0.9 | 5.9 | +556% |
| Reasoning loops / 1K calls | 8.2 | 21.0 | +156% |
| "Simplest" mentions / 1K calls | 2.7 | 4.7 | +74% |
| User sentiment ratio (pos:neg) | 4.4:1 | 3.0:1 | -32% |

### Anthropic's Response

Boris Cherny clarified that thinking redaction (`redact-thinking-2026-02-12`) only hides thinking from the UI — it does not reduce actual thinking. However, Opus 4.6 introduced **adaptive thinking**, where the model dynamically decides how much to think per turn. This, combined with the default effort level being **medium**, is what most users are experiencing as degradation.

### Community Consensus on Root Causes

1. **Adaptive thinking** defaults to minimal reasoning for tasks it considers "simple" — but misjudges complexity
2. **Default effort: medium** — insufficient for multi-step engineering tasks
3. **1M context window** — more context doesn't mean better reasoning; quality degrades at high fill levels
4. **Auto-compact at ~83%** — by the time compaction fires, the model is already performing poorly
5. **Load-sensitive throttling** — thinking depth appears to vary by time of day and overall platform load

---

## 2. Current Configuration Baseline

### Subscription: Max 5x

- ~88,000 tokens per 5-hour window
- Access to Opus 4.6, Sonnet 4.6, Haiku 4.5
- Priority access during peak times
- 1M context window on Opus and Sonnet (auto-enabled on Max plans)

### Available Models

| Model | Context Window | Input $/MTok | Output $/MTok | Extended Thinking | Best For |
|-------|---------------|--------------|---------------|-------------------|----------|
| **Opus 4.6** | 1M (auto on Max) | $5.00 | $25.00 | Yes (adaptive) | Complex architecture, multi-file reasoning, debugging |
| **Sonnet 4.6** | 1M (auto on Max) | $3.00 | $15.00 | Yes (adaptive) | 80% of coding tasks, implementation, reviews |
| **Haiku 4.5** | 200K | $1.00 | $5.00 | No | Lookups, simple edits, topic detection |

**Cost impact on quota:** Opus burns quota ~1.7x faster than Sonnet, and ~5x faster than Haiku. On Max 5x, this means:
- Sonnet default: ~8 hours of active work per 5-hour window
- Opus: ~4-5 hours of active work per 5-hour window
- Opus + /effort max: ~2-3 hours of active work per 5-hour window

### Current Defaults (What We're Testing Against)

| Setting | Current Default | Notes |
|---------|----------------|-------|
| Model | Sonnet 4.6 | Default for Claude Code on subscription plans |
| Effort | medium | Adaptive thinking; model decides per-turn depth |
| Context window | 1M | Auto-enabled on Max plans |
| Auto-compact threshold | ~83% | Internal cap; cannot be raised above this |
| CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING | not set (adaptive ON) | Model decides thinking budget dynamically |
| CLAUDE_CODE_DISABLE_1M_CONTEXT | not set (1M ON) | Full 1M context available |
| CLAUDE_CODE_AUTO_COMPACT_WINDOW | not set | Uses full context window |
| CLAUDE_CODE_SIMPLE | not set | Full system prompt |

---

## 3. Optimal Usage Hours (GMT+2 / CEST — Ljubljana)

Based on the Laurenzo time-of-day analysis (PST → CEST conversion):

| Your Time (CEST) | US Time (PST) | Quality Level | Notes |
|-------------------|---------------|---------------|-------|
| **8:00 AM** | 10:00 PM | Excellent | US evening recovery |
| **9:00 AM** | 11:00 PM | Best regular hour | Peak quality window |
| **10:00–11:00 AM** | 12:00–1:00 AM | Excellent | Lowest US load |
| **12:00–2:00 PM** | 2:00–4:00 AM | Very good | US deep night |
| **3:00–4:00 PM** | 5:00–6:00 AM | Good | US pre-dawn, near baseline |
| **5:00–6:00 PM** | 7:00–8:00 AM | Good | US morning, load rising |
| **7:00–9:00 PM** | 9:00–11:00 AM | Moderate | US work hours |
| **10:00 PM–12:00 AM** | 12:00–2:00 PM | Moderate-Low | US peak work |
| **1:00–3:00 AM** | 3:00–5:00 PM | Worst | US end-of-day peak |
| **5:00 AM** | 7:00 PM | Second worst | US prime time |

**Bottom line:** Your normal 8 AM – 6 PM workday is the golden window. Quality tanks during your sleeping hours (1–7 AM CEST).

---

## 4. Forge Test Plan: Phase 1 — Effort Level

### Objective

Establish a quality-vs-cost score for each effort level using a standardized benchmark task. We do NOT blindly default to `/effort high` or `max` — we find the sweet spot.

### Benchmark Task Design

Each test run uses the **same prompt** against the **same codebase state** (git checkout to a fixed commit). The task should be representative of real work: multi-file, requires reading before editing, has conventions to follow, and has a clear correctness criteria.

**Suggested benchmark tasks (pick 2-3 from your active projects):**

1. **Bug fix task** — A known bug with a root cause in one file but symptoms in another. Measures: does the model find the root cause or apply a band-aid?
2. **Feature implementation** — Add a small feature that touches 3+ files with conventions. Measures: convention adherence, read-before-edit behavior, correctness.
3. **Refactor task** — Rename/restructure something with cross-file dependencies. Measures: does it find all usages, maintain tests, avoid breaking changes?

### Scoring Rubric (0–10 per category)

| Category | Weight | What to Score |
|----------|--------|---------------|
| **Correctness** | 30% | Does the code work? Does it pass tests? |
| **Root cause vs band-aid** | 20% | Did it fix the real problem or apply "simplest fix"? |
| **Convention adherence** | 15% | Naming, patterns, CLAUDE.md rules followed? |
| **Read-before-edit** | 15% | Did it read related files before making changes? |
| **Autonomy** | 10% | How many corrections/interrupts needed? |
| **Token efficiency** | 10% | Total tokens consumed for the task |

**Composite score** = weighted sum, 0–10.

### Test Matrix: Phase 1

Run each benchmark task at each effort level. Model: **Sonnet 4.6** (default, cheapest).

| Run ID | Model | Effort | Adaptive Thinking | Context Window | Compact |
|--------|-------|--------|-------------------|----------------|---------|
| S-LOW | Sonnet 4.6 | low | ON (default) | 1M | 83% (default) |
| S-MED | Sonnet 4.6 | medium | ON (default) | 1M | 83% (default) |
| S-HIGH | Sonnet 4.6 | high | ON (default) | 1M | 83% (default) |
| S-MAX | Sonnet 4.6 | max | ON (default) | 1M | 83% (default) |
| S-HIGH-NOADAPT | Sonnet 4.6 | high | OFF | 1M | 83% (default) |
| S-MAX-NOADAPT | Sonnet 4.6 | max | OFF | 1M | 83% (default) |

Then repeat the best 2 Sonnet configs with Opus:

| Run ID | Model | Effort | Adaptive Thinking | Context Window | Compact |
|--------|-------|--------|-------------------|----------------|---------|
| O-BEST1 | Opus 4.6 | (from Sonnet winner) | (from Sonnet winner) | 1M | 83% (default) |
| O-BEST2 | Opus 4.6 | (from Sonnet runner-up) | (from Sonnet runner-up) | 1M | 83% (default) |

### Commands for Each Run

```bash
# S-LOW
claude --effort low
# At start: /model sonnet

# S-MED (this is the current default — our baseline)
claude --effort medium
# At start: /model sonnet

# S-HIGH
claude --effort high
# At start: /model sonnet

# S-MAX
claude --effort max
# At start: /model sonnet

# S-HIGH-NOADAPT
CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1 claude --effort high
# At start: /model sonnet

# S-MAX-NOADAPT
CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1 claude --effort max
# At start: /model sonnet
```

### Recording Template

For each run, record:

```
Run ID: ___
Date/Time (CEST): ___
Task: ___
Model: ___
Effort: ___
Adaptive Thinking: ON / OFF
Token usage (from /usage): ___
Time to complete: ___
Number of user corrections: ___
Number of "simplest fix" attempts: ___
Number of files read before first edit: ___

SCORES (0-10):
  Correctness:           ___
  Root cause vs band-aid: ___
  Convention adherence:   ___
  Read-before-edit:       ___
  Autonomy:              ___
  Token efficiency:       ___

Composite score: ___
Notes: ___
```

---

## 5. Forge Test Plan: Phase 2 — Context Window & Auto-Compact

**Run Phase 2 only after Phase 1 identifies the best effort/thinking config.**

### Context Window Options

| Setting | Effect | How to Set |
|---------|--------|------------|
| 1M (default on Max) | Full context; risks quality degradation at high fill | Default behavior |
| Disable 1M | Forces 200K context window | `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` |
| Custom compact window | Limits effective context via earlier compaction | `CLAUDE_CODE_AUTO_COMPACT_WINDOW=N` (in tokens) |

### Auto-Compact Tuning

| Setting | Value | Effect |
|---------|-------|--------|
| Default | ~83% of context window | Compacts when 83% full; quality already degrading by then |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | 75 (recommended start) | Compacts earlier; more frequent but smaller summaries |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | 60 | Aggressive; very frequent compaction but maintains quality |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | 400000 | Boris's recommendation; forces 400K effective context |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | 200000 | Conservative; treats 1M model like a 200K model |

**Important:** The `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` cannot go ABOVE 83% (internally clamped by Math.min). It only works to compact EARLIER.

### Test Matrix: Phase 2

Use the winning effort/thinking config from Phase 1. Use the same benchmark tasks.

| Run ID | Context | Compact Setting | Effective Window |
|--------|---------|-----------------|-----------------|
| CTX-1M-83 | 1M | 83% (default) | ~830K usable | 
| CTX-1M-75 | 1M | AUTOCOMPACT_PCT=75 | ~750K usable |
| CTX-1M-60 | 1M | AUTOCOMPACT_PCT=60 | ~600K usable |
| CTX-400K | 1M | AUTO_COMPACT_WINDOW=400000 | ~400K usable |
| CTX-200K | Disabled 1M | N/A (200K native) | ~166K usable |

```bash
# CTX-1M-83 (default)
# No changes needed from Phase 1 winner

# CTX-1M-75
# In ~/.claude/settings.json:
# { "env": { "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "75" } }

# CTX-1M-60
# In ~/.claude/settings.json:
# { "env": { "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "60" } }

# CTX-400K
CLAUDE_CODE_AUTO_COMPACT_WINDOW=400000 claude

# CTX-200K
CLAUDE_CODE_DISABLE_1M_CONTEXT=1 claude
```

---

## 6. CLAUDE.md Additions (Apply Before Testing)

Add these to your global `~/.claude/CLAUDE.md` before running forge tests. These address the specific behavioral failures documented in the community:

```markdown
## Code Quality Standards
- Prefer correct, complete implementations over minimal ones.
- Use appropriate data structures and algorithms — don't brute-force what has a known better solution.
- When fixing a bug, fix the root cause, not the symptom.
- If something requires error handling or validation to work reliably, include it without asking.
- Use descriptive 3-4 keyword names for functions, variables, and classes. Names must be unambiguous without reading docstrings.
- Always read a file completely before editing it. Never edit a file you haven't read in this session.
- Never say "simplest fix" — find the correct fix.
- Do not stop working or ask permission to continue unless you genuinely need clarification. Finish the task.
- When you find a bug, trace it to its root cause before proposing a fix.

## Compaction Instructions
When compacting, always preserve:
- Current file paths being edited and their relationships
- Test failure messages and debugging context
- Architecture decisions made this session
- CLAUDE.md rules and project conventions
- The current task objective and progress state
```

---

## 7. Tools for Monitoring

### trace-mcp (https://github.com/nikolai-vysotskyi/trace-mcp)

A framework-aware code intelligence MCP server that builds a cross-language dependency graph from source code. Key benefit: **91% fewer tokens** for code understanding tasks by providing precision context instead of brute-force file reading.

**When to add:** After Phase 1 and 2 are complete and you have a stable base config. trace-mcp is a force multiplier that compounds with good settings — but it's another variable, so don't introduce it during benchmarking.

**Install:**
```bash
npm install -g trace-mcp
trace-mcp init
trace-mcp add  # in each project
```

**Key capabilities:**
- `get_task_context` — describe a task, get the optimal code subgraph in one shot
- `get_change_impact` — reverse dependency traversal across languages
- Hook enforcement that blocks Read/Grep on source files, redirecting to trace-mcp tools
- CI/PR change impact reports with risk scoring

### Context Monitoring

Check context usage mid-session:
```
/status    # shows context usage percentage
/usage     # shows token consumption
/compact   # manual compaction with preservation instructions
```

---

## 8. Recommended Model Strategy (opusplan)

Claude Code offers a hybrid `opusplan` model alias:
- **Plan mode** → Uses Opus for complex reasoning and architecture decisions
- **Execution mode** → Automatically switches to Sonnet for code generation

This gives Opus-quality thinking where it matters most while preserving quota. Use as:
```
/model opusplan
```

Test this as an additional run in Phase 1 if budget permits.

---

## 9. Environment Variables Reference

| Variable | Value | Effect |
|----------|-------|--------|
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` | `1` | Forces fixed reasoning budget per turn |
| `CLAUDE_CODE_DISABLE_1M_CONTEXT` | `1` | Forces 200K context window |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | `400000` | Limits effective context to 400K tokens |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | `75` | Triggers compaction at 75% (integer 0-100) |
| `CLAUDE_CODE_SIMPLE` | `1` | Minimal system prompt (less token overhead) |

Set in `~/.claude/settings.json`:
```json
{
  "env": {
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "75",
    "CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING": "1"
  }
}
```

Or export in shell:
```bash
export CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=75
```

---

## 10. Execution Order

1. **Add CLAUDE.md rules** (Section 6) — apply globally before any tests
2. **Phase 1: Effort level tests** (Section 4) — 6 Sonnet runs + 2 Opus runs
3. **Score and analyze Phase 1** — identify best effort/thinking config
4. **Phase 2: Context window tests** (Section 5) — 5 runs with winning config
5. **Score and analyze Phase 2** — identify best context/compact config
6. **Lock in final config** — write to `~/.claude/settings.json`
7. **Optional: Install trace-mcp** (Section 7) — for further token efficiency
8. **Optional: Test opusplan** (Section 8) — for cost-optimized Opus reasoning

### Time Estimate

- Phase 1: ~3-4 hours (6-8 runs × 20-30 min each)
- Phase 2: ~2-3 hours (5 runs × 20-30 min each)
- Analysis/tuning: ~1-2 hours
- Total: ~6-9 hours across 2-3 sessions

**Run all tests during your optimal quality window: 8 AM – 4 PM CEST.**

---

## 11. Quick-Start: Before You Have Test Results

If you want an immediate improvement while waiting to run the full forge tests, this config is a safe bet based on community consensus:

```json
// ~/.claude/settings.json
{
  "env": {
    "CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING": "1",
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "75"
  }
}
```

Then at session start:
```
/effort high
```

This will burn quota faster (~1.5-2x) but should deliver noticeably better quality. The forge tests will tell you whether `/effort max` or a different compact threshold gives a better score per token spent.
