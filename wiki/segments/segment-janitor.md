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

## Token Strategy

[[tool-bitnet]] on CPU for routine passes. Cloud API for judgment calls. Budget allocated to thoroughness, not frequency.

## Interfaces

- → [[segment-memory]]: prune commands, integrity reports
- → [[segment-brain]]: audit findings, prioritized actions
- → [[segment-user-agent]]: health check results
- → [[segment-clones]]: quality feedback, skill improvement notes
- ← [[segment-forge]]: the Forge audits the Janitor's audit
- ← All: reads everything, trusts nothing
