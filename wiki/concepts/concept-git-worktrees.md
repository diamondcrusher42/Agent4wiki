# Git Worktrees

> Source: Medium article by Dogukan Tuna on parallel Claude Code development.

`git worktree` checks out multiple branches into separate physical directories, all linked to the same repository. Each directory has complete file isolation while sharing git history.

In this architecture, [[segment-brain]] creates worktrees for [[segment-clones|clone]] execution: `git worktree add ../project-clone-{skill}-{task} -b task/{task-name} main`. Each worktree gets CLAUDE.md (from [[concept-clone-skill-templates|skill template]]), TASK.md ([[concept-mission-briefs|mission brief]]), and relevant wiki pages.

Multiple clones run simultaneously on different branches. No context switching. No interference. Clean merge back to main when done. [[segment-janitor]] handles cleanup of merged/stale worktrees.

[[segment-forge]] also uses worktrees for [[concept-shadow-benchmarking|shadow runs]] — shadows never interfere with production clones.

## ⚠️ Filesystem Scope — Security Requirement

> Flagged by: [[review-gemini-review1]]

Each worktree's Claude Code session must have its filesystem scope locked to the worktree directory + explicitly allowed outputs. A clone running with `~/` or higher as its working directory inherits access to `Desktop`, `Downloads`, `.ssh/`, `.claude.json`, and [[tool-keychain-agent]] vault files.

**Required per worktree:**
- Working directory: `~/clones/{clone-id}/` only — never above
- CLAUDE.md in each worktree must include `allowedPaths` restricted to worktree + approved read dirs
- `.claude/settings.json` per worktree: `"bash.allowedPaths": ["./", "/tmp/clone-outputs/"]`
- Clone launch command must not inherit parent session's filesystem permissions

This is a deployment configuration requirement, not a design change. See [[tool-keychain-agent]] for credential scoping (complementary, not sufficient on its own).
