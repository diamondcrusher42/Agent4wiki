# Review: Gemini Review 7 — Current State Deep Dive

> Source: raw/Gemini-review7-current-state.md | Reviewer: Gemini | Scope: full repo post-audit

## What's Validated ✓

### Inbox dispatch pattern — "Brilliant"
Using `brain/inbox/*.json` as a decoupled filesystem queue between TypeScript core and Python dispatcher is explicitly validated. Key properties Gemini highlights:
- **Resilience**: if a clone crashes, the JSON is still there — daemon can retry
- **Fleet-ready**: same pattern works across multiple machines with a shared inbox
- **No infrastructure**: no Redis, no WebSocket, no message broker needed

This is the foundation the distributed fleet concept builds on.

### The Bridge (Telegram) — "Massive productization leap"
"Console is invisible" validated as a strategic shift: developer CLI → always-on digital employee. Accessible from phone while away from PC.

### Bootstrap scripts — "Proves you're building for a real fleet"
One-command spin-up validated as the right abstraction level.

### Clone Template V2
BLOCKED_IMPOSSIBLE + network scoping gives the Janitor "exact telemetry to halt infinite loops" — confirmed as the right design.

---

## Blind Spots Identified

### 1. The Python/TypeScript boundary — missing glue

The User Agent's `handleUserInput()` is not connected to the inbox. **Today, a human must manually write `test-001.json` and drop it in `brain/inbox/`.** This is the critical gap between "system that works when you poke it" and "autonomous agent."

**The precise bridge missing:**
```
Telegram message arrives
  → ComplexityClassifier → FULL_PIPELINE
    → User Agent auto-generates task.json
      → writes to brain/inbox/
        → Python dispatcher picks it up
```

Currently: the User Agent classifies but returns a placeholder string. It never writes to inbox.

> Already in audit (#structural): documented as "User Agent triggerFullPipeline() is a stub". Gemini makes the bridge direction explicit — the TS User Agent writes JSON files that the Python daemon reads.

### 2. Keychain vault stub

`loadMasterVault()` returns `{}`. Empty vault = empty .env injected into worktrees = clone fails on first API call. Nothing runs without this.

> Already in audit (issue #4). Gemini adds a concrete validation test: **verify the clone's worktree receives a populated .env file AND that it is destroyed after execution**.

### 3. Janitor disconnection

`dispatcher.py` doesn't call the Janitor after clone finishes. Currently everything is COMPLETED or FAILED — the BLOCK/SUGGEST/NOTE directive system is bypassed.

> Already in audit (issue #13). Gemini frames this as "Step 4: Close the Janitor Loop."

---

## Action Plan (Gemini's Prioritization)

Gemini's ordering differs slightly from the audit's Phase 0-5 plan. Key insight: **Steps 1+2 alone give you the first end-to-end autonomous loop.**

| Step | Task | Maps to Audit |
|------|------|---------------|
| 1 | Implement `loadMasterVault()` — read from `.env` or SQLite vault | Phase 2 (credential system) |
| 2 | Wire `handleUserInput()` → auto-generate task.json → `brain/inbox/` on FULL_PIPELINE | Phase 1 + Phase 3 |
| 3 | Implement `PromptBuilder.build()` + Sequential Thinking MCP | Phase 4 (Brain planning) |
| 4 | Add Janitor integration to `brain/dispatcher.py` | Phase 1 (dispatcher fixes) |

### "This week" path — Steps 1 + 2 only

**Step 1 (1-2 days):** Implement `loadMasterVault()` — minimum viable: read credentials from `.env` file in memory (not full AES-256 yet — that can come later). Validate with the worktree .env populated/destroyed test.

**Step 2 (1-2 days):** In `core/user_agent/agent.ts`, `triggerFullPipeline()` generates and writes a `brain/inbox/task-<uuid>.json`. Content: objective from prompt, skill inferred by classifier, required_keys from scopes.yaml, default constraints. No Brain planning yet — the task.json is minimal but valid.

Result: **Telegram message → task.json written → Python dispatcher picks it up → clone runs → result (even if Janitor-less)**. First autonomous loop.

### New architectural clarification — the TS→Python bridge direction

> This was implicit before; Gemini makes it explicit:

The TypeScript User Agent **writes** task JSON files. The Python dispatcher **reads** them. The bridge is filesystem-mediated, unidirectional, and decoupled. This means:
- TS and Python never directly call each other
- The inbox is the API contract between them
- A TS bug can't crash the Python daemon (and vice versa)

This should be documented as a formal architecture decision.

---

## Verdict

> "You are incredibly close. The skeleton is fully standing."

Gemini's assessment matches the audit: the architecture is sound, the contracts are well-defined, the gaps are specific and small. The two blocking items are both 1-2 day implementations, not architectural redesigns.

*See also: [[review-code-audit-1]], [[concept-dispatcher]], [[segment-user-agent]], [[segment-brain]]*
