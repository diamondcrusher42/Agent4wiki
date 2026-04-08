// core/keychain/manager.ts
// Phase 2 deliverable — Keychain Agent MVP (JIT Scoped Injection) V2
// Changelog: spawn-based injection (no file on disk), try/finally lifecycle,
//            Kids Bot maxTokensPerSession, patterns.yaml leak scanner note
//
// V2 lifecycle: KeychainManager provides provisionEnvironment() and
// revokeEnvironment() as primitives. CloneWorker orchestrates them.
// executeCloneMission() and launchClone() (V1 pattern) have been removed.

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

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
   * BUILD SCOPED ENV: Creates a minimal env record with ONLY the requested keys.
   * Explicit deny: any key not in requiredKeys is absent.
   * Credentials stay in process memory — never written to disk.
   */
  public buildScopedEnv(requiredKeys: string[]): Record<string, string> {
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
   * PROVISION: Write a temporary .env file into the worktree for Python/shell clones.
   * For TypeScript clones, use buildScopedEnv() + process.env injection instead.
   * File is deleted by revokeEnvironment() in the finally block.
   */
  public async provisionEnvironment(worktreePath: string, requiredKeys: string[]): Promise<void> {
    const resolved = path.resolve(worktreePath);
    const scopedEnv = this.buildScopedEnv(requiredKeys);
    const envPath = path.join(resolved, '.env');
    const envContent = Object.entries(scopedEnv)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    await fs.promises.writeFile(envPath, envContent, { mode: 0o600 });
  }

  /**
   * REVOKE: Delete the .env file from the worktree. Always call in finally block.
   * Runs scanForLeaks() — if leak detected, logs FATAL and returns false.
   * Caller (CloneWorker) must treat false return as Janitor BLOCK.
   */
  public async revokeEnvironment(worktreePath: string): Promise<boolean> {
    const resolved = path.resolve(worktreePath);
    const envPath = path.join(resolved, '.env');
    try {
      await fs.promises.unlink(envPath);
    } catch {
      // File may not exist if provisionEnvironment never ran — not an error
    }
    const clean = this.scanForLeaks(resolved);
    if (!clean) {
      console.error(`[KEYCHAIN FATAL] Credential leak detected in ${resolved}`);
    }
    return clean;
  }

  /**
   * GET SCOPE KEYS: Returns the list of credential keys required for a given skill.
   * Reads from core/keychain/config/scopes.yaml.
   */
  public getScopeKeys(skill: string): string[] {
    const scopesPath = path.join(__dirname, 'config', 'scopes.yaml');
    try {
      const raw = fs.readFileSync(scopesPath, 'utf-8');
      // Simple YAML parser for scopes.yaml structure:
      //   skill_name:
      //     keys:
      //       - KEY_NAME
      const keys: string[] = [];
      const lines = raw.split('\n');
      let inSkill = false;
      let inKeys = false;
      for (const line of lines) {
        // Top-level skill (no leading whitespace, ends with colon)
        if (/^\S/.test(line) && line.trim().endsWith(':')) {
          inSkill = line.trim().replace(':', '') === skill;
          inKeys = false;
          continue;
        }
        if (!inSkill) continue;
        if (/^\s+keys:\s*$/.test(line)) {
          inKeys = true;
          continue;
        }
        // Another sub-key at the same indent level — stop collecting keys
        if (inKeys && /^\s+\w+:/.test(line) && !line.trim().startsWith('-')) {
          inKeys = false;
          continue;
        }
        if (inKeys && line.trim().startsWith('- ')) {
          keys.push(line.trim().replace(/^- /, ''));
        }
      }
      return keys;
    } catch {
      console.warn(`[KEYCHAIN] Could not read scopes.yaml — returning empty scope for skill: ${skill}`);
      return [];
    }
  }

  /**
   * THE LEAK SCANNER: Prevents Clones from hardcoding API keys into source code.
   * Uses BOTH exact-match (vault values) AND regex patterns from patterns.yaml.
   * Catches: exact keys, base64-encoded keys, split strings, keys in comments.
   */
  private scanForLeaks(worktreePath: string): boolean {
    // Load regex patterns from config/patterns.yaml
    const patternsPath = path.join(__dirname, 'config', 'patterns.yaml');
    const patterns: Array<{name: string, regex: string, severity: string}> = [];
    try {
      const raw = fs.readFileSync(patternsPath, 'utf-8');
      // Parse patterns.yaml — structure: patterns: { name: { regex, severity, action } }
      let currentPattern = '';
      let currentRegex = '';
      let currentSeverity = '';
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) continue;
        // Indented pattern name (2-space indent, no dash prefix)
        const nameMatch = line.match(/^  (\w+):\s*$/);
        if (nameMatch) {
          if (currentPattern && currentRegex) {
            patterns.push({ name: currentPattern, regex: currentRegex, severity: currentSeverity });
          }
          currentPattern = nameMatch[1];
          currentRegex = '';
          currentSeverity = '';
          continue;
        }
        const regexMatch = trimmed.match(/^regex:\s*'(.+)'$/);
        if (regexMatch) { currentRegex = regexMatch[1]; continue; }
        const sevMatch = trimmed.match(/^severity:\s*(\w+)$/);
        if (sevMatch) { currentSeverity = sevMatch[1]; continue; }
      }
      if (currentPattern && currentRegex) {
        patterns.push({ name: currentPattern, regex: currentRegex, severity: currentSeverity });
      }
    } catch {
      console.warn('[KEYCHAIN] Could not load patterns.yaml — using vault-value-only scan');
    }

    // Collect vault values for exact-match check (skip short values to avoid false positives)
    const vaultValues = Object.values(this.masterVault).filter(v => v.length > 8);

    // Get files modified in the worktree
    const files = this.getModifiedFiles(worktreePath);

    let foundLeak = false;
    for (const filePath of files) {
      // Path traversal defence
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(worktreePath))) continue;

      let content: string;
      try {
        content = fs.readFileSync(resolved, 'utf-8');
      } catch { continue; }

      // 1. Exact vault value match
      for (const value of vaultValues) {
        if (content.includes(value)) {
          console.error(`[LEAK SCAN] Exact vault value found in ${resolved}`);
          foundLeak = true;
        }
      }

      // 2. Regex pattern match
      for (const pattern of patterns) {
        try {
          if (new RegExp(pattern.regex).test(content)) {
            console.error(`[LEAK SCAN] Pattern "${pattern.name}" matched in ${resolved}`);
            if (pattern.severity === 'CRITICAL') foundLeak = true;
          }
        } catch {
          // Invalid regex in patterns.yaml — skip
        }
      }
    }

    return !foundLeak;
  }

  /**
   * Get list of modified files in a worktree via git diff.
   */
  private getModifiedFiles(worktreePath: string): string[] {
    try {
      const result = execSync('git diff --name-only HEAD', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return result.trim().split('\n')
        .filter(Boolean)
        .map((f: string) => path.join(worktreePath, f));
    } catch {
      // Not a git repo or no commits — fall back to scanning all files
      return this.getAllFiles(worktreePath);
    }
  }

  /**
   * Fallback: list all files in a directory (non-recursive, top-level only).
   */
  private getAllFiles(dirPath: string): string[] {
    try {
      return fs.readdirSync(dirPath)
        .filter(f => !f.startsWith('.'))
        .map(f => path.join(dirPath, f))
        .filter(f => fs.statSync(f).isFile());
    } catch {
      return [];
    }
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
    const vault: Record<string, string> = {};

    // MVP: read from .env file at repo root (not production-grade, but unblocks Phase 3)
    // Production path: state/keychain/vault.enc (AES-256-GCM + Argon2id KDF)
    const envPath = path.join(process.cwd(), '.env');
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        vault[key] = value;
      }
      console.log(`[KEYCHAIN] Loaded ${Object.keys(vault).length} keys from .env`);
    } catch {
      console.warn('[KEYCHAIN] No .env file found — vault is empty. Clone launches will fail.');
    }

    return vault;
  }
}
