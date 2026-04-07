# Review — Gemini Review 3: Implementation Plan Validation

> Source: `raw/Gemini-review3-Implementation.md` | Created: 2026-04-07
> Reviewer: Gemini
> Subject: [[plan-implementation-v4]]

---

## Overall Verdict

**Rock-solid.** The V4 plan takes the theoretical architecture and maps it to a cold, sequential engineering reality. The interface abstraction, security firewall, complexity classifier, and Janitor directive tiers are each independently praised as correct architectural calls.

---

## What the Reviewer Confirmed as Bulletproof

### 1. MemoryStore Interface Abstraction (Phase 1)
Abstracting MemPalace behind a `MemoryStore` interface on day one is the single smartest move. If MemPalace breaks or gets abandoned, only one file needs rewriting instead of the entire memory foundation.

### 2. Security Firewall (Phase 2)
Making the Keychain Agent a hard blocker is critical. `allowedPaths` per worktree guarantees a rogue or hallucinating clone never defaults to a top-level directory and reads `.claude.json` configs or scans the downloads folder. Locking this down first ensures every clone spawned downstream operates in a strict sandbox.

### 3. Complexity Classifier (Phase 3)
Massive upgrade to token economics. Routing simple queries directly — bypassing the Brain-Clone-Janitor loop — kills round-trip latency for basic commands.

### 4. Janitor Directive Tiers (Phase 6)
BLOCK / SUGGEST / NOTE tiers are the exact fix for the Ping-Pong Deadlock. Passing tasks with a NOTE keeps momentum going. The 3-failure circuit breaker to a human is confirmed as correct fail-safe design.

---

## Strategic Tweaks — New Findings

### Tweak 1 — MemoryStore Async Latency (Phase 1)

> **Finding:** The `MemoryStore` interface must be designed to handle async latency gracefully.

MemPalace running locally will be fast. But if it is ever swapped for a cloud-based vector database, memory retrieval could block the execution thread. The Phase 3 RTT classifier must account for this: if memory retrieval is async and slow, the classifier needs to know so it can route accordingly.

**Action:** Design `MemoryStore` interface with async-first signatures from day one. Add latency contract to the interface spec.

**Patches:** [[plan-implementation-v4]] Phase 1

---

### Tweak 2 — Phase 3 Classifier: No LLM (Phase 3)

> **Finding:** Using an LLM for the complexity classifier adds the latency it was designed to eliminate.

For the MVP, use simple heuristics or regex-based routing:
- If prompt contains `"search"`, `"summarize"`, `"run"`, `"fetch"` → send to Brain
- Otherwise → handle directly at User Agent

An LLM-based classifier re-introduces the round-trip overhead that tiered routing was meant to eliminate.

**Action:** MVP classifier = heuristics/regex only. LLM-based classifier deferred to Forge V1 as an upgrade candidate once baseline is measured.

**Patches:** [[plan-implementation-v4]] Phase 3, [[concept-token-economics]]

---

### Tweak 3 — Phase 4 Worktree Teardown (Phase 4)

> **Finding:** Creating git worktrees is fast. Cleaning them up is frequently forgotten.

Orphaned worktree directories accumulate on disk if there is no automated teardown. The worktree creation script must include an automated teardown or archival function triggered once the Janitor approves a task.

**Action:** Worktree creation script = `create + cleanup pair`. Janitor approval → teardown signal → worktree archived to `clones/archive/` or deleted. Add to Phase 4 deliverables.

**Patches:** [[plan-implementation-v4]] Phase 4, [[concept-git-worktrees]]

---

### Tweak 4 — Phase 5 Benchmarking Synergy (Phase 5)

> **Finding:** A/B template tracking + model splits = manually building the Capability Map.

The Phase 5 A/B template tracking and Sonnet/BitNet model splits produce exactly the data the Forge needs in Phase 7. The reviewer confirms this is not accidental — it is essentially bootstrapping the Capability Map by hand before the Forge automates it.

**Implication:** Phase 5 execution history is both clone infrastructure validation AND Forge seed data. Treat it as dual-purpose from day one. Log template variant, model used, and first-pass acceptance rate on every clone mission.

**Patches:** [[plan-implementation-v4]] Phase 5 (note only — already well-specified)

---

## Delta vs Prior Reviews

| Finding | Source | Status |
|---------|--------|--------|
| Ping-Pong Deadlock | [[review-gemini-review1]] | Addressed in plan (Phase 6) — confirmed correct |
| RTT latency | [[review-gemini-review1]] | Addressed — now strengthened: no LLM classifier |
| Filesystem scope attack | [[review-gemini-review1]] | Addressed in plan (Phase 2) — confirmed correct |
| MemoryStore dep risk | [[review-architecture-audit]] | Addressed — new: add async contract |
| Worktree cleanup | **New — this review** | Not previously flagged |
| Phase 5 as Forge seed | **New — this review** | Synergy note, no action required |

---

*See also: [[plan-implementation-v4]], [[review-architecture-audit]], [[review-gemini-review1]], [[concept-token-economics]], [[concept-git-worktrees]]*
