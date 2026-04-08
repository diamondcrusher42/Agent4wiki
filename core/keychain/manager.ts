// core/keychain/manager.ts
// Phase 2 deliverable — Keychain Agent MVP (JIT Scoped Injection) V2
// Phase 5A upgrade: AES-256-GCM encrypted vault with scrypt KDF
//
// V2 lifecycle: KeychainManager provides provisionEnvironment() and
// revokeEnvironment() as primitives. CloneWorker orchestrates them.
// executeCloneMission() and launchClone() (V1 pattern) have been removed.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import yaml from 'js-yaml';

export interface ScanResult {
  clean: boolean;
  largeFilesSkipped: string[];
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

// Vault file paths relative to cwd
const VAULT_DIR = 'state/keychain';
const VAULT_ENC_FILE = 'vault.enc';
const VAULT_SALT_FILE = 'vault.salt';

export class KeychainManager {
  private masterVault: Record<string, string>;
  /** Short secrets that bypass the >16 char entropy filter in scanForLeaks */
  private exactMatchSecrets: Set<string> = new Set();

  constructor() {
    this.masterVault = this.loadMasterVault();
  }

  // ── AES-256 Vault Methods ──────────────────────────────────────────────

  /**
   * Derive a 32-byte key from password + salt using scrypt (Argon2id substitute).
   */
  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  }

  /**
   * INIT VAULT — creates a new encrypted vault from initial secrets.
   * Refuses to overwrite existing vault.
   */
  public initVault(masterPassword: string, initialSecrets: Record<string, string>): void {
    const vaultDir = path.join(process.cwd(), VAULT_DIR);
    const encPath = path.join(vaultDir, VAULT_ENC_FILE);
    const saltPath = path.join(vaultDir, VAULT_SALT_FILE);

    if (fs.existsSync(encPath)) {
      throw new Error('Vault already exists — refusing to overwrite. Delete vault.enc first.');
    }

    fs.mkdirSync(vaultDir, { recursive: true });

    // Generate salt
    const salt = crypto.randomBytes(32);
    fs.writeFileSync(saltPath, salt.toString('hex'), { mode: 0o600 });

    // Derive key and encrypt
    const key = this.deriveKey(masterPassword, salt);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const plaintext = JSON.stringify(initialSecrets);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const vaultData = {
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertext: encrypted.toString('hex'),
    };
    fs.writeFileSync(encPath, JSON.stringify(vaultData), { mode: 0o600 });

    // Reload into memory
    this.masterVault = initialSecrets;
    console.log(`[KEYCHAIN] Vault initialized with ${Object.keys(initialSecrets).length} secrets`);
  }

  /**
   * ADD SECRET — decrypts vault, adds key, re-encrypts and saves.
   */
  public addSecret(key: string, value: string): void {
    if (value.length < 8) {
      console.warn(`[KEYCHAIN] Secret "${key}" is shorter than 8 chars — too short for leak detection`);
      this.exactMatchSecrets.add(value);
    }

    const password = process.env.VAULT_MASTER_PASSWORD;
    if (!password) {
      throw new Error('VAULT_MASTER_PASSWORD not set in environment');
    }

    const vaultDir = path.join(process.cwd(), VAULT_DIR);
    const encPath = path.join(vaultDir, VAULT_ENC_FILE);
    const saltPath = path.join(vaultDir, VAULT_SALT_FILE);

    if (!fs.existsSync(encPath)) {
      throw new Error('No vault.enc found — run initVault() first');
    }

    // Decrypt current vault
    const salt = Buffer.from(fs.readFileSync(saltPath, 'utf-8'), 'hex');
    const derivedKey = this.deriveKey(password, salt);
    const vaultData = JSON.parse(fs.readFileSync(encPath, 'utf-8'));
    const secrets = this.decryptVaultData(vaultData, derivedKey);

    // Add new secret
    secrets[key] = value;

    // Re-encrypt
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    const plaintext = JSON.stringify(secrets);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const newVaultData = {
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      ciphertext: encrypted.toString('hex'),
    };
    fs.writeFileSync(encPath, JSON.stringify(newVaultData), { mode: 0o600 });

    // Update in-memory vault
    this.masterVault[key] = value;
  }

  /**
   * Decrypt vault data given derived key. Throws on wrong password / tampered data.
   */
  private decryptVaultData(vaultData: { iv: string; authTag: string; ciphertext: string }, key: Buffer): Record<string, string> {
    const iv = Buffer.from(vaultData.iv, 'hex');
    const authTag = Buffer.from(vaultData.authTag, 'hex');
    const ciphertext = Buffer.from(vaultData.ciphertext, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8'));
  }

  // ── Existing Methods (V2) ─────────────────────────────────────────────

  /**
   * BUILD SCOPED ENV: Creates a minimal env record with ONLY the requested keys.
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
   * REVOKE: Delete the .env file from the worktree.
   */
  public async revokeEnvironment(worktreePath: string): Promise<ScanResult> {
    const resolved = path.resolve(worktreePath);
    const envPath = path.join(resolved, '.env');
    try {
      await fs.promises.unlink(envPath);
    } catch {
      // File may not exist if provisionEnvironment never ran
    }
    const result = this.scanForLeaks(resolved);
    if (!result.clean) {
      console.error(`[KEYCHAIN FATAL] Credential leak detected in ${resolved}`);
    }
    return result;
  }

  /**
   * GET SCOPE KEYS: Returns the list of credential keys required for a given skill.
   */
  public getScopeKeys(skill: string): string[] {
    const scopesPath = path.join(__dirname, 'config', 'scopes.yaml');
    try {
      const raw = fs.readFileSync(scopesPath, 'utf-8');
      const parsed = yaml.load(raw) as Record<string, any>;
      if (parsed && parsed[skill] && Array.isArray(parsed[skill].keys)) {
        return parsed[skill].keys;
      }
      return [];
    } catch {
      console.warn(`[KEYCHAIN] Could not read scopes.yaml — returning empty scope for skill: ${skill}`);
      return [];
    }
  }

  /**
   * THE LEAK SCANNER: Prevents Clones from hardcoding API keys into source code.
   */
  private static readonly MAX_SCAN_FILE_BYTES = 1 * 1024 * 1024; // 1MB
  private static readonly BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.ttf', '.eot',
    '.pdf', '.zip', '.gz', '.tar', '.bin', '.exe', '.dll', '.so', '.node',
  ]);

  private scanForLeaks(worktreePath: string): ScanResult {
    const patternsPath = path.join(__dirname, 'config', 'patterns.yaml');
    const patterns: Array<{name: string, regex: string, severity: string}> = [];
    try {
      const raw = fs.readFileSync(patternsPath, 'utf-8');
      const parsed = yaml.load(raw) as Record<string, any>;
      if (parsed && parsed.patterns) {
        for (const [name, entry] of Object.entries(parsed.patterns)) {
          const e = entry as any;
          if (e.regex && e.severity) {
            patterns.push({ name, regex: e.regex, severity: e.severity });
          }
        }
      }
    } catch {
      console.warn('[KEYCHAIN] Could not load patterns.yaml — using vault-value-only scan');
    }

    // Collect vault values for exact-match check — >16 chars only to avoid false positives
    const vaultValues = Object.values(this.masterVault).filter(v => v.length >= 8);
    // Also include short secrets that were explicitly added
    const allExactValues = [...vaultValues, ...this.exactMatchSecrets];

    const files = this.getModifiedFiles(worktreePath);

    let foundLeak = false;
    const skippedFiles: string[] = [];
    for (const filePath of files) {
      const resolved = path.resolve(filePath);
      const rel = path.relative(path.resolve(worktreePath), resolved);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;

      // A3: Skip binary files by extension
      const ext = path.extname(resolved).toLowerCase();
      if (KeychainManager.BINARY_EXTENSIONS.has(ext)) continue;

      // A3: Skip files larger than 1MB to prevent OOM — track for manual review
      try {
        const stat = fs.statSync(resolved);
        if (stat.size > KeychainManager.MAX_SCAN_FILE_BYTES) {
          console.warn(`[KEYCHAIN] Skipping large file (${stat.size} bytes): ${resolved}`);
          skippedFiles.push(rel);
          continue;
        }
      } catch { continue; }

      let content: string;
      try {
        content = fs.readFileSync(resolved, 'utf-8');
      } catch { continue; }

      for (const value of allExactValues) {
        if (content.includes(value)) {
          console.error(`[LEAK SCAN] Exact vault value found in ${resolved}`);
          foundLeak = true;
        }
      }

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

    return { clean: !foundLeak, largeFilesSkipped: skippedFiles };
  }

  private getModifiedFiles(worktreePath: string): string[] {
    try {
      const output = execSync('git status --porcelain', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // Parse lines: "?? newfile.ts", " M modified.ts", "A  staged.ts"
      return output.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.slice(3).trim())
        .filter(f => f.length > 0)
        .map((f: string) => path.join(worktreePath, f));
    } catch {
      return this.getAllFiles(worktreePath);
    }
  }

  private getAllFiles(dirPath: string): string[] {
    return this.getAllFilesRecursive(dirPath);
  }

  private getAllFilesRecursive(dir: string): string[] {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...this.getAllFilesRecursive(full));
        } else if (entry.isFile()) {
          files.push(full);
        }
      }
      return files;
    } catch {
      return [];
    }
  }

  /**
   * LOAD: Read and decrypt the master vault.
   * Production: AES-256-GCM + scrypt KDF from vault.enc
   * Fallback: .env file (backward compat for dev)
   */
  private loadMasterVault(): Record<string, string> {
    // Try encrypted vault first
    const vaultDir = path.join(process.cwd(), VAULT_DIR);
    const encPath = path.join(vaultDir, VAULT_ENC_FILE);
    const saltPath = path.join(vaultDir, VAULT_SALT_FILE);

    if (fs.existsSync(encPath) && fs.existsSync(saltPath)) {
      const password = process.env.VAULT_MASTER_PASSWORD;
      if (!password) {
        console.warn('[KEYCHAIN] vault.enc exists but VAULT_MASTER_PASSWORD not set — falling back to .env');
      } else {
        try {
          const salt = Buffer.from(fs.readFileSync(saltPath, 'utf-8'), 'hex');
          const key = this.deriveKey(password, salt);
          const vaultData = JSON.parse(fs.readFileSync(encPath, 'utf-8'));
          const secrets = this.decryptVaultData(vaultData, key);
          console.log(`[KEYCHAIN] Loaded ${Object.keys(secrets).length} keys from encrypted vault`);
          // C1: Populate exactMatchSecrets for leak detection
          for (const [k, v] of Object.entries(secrets)) {
            if (v.length >= 8) {
              this.exactMatchSecrets.add(v);
            }
          }
          return secrets;
        } catch (err) {
          throw new Error(`[KEYCHAIN] Failed to decrypt vault — wrong password or corrupted file: ${err}`);
        }
      }
    }

    // Fallback: read from .env
    const vault: Record<string, string> = {};
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
      // C1: Populate exactMatchSecrets for leak detection
      for (const [k, v] of Object.entries(vault)) {
        if (v.length >= 8) {
          this.exactMatchSecrets.add(v);
        }
      }
    } catch {
      console.warn('[KEYCHAIN] No .env file found — vault is empty. Clone launches will fail.');
    }

    return vault;
  }
}
