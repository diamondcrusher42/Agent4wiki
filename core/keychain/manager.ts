// core/keychain/manager.ts
// Phase 2 deliverable — Keychain Agent MVP (JIT Scoped Injection)
// Core philosophy: Just-In-Time Scoped Injection.
// Clones receive ONLY the keys they requested. Keys are ephemeral — provisioned before
// clone launch, revoked and scanned immediately after clone completes.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto'; // For the leak scanner

export class KeychainManager {
  private masterVault: Record<string, string>;

  constructor() {
    // Reads from encrypted file in state/keychain/
    // NEVER from the root directory of the host machine.
    this.masterVault = this.loadMasterVault();
  }

  /**
   * INJECT: Called right before a Clone wakes up.
   * Creates a temporary .env file scoped ONLY to the allowed worktree.
   * Explicit deny: any key not in requiredKeys is NOT provisioned.
   */
  public provisionEnvironment(worktreePath: string, requiredKeys: string[]): void {
    const scopedEnv: Record<string, string> = {};

    for (const key of requiredKeys) {
      if (this.masterVault[key]) {
        scopedEnv[key] = this.masterVault[key];
      } else {
        throw new Error(`SECURITY HALT: Requested key ${key} does not exist in vault.`);
      }
    }

    // Write the ephemeral .env inside the isolated worktree ONLY
    const envContent = Object.entries(scopedEnv)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    fs.writeFileSync(path.join(worktreePath, '.env'), envContent);
    console.log(`[KEYCHAIN] Provisioned ${requiredKeys.length} keys for ${worktreePath}`);
  }

  /**
   * REVOKE: Called by the Janitor immediately after the Clone finishes.
   * Destroys the ephemeral keys and triggers the leak scanner.
   * Returns false → Janitor issues BLOCK, commit is rejected.
   */
  public revokeEnvironment(worktreePath: string): boolean {
    const envPath = path.join(worktreePath, '.env');

    // 1. Destroy the ephemeral keys
    if (fs.existsSync(envPath)) {
      fs.unlinkSync(envPath);
    }

    // 2. Run the Leak Scanner before Janitor accepts the code
    const leakDetected = this.scanForLeaks(worktreePath);
    if (leakDetected) {
      console.error(`[FATAL] Credential leak detected in ${worktreePath}. Locking down.`);
      return false; // Tells the Janitor to BLOCK the commit
    }

    return true; // Safe to merge
  }

  /**
   * THE LEAK SCANNER: Prevents Clones from hardcoding API keys into source code.
   * Iterates through modified files in the worktree and checks if any string
   * perfectly matches a value in the masterVault.
   * e.g., if code contains "sk-ant-api03-...", flag it immediately.
   */
  private scanForLeaks(worktreePath: string): boolean {
    // TODO: Implement regex sweep over git-staged files in worktreePath
    // Check each vault value against all file contents
    // Return true if any match found
    return false;
  }

  /**
   * LOAD: Read and decrypt the master vault from state/keychain/
   * MVP: reads from encrypted file. Production: AES-256-GCM + Argon2id KDF.
   */
  private loadMasterVault(): Record<string, string> {
    // TODO: Implement AES-256-GCM decryption with Argon2id KDF
    // Vault file lives at state/keychain/vault.enc
    // Kids Bot vault lives at state/keychain/kids/vault.enc (separate, zero cross-pollination)
    return {};
  }
}
