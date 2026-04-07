// core/clones/lifecycle/teardown.ts
// Phase 5 — CRITICAL: Clone worktree cleanup
//
// Called after Janitor issues NOTE (merge) or after BLOCK resolution.
// Even if the clone crashed catastrophically, teardown.ts must run.
// Guarantee: KeychainManager.executeCloneMission() wraps the full lifecycle
// in try/finally — teardown is called even on exception.
//
// Teardown sequence:
//   1. Revoke credentials (Keychain.revokeEnvironment) — already done by Keychain manager
//   2. If NOTE directive: commit the clone's code to main branch
//   3. git worktree remove <path> --force
//   4. git branch -d <branch> (prune the temporary branch)
//   5. Remove from worktrees registry

import { spawn } from 'child_process';
import { WorktreeHandle } from './spawner';
import { AuditDirective } from '../../janitor/auditor';

export class CloneTeardown {
  /**
   * TEARDOWN — the most critical step in the clone lifecycle.
   * Orphaned worktrees eat storage. Leaked credentials are a security breach.
   * This must complete even if everything else failed.
   */
  public async teardown(
    handle: WorktreeHandle,
    directive: AuditDirective
  ): Promise<void> {
    // 1. Merge code if Janitor approved (NOTE directive)
    if (directive === AuditDirective.NOTE) {
      await this.mergeWorktree(handle);
    }

    // 2. Remove worktree (always — regardless of directive)
    await this.removeWorktree(handle);

    // 3. Prune git branch
    await this.pruneBranch(handle.branch);
  }

  private async mergeWorktree(handle: WorktreeHandle): Promise<void> {
    // TODO: git -C <worktree> add -A
    // TODO: git -C <worktree> commit -m "feat(clone/<id>): <objective>"
    // TODO: git -C <repo-root> merge <branch> --no-ff
    throw new Error('CloneTeardown.mergeWorktree() not yet implemented — Phase 5 in progress');
  }

  private async removeWorktree(handle: WorktreeHandle): Promise<void> {
    // TODO: git worktree remove <handle.path> --force
    // Force is required — clone may have left uncommitted files
    throw new Error('CloneTeardown.removeWorktree() not yet implemented — Phase 5 in progress');
  }

  private async pruneBranch(branch: string): Promise<void> {
    // TODO: git branch -d <branch>
    // Use -d (safe delete) not -D — if merge happened, -d is sufficient
    throw new Error('CloneTeardown.pruneBranch() not yet implemented — Phase 5 in progress');
  }
}
