// core/clones/lifecycle/runner.ts
// Phase 5 — Clone execution environment
//
// After spawner.ts creates the worktree, runner.ts takes over:
//   1. Triggers setup.sh (installs Python/Node deps for the clone)
//   2. Runs the Repomix hook (packs repo context → repomix.txt)
//   3. Launches the Claude session with the assembled prompt
//   4. Waits for the JSON handshake in stdout
//   5. Returns the parsed HandshakeResult for the Janitor
//
// Critical: runner.ts must time out. A hung clone burns tokens and
// blocks the worktree. Default timeout: 30 minutes (configurable per task).

import { spawn } from 'child_process';
import { HandshakeResult } from '../../keychain/manager';
import { WorktreeHandle } from './spawner';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class CloneRunner {
  /**
   * RUN — executes the clone lifecycle inside a worktree.
   * Returns the JSON handshake from clone stdout.
   */
  public async run(
    handle: WorktreeHandle,
    promptPath: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<HandshakeResult> {
    // 1. Run setup.sh (install deps)
    await this.runSetup(handle.path);

    // 2. Run Repomix (pack context)
    await this.runRepomix(handle.path);

    // 3. Launch Claude session, capture stdout for handshake JSON
    const handshake = await this.launchClause(handle.path, promptPath, timeoutMs);

    return handshake;
  }

  private async runSetup(worktreePath: string): Promise<void> {
    // TODO: exec setup.sh in the worktree — npm install / pip install
    // Timeout: 5 minutes. Fail loudly if setup.sh is missing.
    throw new Error('CloneRunner.runSetup() not yet implemented — Phase 5 in progress');
  }

  private async runRepomix(worktreePath: string): Promise<void> {
    // TODO: run `npx repomix` in the worktree, write to repomix.txt
    // Mandatory first step per TASK template — provides 70% token reduction
    throw new Error('CloneRunner.runRepomix() not yet implemented — Phase 5 in progress');
  }

  private async launchClause(
    worktreePath: string,
    promptPath: string,
    timeoutMs: number
  ): Promise<HandshakeResult> {
    // TODO: spawn `claude --print --dangerously-skip-permissions -p <prompt>`
    // TODO: parse last JSON block from stdout as HandshakeResult
    // TODO: enforce timeoutMs — kill process + return FAILED_REQUIRE_HUMAN if exceeded
    throw new Error('CloneRunner.launchClause() not yet implemented — Phase 5 in progress');
  }
}
