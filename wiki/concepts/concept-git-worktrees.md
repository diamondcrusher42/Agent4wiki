# Git Worktrees

> Source: Medium article by Dogukan Tuna on parallel Claude Code development.

`git worktree` checks out multiple branches into separate physical directories, all linked to the same repository. Each directory has complete file isolation while sharing git history.

In this architecture, [[segment-brain]] creates worktrees for [[segment-clones|clone]] execution: `git worktree add ../project-clone-{skill}-{task} -b task/{task-name} main`. Each worktree gets CLAUDE.md (from [[concept-clone-skill-templates|skill template]]), TASK.md ([[concept-mission-briefs|mission brief]]), and relevant wiki pages.

Multiple clones run simultaneously on different branches. No context switching. No interference. Clean merge back to main when done. [[segment-janitor]] handles cleanup of merged/stale worktrees.

[[segment-forge]] also uses worktrees for [[concept-shadow-benchmarking|shadow runs]] — shadows never interfere with production clones.
