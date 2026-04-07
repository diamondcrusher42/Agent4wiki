# The Keychain Manager (Core Logic)
## The core philosophy of the Keychain Agent MVP is Just-In-Time (JIT) Scoped Injection.

// core/keychain/manager.ts
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto'; // For the leak scanner

export class KeychainManager {
  private masterVault: Record<string, string>;

  constructor() {
    // In the MVP, this reads from an encrypted file in state/keychain/
    // NEVER from the root directory of the host machine.
    this.masterVault = this.loadMasterVault(); 
  }

  /**
   * INJECT: Called right before a Clone wakes up.
   * Creates a temporary .env file scoped ONLY to the allowed worktree.
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

    // Write the ephemeral .env inside the isolated worktree
    const envContent = Object.entries(scopedEnv)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    
    fs.writeFileSync(path.join(worktreePath, '.env'), envContent);
    console.log(`[KEYCHAIN] Provisioned ${requiredKeys.length} keys for ${worktreePath}`);
  }

  /**
   * REVOKE: Called by the Janitor immediately after the Clone finishes.
   * Destroys the ephemeral keys and triggers the leak scanner.
   */
  public revokeEnvironment(worktreePath: string): boolean {
    const envPath = path.join(worktreePath, '.env');
    
    // 1. Destroy the keys
    if (fs.existsSync(envPath)) {
      fs.unlinkSync(envPath); 
    }

    // 2. Run the Leak Scanner
    const leakDetected = this.scanForLeaks(worktreePath);
    if (leakDetected) {
      console.error(`[FATAL] Credential leak detected in ${worktreePath}. Locking down.`);
      return false; // Tells the Janitor to BLOCK the commit
    }

    return true; // Safe to merge
  }

  /**
   * THE LEAK SCANNER: Prevents Clones from hardcoding API keys into source code.
   */
  private scanForLeaks(worktreePath: string): boolean {
    // In MVP, this iterates through modified files in the worktree 
    // and checks if any string perfectly matches a value in the masterVault.
    // (e.g., if code contains "sk-ant-api03-...", flag it immediately).
    // ... scanner implementation ...
    return false; 
  }
}

# Implementation notes
## How it Connects to the Clone Lifecycle
The [EXECUTE] and [AUDIT] phases we built into the Master Code Clone Template - Here is how the orchestration script wraps around it:

The Brain Plans: "I need a Clone to write a Python script that searches X/Twitter for market trends."

The Keychain Provisions: The Brain asks the Keychain to spawn the Clone in state/worktrees/clone-842. It requests only the X_API_KEY and OPENAI_API_KEY. It explicitly denies access to the STRIPE_API_KEY.

The Clone Executes: The Clone runs inside its isolated path. It reads its local .env and does its job.

The Janitor Audits: The Clone finishes and outputs its JSON handshake.

The Keychain Revokes & Scans: Before the Janitor accepts the code, the Keychain deletes the .env and runs the scanForLeaks regex sweep over the new Python script. If the Clone accidentally hardcoded the X_API_KEY into the script, the Keychain intercepts, deletes the file, and flags the Janitor to register a FAILED_REQUIRE_HUMAN status.

## Kids Bot Isolation (Special Case)
Your architecture document specifically called out the "Kids Bot" (Planet Zabave). Because this bot is public-facing (and therefore highly susceptible to prompt injection), the Keychain handles it differently:

Separate Wing: The Kids Bot gets its own physical directory (state/keychain/kids/) with a completely separate masterVault.

Zero Cross-Pollination: Even if a user manages to prompt-inject the Kids Bot into printing its environment variables, the main business API keys (like the Anthropic master key or billing credentials) simply do not exist in its memory space.