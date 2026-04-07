# Review: Opus Review 4 — Directory Structure + Gitignore

> Source: raw/Opus-review4-file-structure.md | Reviewer: Claude Opus

## What's Right

- Three-zone separation (core/ = code, state/ = vault, wiki/ = brain OS) is correct
- TypeScript commitment explicit with package.json, tsconfig.json, bin/agent4.ts
- Phased numbering in directory shows build order
- `core/routing/classifier.ts` flagged as new/important — confirmed missing from original spec
- Gitignore defense-in-depth approach: state/** blanket + .gitkeep exceptions + state/worktrees/*/.env safety net

## Issues Applied

### 1. Gitignore additions

Added to `.gitignore`:
```
*.dispatcher-prompt.md       # Dispatcher runtime artifacts
events/*.jsonl               # Event logs (high-volume, not for git history)
__pycache__/ *.py[cod] .venv/  # Python artifacts for MCP/MemPalace tooling
*.vault.bak *.vault.tmp      # Vault backup temporaries
```

> Applied to: `.gitignore`

### 2. events/ directory created

Dispatcher logs to `events/dispatcher.jsonl`. Forge reads event streams. Janitor writes audit events. No `events/` directory existed. Created `events/.gitkeep` — the .gitignore blocks `events/*.jsonl` so only the directory structure commits, not the log files.

Decision: `events/` at repo root (not under state/) — event history may be useful in git when debugging, and logs contain no secrets (only task IDs, directives, timestamps).

### 3. core/keychain/config/ — stub YAMLs committed

Config files (scopes.yaml, fallback.yaml, patterns.yaml, rotation.yaml) are committed code, not secrets. Created with full structure:
- `scopes.yaml` — which keys + endpoints each skill type can access
- `fallback.yaml` — degradation chains when a credential is unavailable
- `patterns.yaml` — regex patterns for leak detection (used by scanner.ts)
- `rotation.yaml` — rotation schedule, last_rotated, reminder window

> Applied to: `core/keychain/config/`

### ⚠️ Structural Note: Worktrees Inside Repo

Placing worktrees in `state/worktrees/` creates nested git state inside the repo. Standard pattern is sibling directories:
```
~/
├── agent4/            ← the repo
└── .agent4-worktrees/ ← worktrees (outside repo, no nesting)
```

**Decision: defer.** The current .gitignore blocks state/* cleanly and git worktrees reference the parent .git via a `.git` file (not a directory), so nesting works. The risk is git command confusion in edge cases. Revisit in Phase 5 when CloneSpawner is implemented — change `ALLOWED_WORKTREE_PATH` env var to point outside the repo at that time.

### ⚠️ Soul.md — Two-File Split

**Issue:** wiki/Soul.md (committed, public) may expose personal communication patterns if repo is public.

**Recommended approach:**
- `wiki/Soul.md` — generic voice, values, operating constraints (committed, safe for public)
- `state/user_agent/soul-private.md` — personal communication patterns, private context (gitignored)
- Clone Mission Briefs inject both files when available

**Decision: current wiki/Soul.md is generic enough** — no personal details. If repo goes public, add `state/user_agent/soul-private.md` for the personal layer. No change needed now.

## Cross-File Status Summary (from Opus 4)

| Component | Status |
|-----------|--------|
| Memory interface | Contract defined ✓ |
| Keychain | MVP logic + config stubs ✓ |
| TASK template | Complete with lifecycle ✓ |
| Janitor | Auditor V2 + WikiScythe ✓ |
| Directory structure | Complete scaffold ✓ |
| Gitignore | Security-hardened ✓ |
| Dispatcher | Working Python MVP ✓ |
| events/ | Created ✓ |
| keychain/config/ | Stub YAMLs ✓ |
