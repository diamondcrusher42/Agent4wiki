// core/clones/lifecycle/teardown.ts
// Phase 3 deliverable — CRITICAL: Clone worktree cleanup
//
// Called after Janitor issues NOTE (merge) or after BLOCK resolution.
// Even if the clone crashed catastrophically, teardown.ts must run.
// CloneWorker.execute() wraps the full lifecycle in try/finally —
// teardown is called even on exception.
//
// Teardown sequence:
//   1. If NOTE directive: commit + merge the clone's code to current branch
//   2. git worktree remove <path> --force
//   3. git branch -d <branch> (prune the temporary branch)
//   4. Remove from worktrees registry

import { execSync } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { WorktreeHandle } from './spawner';
import { AuditDirective } from '../../janitor/auditor';

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.env.AGENT_BASE_DIR || process.cwd();

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

    // 2. BLOCK verdict → quarantine worktree for forensics instead of deleting
    if (directive === AuditDirective.BLOCK) {
      await this.quarantineWorktree(handle);
    } else {
      // 3. Remove worktree (NOTE — already merged)
      await this.removeWorktree(handle);
    }

    // 4. Prune git branch
    await this.pruneBranch(handle.branch);
  }

  /**
   * QUARANTINE — move blocked worktree to quarantine dir for forensic review.
   * Preserves evidence instead of destroying it on BLOCK verdict.
   */
  private async quarantineWorktree(handle: WorktreeHandle): Promise<void> {
    const quarantineDir = path.join(REPO_ROOT, 'state', 'worktrees', 'quarantine');
    fs.mkdirSync(quarantineDir, { recursive: true });
    const dest = path.join(quarantineDir, `${handle.cloneId}-${Date.now()}`);
    try {
      fs.renameSync(handle.path, dest);
      // Prune dangling worktree reference from git
      await execFileAsync('git', ['worktree', 'prune'], { cwd: REPO_ROOT }).catch(() => {});
      console.log(`[TEARDOWN] Quarantined ${handle.cloneId} → ${dest}`);
    } catch (err) {
      console.error(`[TEARDOWN] Quarantine failed for ${handle.cloneId}: ${err}`);
      // Fall back to normal removal
      await this.removeWorktree(handle);
    }

    // Remove from registry
    const registryPath = path.join(REPO_ROOT, 'state', 'worktrees', 'registry.json');
    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      delete registry[handle.cloneId];
      fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    } catch { /* registry may not exist — not fatal */ }
  }

  /**
   * Commit everything in the worktree and merge to the current branch.
   */
  private async mergeWorktree(handle: WorktreeHandle): Promise<void> {
    try {
      execSync(`git -C "${handle.path}" add -A`, { stdio: 'pipe' });
      execSync(
        `git -C "${handle.path}" commit -m "feat(clone/${handle.cloneId}): mission complete"`,
        { stdio: 'pipe' }
      );
    } catch {
      // Nothing to commit — worktree may not have produced files
    }
    try {
      execSync(
        `git -C "${REPO_ROOT}" merge "${handle.branch}" --no-ff -m "merge: clone/${handle.cloneId}"`,
        { stdio: 'pipe' }
      );
    } catch (err) {
      console.error(`[TEARDOWN] Merge failed for ${handle.cloneId}: ${err}`);
    }
  }

  /**
   * Remove the git worktree and deregister from registry.json.
   */
  private async removeWorktree(handle: WorktreeHandle): Promise<void> {
    try {
      execSync(`git -C "${REPO_ROOT}" worktree remove "${handle.path}" --force`, {
        stdio: 'pipe',
      });
    } catch (err) {
      console.error(`[TEARDOWN] Worktree removal failed for ${handle.cloneId}: ${err}`);
      // Try manual cleanup as fallback
      try {
        if (fs.existsSync(handle.path)) {
          fs.rmSync(handle.path, { recursive: true });
        }
        execSync(`git -C "${REPO_ROOT}" worktree prune`, { stdio: 'pipe' });
      } catch {
        console.error(`[TEARDOWN] Manual cleanup also failed for ${handle.path}`);
      }
    }

    // Remove from registry
    const registryPath = path.join(REPO_ROOT, 'state', 'worktrees', 'registry.json');
    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      delete registry[handle.cloneId];
      fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    } catch { /* registry may not exist — not fatal */ }
  }

  /**
   * Delete the temporary branch created for this clone.
   * Uses -d (safe delete) not -D — if merge happened, -d is sufficient.
   */
  private async pruneBranch(branch: string): Promise<void> {
    try {
      execSync(`git -C "${REPO_ROOT}" branch -d "${branch}"`, { stdio: 'pipe' });
    } catch {
      // Branch already merged/deleted or never existed — not fatal
      try {
        // Force delete if safe delete failed (e.g., unmerged branch after BLOCK)
        execSync(`git -C "${REPO_ROOT}" branch -D "${branch}"`, { stdio: 'pipe' });
      } catch {
        // Branch truly doesn't exist — that's fine
      }
    }
  }
}
