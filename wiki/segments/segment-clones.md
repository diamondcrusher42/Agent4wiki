# Clones — Special Ops

> Segment 4 of 6. Principle: One mission. Perfect execution. Continuous improvement.

## Role

Stateless specialist executors. Each clone gets a [[concept-mission-briefs|mission brief]] and delivers results. Disposable — kill it, restart it, the brief survives.

## Execution Model

Each clone is a fresh Claude Code session in a [[concept-git-worktrees|git worktree]]. Receives mission brief with full context, constraints, and success criteria. Executes, commits results, logs decisions. Gets killed after mission completion or kept alive for continuous tasks where context is important or where the task require multiple steps needing the clone.

## Skill Specializations

| Skill | Template | Primary Model | Use Case |
|-------|----------|--------------|----------|
| Code | `brain/templates/code.md` | Claude (cloud) | Feature development, bug fixes |
| Docs | `brain/templates/docs.md` | Claude (cloud) | Documentation, wiki maintenance |
| Research | `brain/templates/research.md` | Claude + [[tool-last30days]] | Market research, trends |
| DevOps | `brain/templates/devops.md` | Claude (cloud) | Infrastructure, deployment |
| QA | `brain/templates/qa.md` | [[tool-bitnet]] (local) | Testing, linting, code review |
| Health | `brain/templates/health.md` | Claude (cloud) | Supplement research, bloodwork ([[tool-hstack]] patterns) |
| Accounting | `brain/templates/accounting.md` | Claude (cloud) | Multi-entity reconciliation |
| Telegram | `brain/templates/telegram.md` | Claude (cloud) | Bot development |

See [[concept-clone-skill-templates]] for how templates work and improve.

## Model Tiering

- Cloud API (Claude/Opus or Claude/Sonnet): mission-critical, complex code, creative
- GPU (Nemotron on [[entity-hardware|RTX 3090]]): specialized, sensitive data
- CPU ([[tool-bitnet]] 2B): routine QA, linting, formatting, scanning — truly unlimited parallel clones

See [[concept-token-economics]].

## Clone Collaboration

Clones request help from other skill-agents via structured messages through [[segment-memory]]. Research clone feeds Code clone. QA clone reviews Code clone output. [[segment-brain]] orchestrates the sequence.

## Improvement Loop

Every result graded by [[segment-forge]]: did it meet the brief? What could improve? Post-mission learnings feed back into [[concept-clone-skill-templates]]. [[segment-janitor]] periodically reviews output quality.

## Token Strategy

Full budget per mission. No wasted tokens on context discovery — everything pre-loaded in mission brief. See [[concept-token-economics]].
