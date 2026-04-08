# Plan — Claude Code Performance Benchmarking

> Date: 2026-04-08
> Source: `raw/claude-code-tuning-report.md`
> Context: Opus 4.6 regression (adaptive thinking + medium effort default); report by Stella Laurenzo (6,852 sessions, 234K tool calls)
> Goal: Establish baseline, find optimal config, lock in settings before burning quota

## The Problem

Opus 4.6 introduced adaptive thinking that defaults to minimal reasoning for tasks it considers "simple" — but routinely misjudges complexity on multi-step engineering work. Combined with default effort=medium and 1M context window, this produces measurable regressions: Read:Edit ratio dropped from 6.6 to 2.0 (-70%), user interrupt rate up 556%.

Our exposure: every clone run, every wiki ingest, every Gemini review processing burns quota at degraded quality if we're on the wrong settings.

## Phase 0 — Apply Quick-Start Config (Today, Confirm First)

**Pending approval from Jure.** These settings provide immediate improvement based on community consensus while benchmarking runs.

Add to `~/.claude/settings.json` under `"env"`:
```json
"CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING": "1",
"CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "75"
```

At session start: `/effort high`

**Cost impact:** ~1.5-2x quota consumption vs current defaults. On Max 5x, still ~5-6 hours active work per window.

**CLAUDE.md additions** (add to `~/workspace/CLAUDE.md` before testing):
- "Always read a file completely before editing it. Never edit a file you haven't read this session."
- "When fixing a bug, fix the root cause, not the symptom. Never say 'simplest fix'."
- "Do not stop working or ask permission to continue unless you genuinely need clarification."
- Compaction preservation instructions: current file paths, test failure context, architecture decisions, task objective

---

## Phase 1 — Sonnet Baseline (6 runs)

### Benchmark Codebase

`opus-build` branch of Agent4wiki at commit `9a22294` (pre-security-patch state). This is ideal:
- Real code, known structure, known bugs
- We know the correct answers — objective scoring is possible
- Tests exist (`npx jest`) — correctness is automatable
- JSONL logging captures every tool call — partial automation

### Three Benchmark Tasks

**Task A — Bug Fix with Root Cause** (tests root-cause vs band-aid)

Start from clean checkout of `9a22294` (before the path traversal fix).

Prompt:
> "The `scanForLeaks` method in `core/keychain/manager.ts` has a security flaw in its file path validation loop. A file in `state/worktrees/clone-12` can bypass the sandbox boundary check for `state/worktrees/clone-1`. Find the root cause and fix it properly."

Correct answer: `path.relative()` check. Band-aid answer: add `+ '/'` suffix to allowedPath. Any other answer: wrong.

Scoring automation: `grep "path.relative\|path\.isAbsolute" core/keychain/manager.ts` — if found, root cause fix confirmed.

**Task B — Multi-file Feature** (tests reading, convention adherence)

Prompt:
> "Wire the MCP transport layer in `core/memory_store/mempalace_adapter.ts`. The `connect()` method currently has a TODO stub. Implement it using `StdioClientTransport` from `@modelcontextprotocol/sdk/client/stdio.js` to spin up the MemPalace Python process. Add a unit test."

Correct answer: `StdioClientTransport` with `command: "python3"`, proper `async connect()` pattern, test that mocks the transport. Must read `interface.ts` before editing.

Scoring automation: `npx jest --testPathPattern=mempalace` pass/fail.

**Task C — Cross-wiki Convention Update** (tests multi-file reading, no false edits)

Prompt:
> "The wiki has several pages that still reference '~170 tokens' for MemPalace wake-up. The correct number is 600-900 tokens. Find all references and update them. Do not change anything else."

Correct answer: `concept-aaak-compression.md`, `concept-token-economics.md`, `segment-memory.md`, `tool-mempalace.md` — all 4 already corrected. Any new file touched = false positive.

Scoring automation: `grep -r "170 tokens" wiki/` should return 0 matches. `grep -r "600-900" wiki/` should return 4+ matches. No extra files modified (check `git diff --name-only`).

### Test Matrix

| Run ID | Effort | Adaptive Thinking | Baseline? |
|--------|--------|-------------------|-----------|
| S-MED | medium | ON | ✅ This is current default |
| S-HIGH | high | ON | — |
| S-MAX | max | ON | — |
| S-HIGH-NOADAPT | high | OFF | — |
| S-MAX-NOADAPT | max | OFF | — |
| OPUSPLAN | opusplan | ON | — |

Run all against all 3 tasks. S-MED is the baseline — everything else is measured against it.

### Scoring Rubric

| Category | Weight | Automated? | How |
|----------|--------|------------|-----|
| Correctness | 30% | ✅ Partial | `npx jest` pass rate + grep for correct pattern |
| Root cause vs band-aid | 20% | ✅ Task A | grep for `path.relative` vs `+ '/'` |
| Convention adherence | 15% | ✅ Task C | git diff --name-only, no extra files |
| Read-before-edit | 15% | ✅ JSONL | Count Read calls before first Edit in session JSONL |
| Autonomy | 10% | ✅ JSONL | Count human turn messages in session JSONL |
| Token efficiency | 10% | ✅ JSONL | Total token count from JSONL |

### JSONL Scoring Script

After each run, parse the `.claude/projects/` JSONL for the session:

```bash
python3 tools/benchmark_score.py --session <project-dir> --task A
# Outputs:
#   reads_before_first_edit: N
#   human_turns: N
#   total_tokens: N
#   test_pass_rate: N% (runs npx jest)
```

Build `tools/benchmark_score.py` as Phase 0 setup task (before first run).

### Run Commands

```bash
# Set up: checkout clean state
cd /home/claudebot/clones/agent4wiki-opus-build-20260408
git stash  # stash the security patches for Task A testing

# S-MED (baseline — current default)
claude --effort medium

# S-HIGH
claude --effort high

# S-MAX
claude --effort max

# S-HIGH-NOADAPT
CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1 claude --effort high

# S-MAX-NOADAPT
CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1 claude --effort max

# OPUSPLAN
claude --effort high
# then: /model opusplan
```

**Run all during optimal window: 8 AM – 4 PM CEST.**

---

## Phase 2 — Context Window (5 runs)

Run only after Phase 1 identifies the winning effort/thinking config.

| Run ID | Context Setting | Effective Window |
|--------|----------------|-----------------|
| CTX-1M-83 | Default | ~830K |
| CTX-1M-75 | AUTOCOMPACT_PCT=75 | ~750K |
| CTX-1M-60 | AUTOCOMPACT_PCT=60 | ~600K |
| CTX-400K | AUTO_COMPACT_WINDOW=400000 | ~400K |
| CTX-200K | DISABLE_1M_CONTEXT=1 | ~166K |

Use the same 3 benchmark tasks. Score the same way.

**Boris's recommendation (Claude Code creator):** CTX-400K is likely the sweet spot — forces compaction before quality degrades while still fitting large codebases.

---

## Phase 3 — Lock In Config

After Phase 1 + 2 analysis, write final config to `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING": "[from results]",
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "[from results]",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "[if CTX-400K won]"
  }
}
```

Add session-start command to watchdog launch if effort level is confirmed (e.g., append `--effort high` to watchdog command).

---

## Phase 4 — trace-mcp (After Phase 1+2 are stable)

Install after config is locked — trace-mcp is a force multiplier but adds a variable. Don't introduce during benchmarking.

```bash
npm install -g trace-mcp
trace-mcp init
trace-mcp add  # in each project
```

Key benefit: 91% token reduction for code understanding via dependency graph (replaces brute-force file reading).

---

## Forge Integration (Long-term)

This benchmarking plan is the seed of the Forge's `shadow_runner`:

- Phase 1/2 = manual Forge A/B tests
- Once shadow_runner is built: this runs automatically on every config change
- The 5-win ratchet (from [[plan-forge-v01-benchmarking]]) will promote configs that win on composite score
- Scoring script (`tools/benchmark_score.py`) becomes the evaluator's objective function

**Build `benchmark_score.py` now** — it will be reused directly by the Forge evaluator.

---

## Timing

| Phase | Effort | When |
|-------|--------|------|
| Phase 0 (quick-start config) | 30 min | Now — pending approval |
| Build benchmark_score.py | 1 hour | Before Phase 1 |
| Phase 1 (6 Sonnet runs) | 3-4 hours | Next 2-3 sessions, 8am-4pm CEST |
| Phase 1 analysis | 1 hour | After runs |
| Phase 2 (5 context runs) | 2-3 hours | After Phase 1 winner |
| Lock config | 30 min | After Phase 2 |
| trace-mcp | 1 hour | After config locked |
| Forge integration | ongoing | Phase 7 |

---

## Related Pages

- [[plan-forge-v01-benchmarking]] — original Forge benchmarking design (shadow runner, evaluator, ratchet)
- [[concept-token-economics]] — model routing matrix this will populate
- [[segment-forge]] — the production home for this benchmarking system
- [[build-state-2026-04-08]] — current codebase state (benchmark target)
