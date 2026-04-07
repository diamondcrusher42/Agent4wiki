// core/clones/spawner.ts
// Phase 5 deliverable — Clone lifecycle management
//
// Creates git worktrees for clone execution, triggers setup.sh,
// and registers the clone in the active worktrees registry.
// Works alongside core/keychain/manager.ts (JIT credential injection).
//
// Language note: root brain/dispatcher.py handles the watch loop (Python,
// MVP exception). This TypeScript module handles the worktree mechanics
// called by the Keychain manager. See [[decision-typescript-python]].

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const WORKTREES_PATH = process.env.ALLOWED_WORKTREE_PATH || './state/worktrees';

export interface WorktreeHandle {
  cloneId: string;
  path: string;
  branch: string;
  createdAt: Date;
}

export class CloneSpawner {
  /**
   * CREATE WORKTREE — isolated git worktree for clone execution.
   * Copies the appropriate Mission Brief template into place.
   * Returns the worktree path for Keychain injection.
   */
  public async createWorktree(cloneId: string, templateName: string): Promise<WorktreeHandle> {
    const branch = `clone/${cloneId}`;
    const worktreePath = path.join(WORKTREES_PATH, cloneId);

    // TODO: git worktree add <path> -b <branch>
    // TODO: copy core/clones/templates/<templateName> → worktreePath/TASK.md
    // TODO: write setup.sh (npm/pip install for clone's dependencies)
    // TODO: register in state/worktrees/registry.json

    throw new Error('CloneSpawner.createWorktree() not yet implemented — Phase 5 in progress');
  }

  /**
   * TEARDOWN WORKTREE — called by Janitor after NOTE or BLOCK resolution.
   * Removes the worktree directory and deletes the branch.
   */
  public async teardownWorktree(handle: WorktreeHandle): Promise<void> {
    // TODO: git worktree remove <path> --force
    // TODO: git branch -d <branch>
    // TODO: remove from registry
    throw new Error('CloneSpawner.teardownWorktree() not yet implemented');
  }
}
