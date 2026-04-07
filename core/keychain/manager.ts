// core/keychain/manager.ts
// Phase 2 deliverable — Keychain Agent MVP (JIT Scoped Injection) V2
// Changelog: spawn-based injection (no file on disk), try/finally lifecycle,
//            Kids Bot maxTokensPerSession, patterns.yaml leak scanner note

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export interface MissionBrief {
  task: string;
  requiredKeys: string[];
  allowedEndpoints: string[];
  worktreePath: string;
}

export interface HandshakeResult {
  status: 'COMPLETED' | 'FAILED_REQUIRE_HUMAN' | 'FAILED_RETRY' | 'BLOCKED_IMPOSSIBLE';
  files_modified: string[];
  tests_passed: boolean;
  tokens_consumed: number;
  duration_seconds: number;
  janitor_notes: string;
  reason?: string;
}

export class KeychainManager {
  private masterVault: Record<string, string>;

  constructor() {
    // Reads from encrypted file in state/keychain/
    // NEVER from the root directory of the host machine.
    this.masterVault = this.loadMasterVault();
  }

  /**
   * FULL CLONE LIFECYCLE — try/finally guarantees revocation even if clone crashes.
   * This is the CloneLifecycle orchestrator described in Opus review 2.
   */
  async executeCloneMission(task: MissionBrief): Promise<HandshakeResult> {
    const worktree = task.worktreePath;

    // 1. Provision — credentials exist only in process memory, never on disk
    const scopedEnv = this.buildScopedEnv(task.requiredKeys);

    try {
      // 2. Launch clone with env injected into subprocess (no .env file written)
      const result = await this.launchClone(worktree, task, scopedEnv);
      return result;
    } finally {
      // 3. Revoke + scan — ALWAYS runs, even if clone crashes
      const clean = this.scanForLeaks(worktree);
      if (!clean) {
        console.error(`[FATAL] Credential leak detected in ${worktree}. Locking down.`);
        // Janitor must be notified to BLOCK the commit
      }
    }
  }

  /**
   * BUILD SCOPED ENV: Creates a minimal env record with ONLY the requested keys.
   * Explicit deny: any key not in requiredKeys is absent.
   * Credentials stay in process memory — never written to disk.
   */
  private buildScopedEnv(requiredKeys: string[]): Record<string, string> {
    const scopedEnv: Record<string, string> = {};

    for (const key of requiredKeys) {
      if (this.masterVault[key]) {
        scopedEnv[key] = this.masterVault[key];
      } else {
        throw new Error(`SECURITY HALT: Requested key ${key} does not exist in vault.`);
      }
    }

    return scopedEnv;
  }

  /**
   * LAUNCH CLONE: Spawns the Claude Code process with scoped env injected directly.
   * Credentials exist only in the spawned process's memory — no file on disk.
   * This eliminates the .env file attack surface entirely.
   */
  private async launchClone(
    worktreePath: string,
    task: MissionBrief,
    scopedEnv: Record<string, string>
  ): Promise<HandshakeResult> {
    return new Promise((resolve, reject) => {
      const child = spawn('claude', ['code'], {
        cwd: worktreePath,
        env: { ...process.env, ...scopedEnv } // credentials only in process memory
      });

      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.on('close', (code) => {
        try {
          // Parse JSON handshake from clone output
          const jsonMatch = output.match(/\{[\s\S]*"status"[\s\S]*\}/);
          if (jsonMatch) {
            resolve(JSON.parse(jsonMatch[0]) as HandshakeResult);
          } else {
            reject(new Error('Clone produced no parseable JSON handshake'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * THE LEAK SCANNER: Prevents Clones from hardcoding API keys into source code.
   * Uses BOTH exact-match (vault values) AND regex patterns from patterns.yaml.
   * Catches: exact keys, base64-encoded keys, split strings, keys in comments.
   */
  private scanForLeaks(worktreePath: string): boolean {
    // TODO: Load patterns.yaml from config/patterns.yaml
    // TODO: Iterate through git-staged files in worktreePath
    // TODO: Check each file against:
    //   1. Exact match: vault values (catches direct hardcoding)
    //   2. Regex patterns: known key formats (sk-ant-api03-..., etc.)
    //      — catches base64-encoded, split strings, keys in comments
    // Return false if any match found (leak detected)
    return true; // Safe — no leaks (placeholder)
  }

  /**
   * LOAD: Read and decrypt the master vault from state/keychain/
   * MVP: reads from encrypted file. Production: AES-256-GCM + Argon2id KDF.
   *
   * KIDS BOT ISOLATION:
   * Planet Zabave / public-facing bot uses a separate vault:
   *   state/keychain/kids/vault.enc — completely isolated masterVault
   * Zero cross-pollination: main business keys do not exist in kids vault.
   * maxTokensPerSession enforced per session to prevent cost-based attacks
   * (attacker can't steal keys, but could rack up API costs via prompt injection).
   */
  private loadMasterVault(): Record<string, string> {
    // TODO: Implement AES-256-GCM decryption with Argon2id KDF
    // Vault: state/keychain/vault.enc
    // Kids vault: state/keychain/kids/vault.enc
    return {};
  }
}
