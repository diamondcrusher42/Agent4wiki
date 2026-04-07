# Janitor — The Muscle

> Segment 5 of 6. Principle: Doubt everything. Simplify ruthlessly. Leave it cleaner than you found it.

## Role

Adversarial auditor. Prunes, challenges, simplifies, and enforces quality across the entire system. Runs on schedule AND on-demand after major changes.

## Audit Domains

### File Audits
Dead code, unused files, stale configs, bloated prompts. CLAUDE.md drift. File registry accuracy. Naming conventions. [[concept-git-worktrees|Git worktree]] cleanup.

### Memory/Wiki Audits
Contradictions between wiki pages. Stale claims. Orphan pages. Missing cross-references. Data gaps fillable by [[tool-last30days]] research. [[tool-mempalace]] contradiction detection validation.

### Clone Audits
[[concept-mission-briefs|Mission brief]] quality. Result quality grading. Skill drift detection. Manual repetition detection → flag as new skill candidates (from [[tool-ai-personal-os]] cos-review pattern).

### Security Audits
Credential exposure via [[tool-keychain-agent]] scanner. Service health. .env permissions. API key rotation reminders.

### System Health Scoring
Quantified 0-25 scale. Tracks over time. Bi-weekly review with ONE highest-leverage action. Quick 30-second status: ✅/⚠️/❌ per component.

## Severity Framework

From [[tool-hstack]] patterns:
- 🔴 RED: Act now — service down, security issue, data loss risk
- 🟡 YELLOW: Plan to fix — stale data, quality drift, approaching limits
- 🟢 GREEN: Fine — no action needed

## Directives

| Directive | Meaning |
|-----------|---------|
| REMOVE | Dead code, stale files, orphan pages |
| SIMPLIFY | Bloated prompts, over-complex structures |
| MERGE | Redundant pages, duplicate configs |
| UPDATE | Stale claims, outdated references |
| CHALLENGE | "Why does this exist? Can it be simpler?" |

## ⚠️ Known Risk: Ping-Pong Deadlock

> Flagged by: [[review-gemini-review1]]

The Janitor's "doubt everything" mandate creates a deadlock risk. If a Clone completes a mission and the Janitor rejects the output, the Brain re-delegates. Without a circuit breaker, the Brain-Clone-Janitor triangle retries indefinitely, burning tokens with no resolution.

**Required safeguards:**
- Max retry count per mission (default: 3) before escalating to user
- Janitor directives must be tiered: BLOCK (re-delegate) vs SUGGEST (accept + flag for improvement)
- Rejection reason must be specific enough for the Brain to write a materially different brief — vague rejections must be treated as SUGGEST, not BLOCK
- Circuit breaker: if same mission fails N times with identical Janitor pattern, route to human

## ⚠️ Irreversible Actions — Mandatory Human Gate

> Flagged by: [[review-gemini-review4]]

The BLOCK/SUGGEST/NOTE tiers handle Janitor rejection loops. But actions with external side effects (dropping production databases, mass email sends, payroll processing, public posts) cannot be retried on failure — they need a hard gate **before execution**.

**Action classification required at mission brief time:**

| Type | Examples | Gate |
|------|----------|------|
| Reversible | Code changes, draft docs, local edits | BLOCK/SUGGEST/NOTE tiers apply |
| Irreversible / external | Money, mass sends, public posts, prod data destruction | Mandatory "Escalate to Human" via Telegram before execution |

Clones must not proceed past an irreversible action without explicit human approval. The Janitor tags mission briefs with action classification at dispatch time.

## ⚠️ Janitor vs. Forge Territory Rule

> Flagged by: [[review-opus-review1]]

Both the Janitor and the Forge audit clone quality and propose improvements. Without a hard rule, they conflict over what "better" means.

**Rule: Janitor is reactive. Forge is proactive. They never modify the same thing in the same cycle.**
- Janitor runs first — identifies problems in what currently exists
- Forge runs after — builds alternatives to what exists
- **Janitor can veto a Forge promotion** if it introduces a quality regression vs. prior baseline

## Token Strategy

[[tool-bitnet]] on CPU for routine passes. Cloud API for judgment calls. Budget allocated to thoroughness, not frequency.

## Interfaces

- → [[segment-memory]]: prune commands, integrity reports
- → [[segment-brain]]: audit findings, prioritized actions
- → [[segment-user-agent]]: health check results
- → [[segment-clones]]: quality feedback, skill improvement notes
- ← [[segment-forge]]: the Forge audits the Janitor's audit
- ← All: reads everything, trusts nothing
