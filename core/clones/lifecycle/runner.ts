// core/clones/lifecycle/runner.ts
// Phase 3 deliverable — Clone execution environment
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
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { HandshakeResult } from '../../keychain/manager';
import { WorktreeHandle } from './spawner';

const execAsync = promisify(exec);
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class CloneRunner {
  /**
   * RUN — executes the clone lifecycle inside a worktree.
   * Accepts the assembled prompt string directly (PromptBuilder already built it).
   * Returns the JSON handshake from clone stdout.
   */
  public async run(
    handle: WorktreeHandle,
    prompt: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<HandshakeResult> {
    // 1. Run setup.sh (install deps) — optional, warn if missing
    await this.runSetup(handle.path);

    // 2. Run Repomix (pack context) — best-effort, proceed on failure
    await this.runRepomix(handle.path);

    // 3. Launch Claude session, capture stdout for handshake JSON
    const handshake = await this.launchClaude(handle.path, prompt, timeoutMs);

    return handshake;
  }

  /**
   * Execute setup.sh in the worktree — installs npm/pip dependencies.
   * If missing: warn and proceed (setup.sh is optional per brief).
   */
  private async runSetup(worktreePath: string): Promise<void> {
    const setupScript = path.join(worktreePath, 'setup.sh');
    if (!fs.existsSync(setupScript)) {
      console.warn('[RUNNER] setup.sh not found — proceeding without dependency setup');
      return;
    }
    try {
      await execAsync(`bash "${setupScript}"`, {
        cwd: worktreePath,
        timeout: 5 * 60 * 1000, // 5 minute setup timeout
      });
    } catch (err) {
      console.warn(`[RUNNER] setup.sh failed — proceeding anyway: ${err}`);
    }
  }

  /**
   * Run Repomix to pack repo context (~70% token reduction).
   * Best-effort — clone can proceed without Repomix if npx not available.
   */
  private async runRepomix(worktreePath: string): Promise<void> {
    try {
      await execAsync('npx repomix --output repomix.txt', {
        cwd: worktreePath,
        timeout: 2 * 60 * 1000, // 2 minute timeout
      });
    } catch {
      console.warn('[RUNNER] Repomix failed — proceeding without packed context');
    }
  }

  /**
   * Launch a Claude session with the assembled prompt.
   * Parses the last JSON block from stdout as HandshakeResult.
   * Enforces timeout — kills process if exceeded.
   */
  private async launchClaude(
    worktreePath: string,
    prompt: string,
    timeoutMs: number
  ): Promise<HandshakeResult> {
    // Write prompt to a temp file to avoid shell escaping issues with long prompts
    const promptFile = path.join(worktreePath, '_prompt.md');
    await fs.promises.writeFile(promptFile, prompt);

    return new Promise((resolve, reject) => {
      const child = spawn(
        'claude',
        ['--print', '--dangerously-skip-permissions', '-p', `@${promptFile}`],
        {
          cwd: worktreePath,
          env: process.env, // credentials already in env from provisionEnvironment
        }
      );

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        this.cleanupPromptFile(promptFile);
        reject(new Error(`Clone timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      let output = '';
      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      child.stderr.on('data', (data: Buffer) => {
        console.error('[CLONE STDERR]', data.toString());
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        this.cleanupPromptFile(promptFile);

        // Parse handshake: reverse-iterate to find last line starting with '{'
        const handshake = this.parseHandshake(output);
        if (handshake) {
          resolve(handshake);
        } else {
          reject(new Error(
            `Clone exit ${code} — no valid JSON handshake in output (${output.length} chars captured)`
          ));
        }
      });
    });
  }

  /**
   * Parse the JSON handshake from clone stdout.
   * The clone MUST output its JSON handshake as the final line of stdout.
   * Reverse-iterate to find the last line starting with '{', JSON.parse it.
   */
  private parseHandshake(output: string): HandshakeResult | null {
    const lines = output.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('{')) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.status) return parsed as HandshakeResult;
        } catch { continue; }
      }
    }
    return null;
  }

  private cleanupPromptFile(promptFile: string): void {
    fs.unlink(promptFile, () => { /* ignore errors */ });
  }
}
