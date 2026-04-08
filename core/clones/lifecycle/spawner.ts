// core/clones/lifecycle/spawner.ts
// Phase 3 deliverable — Clone lifecycle: worktree creation
//
// Creates git worktrees for clone execution, writes setup.sh,
// and registers the clone in the active worktrees registry.
// Works alongside core/keychain/manager.ts (JIT credential injection).

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const REPO_ROOT = process.env.AGENT_BASE_DIR || process.cwd();

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
   * Writes setup.sh for dependency installation.
   * Returns the worktree handle for Keychain injection + runner.
   */
  public async createWorktree(cloneId: string, skill: string): Promise<WorktreeHandle> {
    // B1: Validate cloneId to prevent shell injection
    if (!/^[\w-]+$/.test(cloneId)) {
      throw new Error(`[SPAWNER] Invalid cloneId "${cloneId}" — must match ^[\\w-]+$`);
    }
    const branch = `clone/${cloneId}`;
    const worktreePath = path.resolve(REPO_ROOT, 'state', 'worktrees', cloneId);

    // Ensure parent directory exists
    await fs.promises.mkdir(path.dirname(worktreePath), { recursive: true });

    // 1. Create git worktree
    execSync(`git worktree add "${worktreePath}" -b "${branch}"`, {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    });

    // 2. Copy mission brief template if available
    // Map skill to canonical template filename — code uses code-clone-TASK.md, others use <skill>-task.md
    const templateFilenameMap: Record<string, string> = { code: 'code-clone-TASK.md' };
    const templateFilename = templateFilenameMap[skill] ?? `${skill}-task.md`;
    const templateSrc = path.join(REPO_ROOT, 'templates', templateFilename);
    const templateDst = path.join(worktreePath, 'TASK.md');
    if (fs.existsSync(templateSrc)) {
      await fs.promises.copyFile(templateSrc, templateDst);
    }

    // 3. Write setup.sh — installs deps before the clone mission runs
    const setupScript = [
      '#!/bin/bash',
      'set -e',
      'cd "$(dirname "$0")"',
      '[[ -f package.json ]] && npm install --prefer-offline --no-audit --no-fund --silent',
      '[[ -f requirements.txt ]] && pip install -r requirements.txt --quiet',
      'echo "Setup complete."',
    ].join('\n') + '\n';
    await fs.promises.writeFile(
      path.join(worktreePath, 'setup.sh'),
      setupScript,
      { mode: 0o755 }
    );

    // 4. Register in worktrees registry
    await this.registerWorktree(cloneId, worktreePath, branch);

    return { cloneId, path: worktreePath, branch, createdAt: new Date() };
  }

  /**
   * Register a worktree in state/worktrees/registry.json for tracking.
   */
  private async registerWorktree(cloneId: string, worktreePath: string, branch: string): Promise<void> {
    const registryPath = path.join(REPO_ROOT, 'state', 'worktrees', 'registry.json');
    let registry: Record<string, any> = {};
    try {
      registry = JSON.parse(await fs.promises.readFile(registryPath, 'utf-8'));
    } catch { /* first entry — start fresh */ }

    registry[cloneId] = { path: worktreePath, branch, createdAt: new Date().toISOString() };
    await fs.promises.writeFile(registryPath, JSON.stringify(registry, null, 2));
  }
}
