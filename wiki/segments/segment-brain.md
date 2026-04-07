# Brain — The Architect

> Segment 3 of 6. Principle: Start fresh. Plan precisely. Delegate everything. Never execute.

## Role

Orchestrator that starts from `/new` each session, reconstructs context from [[segment-memory]] wiki + [[segment-user-agent]] state, plans, and delegates to [[segment-clones]] via [[concept-mission-briefs]].

## Session Startup Sequence

1. `/new` — clean context
2. Pull `memory/wiki/index.md` — scan what exists
3. Pull `user/state.json` — current priorities and intent
4. Pull MemPalace wake-up context (~170 tokens [[concept-aaak-compression]]) — critical facts
5. Pull `user/soul.md` — voice consistency ([[concept-soul-md]])
6. Build plan → delegate to clones

## Core Responsibilities

### Planning & Decomposition
Receives task (via [[entity-telegram-bots]] or direct). Decomposes into subtasks with dependency graph. Identifies which [[concept-clone-skill-templates]] are needed. Creates batches for parallel execution.

### Mission Brief Creation
Each clone gets a precision-crafted brief — not a conversation. Brief includes: objective, context (from wiki), constraints, output format, success criteria, credentials (requested from [[tool-keychain-agent]]), [[concept-soul-md]] reference. See [[concept-mission-briefs]].

### Clone Dispatch via Git Worktrees
`git worktree add ../project-clone-{skill}-{task} -b task/{task-name} main`. Each worktree gets CLAUDE.md, TASK.md, relevant wiki pages. Clone launches as Claude Code session. Multiple run in parallel. See [[concept-git-worktrees]].

### File Registry
Living registry of every file, its purpose, last modifier. Tracks all repos and status. Ensures clones don't recreate or conflict.

### Result Integration
Reviews clone outputs. Merges branches. Runs atomize pass (outputs → wiki pages). Updates [[segment-memory]]. Grades clone performance for [[segment-forge]] template improvement.

## Architecture Rule

**If the Brain is doing work (writing code, editing files, running commands), the architecture is broken.** See [[decision-brain-never-executes]].

## Token Strategy

Full context budget per session. Spends tokens on planning, not executing. Cloud API (Claude/Opus or Claude/Sonnet) — this is where model quality matters most. See [[concept-token-economics]].

## Key Files

| File | Purpose |
|------|---------|
| `brain/plan.json` | Current execution plan with task tree |
| `brain/registry.json` | All repos, files, purposes, last modifier |
| `brain/clones/` | Active mission briefs |
| `brain/batches/` | Grouped tasks for parallel execution |
| `brain/templates/` | Clone instruction templates by skill |
