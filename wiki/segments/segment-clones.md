# Clones — Special Ops

> Segment 4 of 6. Principle: One mission. Perfect execution. Continuous improvement.

## Role

Stateless specialist executors. Each clone gets a [[concept-mission-briefs|mission brief]] and delivers results. Disposable — kill it, restart it, the brief survives.

## Execution Model

Each clone is a fresh Claude Code session in a [[concept-git-worktrees|git worktree]]. Receives mission brief with full context, constraints, and success criteria. Executes, commits results, logs decisions. Gets killed after mission completion or kept alive for continuous tasks where context is important or where the task require multiple steps needing the clone.

## Skill Model — One Agent, One Mission, One Skill Set

Each clone carries **1 primary skill + 1-3 complementary skills** for its specific mission. When a task crosses a domain boundary, control passes to a new clone with a different skill set — not more skills loaded into the same agent.

This makes the [[concept-skill-budget|28-skill ceiling]] irrelevant at the clone level. Each clone will never approach it with 1-5 focused skills.

**Skill provisioning** is part of the clone lifecycle: the spawner reads `required_skills` from the task JSON and copies only those skills from the library into the worktree's `.claude/skills/`. The clone session starts with exactly and only what it needs.

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

See [[concept-clone-skill-templates]] for how templates work and improve. See [[review-skills-playbook]] for security rules (graduation pipeline, Docker sandbox, Nemotron scan).

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
