/**
 * Tests for core/keychain/manager.ts — Phase 2 (credential system)
 */

import { KeychainManager } from '../core/keychain/manager';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// loadMasterVault tests
// ---------------------------------------------------------------------------

test('loadMasterVault reads from .env', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-'));
  fs.writeFileSync(
    path.join(tmpDir, '.env'),
    'ANTHROPIC_API_KEY=test-key-123\nTELEGRAM_BOT_TOKEN=987654\n'
  );

  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    const km = new KeychainManager();
    const vault = (km as any).masterVault;

    expect(vault['ANTHROPIC_API_KEY']).toBe('test-key-123');
    expect(vault['TELEGRAM_BOT_TOKEN']).toBe('987654');
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('loadMasterVault handles missing .env gracefully', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-empty-'));
  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    const km = new KeychainManager();
    const vault = (km as any).masterVault;
    expect(Object.keys(vault).length).toBe(0);
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('loadMasterVault skips comments and blank lines', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-comments-'));
  fs.writeFileSync(
    path.join(tmpDir, '.env'),
    '# This is a comment\n\nVALID_KEY=value123\n# Another comment\nSECOND=two\n'
  );

  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    const km = new KeychainManager();
    const vault = (km as any).masterVault;
    expect(vault['VALID_KEY']).toBe('value123');
    expect(vault['SECOND']).toBe('two');
    expect(Object.keys(vault).length).toBe(2);
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('loadMasterVault strips quotes from values', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-quotes-'));
  fs.writeFileSync(
    path.join(tmpDir, '.env'),
    'SINGLE=\'quoted-value\'\nDOUBLE="double-quoted"\nPLAIN=no-quotes\n'
  );

  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    const km = new KeychainManager();
    const vault = (km as any).masterVault;
    expect(vault['SINGLE']).toBe('quoted-value');
    expect(vault['DOUBLE']).toBe('double-quoted');
    expect(vault['PLAIN']).toBe('no-quotes');
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// provisionEnvironment + revokeEnvironment tests
// ---------------------------------------------------------------------------

test('provisionEnvironment writes .env file with correct permissions', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-provision-'));

  // Create a KeychainManager with a patched vault
  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;
  fs.writeFileSync(path.join(tmpDir, '.env'), 'TEST_KEY=test-value-123\n');

  try {
    const km = new KeychainManager();
    const provisionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-worktree-'));

    await km.provisionEnvironment(provisionDir, ['TEST_KEY']);

    const envPath = path.join(provisionDir, '.env');
    expect(fs.existsSync(envPath)).toBe(true);
    const content = fs.readFileSync(envPath, 'utf-8');
    expect(content).toContain('TEST_KEY=test-value-123');

    // Check file permissions (0o600)
    const stat = fs.statSync(envPath);
    const mode = (stat.mode & 0o777).toString(8);
    expect(mode).toBe('600');

    fs.rmSync(provisionDir, { recursive: true });
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('revokeEnvironment deletes .env file', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-revoke-'));

  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;
  fs.writeFileSync(path.join(tmpDir, '.env'), 'TEST_KEY=test-value-123\n');

  try {
    const km = new KeychainManager();
    const provisionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-worktree-'));

    await km.provisionEnvironment(provisionDir, ['TEST_KEY']);
    expect(fs.existsSync(path.join(provisionDir, '.env'))).toBe(true);

    const clean = await km.revokeEnvironment(provisionDir);
    expect(fs.existsSync(path.join(provisionDir, '.env'))).toBe(false);
    expect(clean).toBe(true);

    fs.rmSync(provisionDir, { recursive: true });
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('revokeEnvironment handles missing .env gracefully', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-revoke-missing-'));

  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    const km = new KeychainManager();
    // No .env exists — should not throw
    const clean = await km.revokeEnvironment(tmpDir);
    expect(clean).toBe(true);
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// scanForLeaks tests
// ---------------------------------------------------------------------------

test('scanForLeaks detects hardcoded vault value', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-scan-leak-'));

  const originalCwd = process.cwd;
  // Write a vault .env
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-scan-'));
  fs.writeFileSync(path.join(vaultDir, '.env'), 'SECRET_KEY=sk-ant-api03-my-real-key-1234567890\n');
  process.cwd = () => vaultDir;

  try {
    const km = new KeychainManager();

    // Write a leaked file
    fs.writeFileSync(
      path.join(tmpDir, 'config.py'),
      "API_KEY = 'sk-ant-api03-my-real-key-1234567890'"
    );

    const clean = (km as any).scanForLeaks(tmpDir);
    expect(clean).toBe(false); // leak detected
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
    fs.rmSync(vaultDir, { recursive: true });
  }
});

test('scanForLeaks passes clean directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-scan-clean-'));

  const originalCwd = process.cwd;
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-clean-'));
  fs.writeFileSync(path.join(vaultDir, '.env'), 'SECRET_KEY=sk-ant-api03-my-real-key-1234567890\n');
  process.cwd = () => vaultDir;

  try {
    const km = new KeychainManager();

    // Write a clean file
    fs.writeFileSync(path.join(tmpDir, 'main.py'), "print('hello world')");

    const clean = (km as any).scanForLeaks(tmpDir);
    expect(clean).toBe(true);
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
    fs.rmSync(vaultDir, { recursive: true });
  }
});

test('scanForLeaks detects pattern match (Anthropic key format)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-scan-pattern-'));

  const originalCwd = process.cwd;
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-pattern-'));
  fs.writeFileSync(path.join(vaultDir, '.env'), 'SOME_KEY=unrelated\n');
  process.cwd = () => vaultDir;

  try {
    const km = new KeychainManager();

    // Write a file with an Anthropic key pattern (not in vault, but matches regex)
    fs.writeFileSync(
      path.join(tmpDir, 'leaked.ts'),
      'const key = "sk-ant-abcdefghijklmnopqrstuvwxyz0123456789ABCDE";'
    );

    const clean = (km as any).scanForLeaks(tmpDir);
    expect(clean).toBe(false); // pattern match should catch it
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
    fs.rmSync(vaultDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// getScopeKeys tests
// ---------------------------------------------------------------------------

test('getScopeKeys returns credentials from scopes.yaml', () => {
  const km = new KeychainManager();
  const keys = km.getScopeKeys('code');
  expect(Array.isArray(keys)).toBe(true);
  expect(keys.length).toBeGreaterThan(0);
  expect(keys).toContain('ANTHROPIC_API_KEY');
  expect(keys).toContain('GITHUB_TOKEN');
});

test('getScopeKeys returns empty array for unknown skill', () => {
  const km = new KeychainManager();
  const keys = km.getScopeKeys('nonexistent_skill');
  expect(keys).toEqual([]);
});

// ---------------------------------------------------------------------------
// buildScopedEnv tests
// ---------------------------------------------------------------------------

test('buildScopedEnv returns only requested keys', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-scoped-'));
  fs.writeFileSync(
    path.join(tmpDir, '.env'),
    'KEY_A=value_a\nKEY_B=value_b\nKEY_C=value_c\n'
  );

  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    const km = new KeychainManager();
    const scoped = km.buildScopedEnv(['KEY_A', 'KEY_C']);

    expect(scoped['KEY_A']).toBe('value_a');
    expect(scoped['KEY_C']).toBe('value_c');
    expect(scoped['KEY_B']).toBeUndefined();
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('buildScopedEnv throws for missing key', () => {
  const km = new KeychainManager();
  expect(() => km.buildScopedEnv(['NONEXISTENT_KEY'])).toThrow('SECURITY HALT');
});

// ---------------------------------------------------------------------------
// Phase 5A — AES-256 Vault tests
// ---------------------------------------------------------------------------

test('initVault() writes encrypted file, not plaintext', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-init-'));
  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    fs.mkdirSync(path.join(tmpDir, '.env'), { recursive: false }); // no .env file trick — just make dir nonexistent
  } catch { /* ignore */ }

  // Need no .env so constructor loads empty vault
  process.cwd = () => tmpDir;

  try {
    const km = new KeychainManager();
    km.initVault('test-master-password', { SECRET: 'my-secret-value-longer-than-17' });

    const encPath = path.join(tmpDir, 'state', 'keychain', 'vault.enc');
    const saltPath = path.join(tmpDir, 'state', 'keychain', 'vault.salt');

    expect(fs.existsSync(encPath)).toBe(true);
    expect(fs.existsSync(saltPath)).toBe(true);

    // Encrypted file should NOT contain plaintext secret
    const encContent = fs.readFileSync(encPath, 'utf-8');
    expect(encContent).not.toContain('my-secret-value-longer-than-17');

    // Should be valid JSON with iv, authTag, ciphertext
    const parsed = JSON.parse(encContent);
    expect(parsed.iv).toBeDefined();
    expect(parsed.authTag).toBeDefined();
    expect(parsed.ciphertext).toBeDefined();
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('loadMasterVault() decrypts correctly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-decrypt-'));
  const originalCwd = process.cwd;
  const originalEnv = process.env.VAULT_MASTER_PASSWORD;

  process.cwd = () => tmpDir;

  try {
    // Create vault with initVault
    const km1 = new KeychainManager();
    km1.initVault('decrypt-test-pw', { MY_KEY: 'my-value-that-is-long-enough' });

    // Now set password env and create a new instance — should decrypt
    process.env.VAULT_MASTER_PASSWORD = 'decrypt-test-pw';
    const km2 = new KeychainManager();
    const vault = (km2 as any).masterVault;

    expect(vault['MY_KEY']).toBe('my-value-that-is-long-enough');
  } finally {
    process.cwd = originalCwd;
    if (originalEnv !== undefined) process.env.VAULT_MASTER_PASSWORD = originalEnv;
    else delete process.env.VAULT_MASTER_PASSWORD;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('loadMasterVault() falls back to .env when vault.enc missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-fallback-'));
  fs.writeFileSync(path.join(tmpDir, '.env'), 'FALLBACK_KEY=fallback-value\n');

  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    const km = new KeychainManager();
    const vault = (km as any).masterVault;
    expect(vault['FALLBACK_KEY']).toBe('fallback-value');
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('addSecret() persists across reload', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-add-'));
  const originalCwd = process.cwd;
  const originalEnv = process.env.VAULT_MASTER_PASSWORD;

  process.cwd = () => tmpDir;
  process.env.VAULT_MASTER_PASSWORD = 'add-secret-test-pw';

  try {
    // Init vault
    const km1 = new KeychainManager();
    km1.initVault('add-secret-test-pw', { INITIAL: 'initial-value-long-enough' });

    // Add a secret
    km1.addSecret('NEW_SECRET', 'new-value-that-is-definitely-long-enough');

    // Reload from disk
    const km2 = new KeychainManager();
    const vault = (km2 as any).masterVault;
    expect(vault['INITIAL']).toBe('initial-value-long-enough');
    expect(vault['NEW_SECRET']).toBe('new-value-that-is-definitely-long-enough');
  } finally {
    process.cwd = originalCwd;
    if (originalEnv !== undefined) process.env.VAULT_MASTER_PASSWORD = originalEnv;
    else delete process.env.VAULT_MASTER_PASSWORD;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('wrong password throws on decrypt', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-wrongpw-'));
  const originalCwd = process.cwd;
  const originalEnv = process.env.VAULT_MASTER_PASSWORD;

  process.cwd = () => tmpDir;

  try {
    // Init vault with one password
    const km1 = new KeychainManager();
    km1.initVault('correct-password', { KEY: 'value-longer-than-seventeen-chars' });

    // Try to load with wrong password
    process.env.VAULT_MASTER_PASSWORD = 'wrong-password';
    expect(() => new KeychainManager()).toThrow();
  } finally {
    process.cwd = originalCwd;
    if (originalEnv !== undefined) process.env.VAULT_MASTER_PASSWORD = originalEnv;
    else delete process.env.VAULT_MASTER_PASSWORD;
    fs.rmSync(tmpDir, { recursive: true });
  }
});


// ---------------------------------------------------------------------------
// B3: Recursive getModifiedFiles fallback
// ---------------------------------------------------------------------------

test('getAllFilesRecursive finds files nested 3 directories deep', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-recursive-'));

  // Create nested structure
  const deepDir = path.join(tmpDir, 'src', 'deep', 'nested');
  fs.mkdirSync(deepDir, { recursive: true });
  fs.writeFileSync(path.join(deepDir, 'leaked.ts'), 'const key = "sk-ant-abcdefghijklmnopqrstuvwxyz0123456789ABCDE";');
  fs.writeFileSync(path.join(tmpDir, 'top-level.ts'), 'clean file');

  const originalCwd = process.cwd;
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-recursive-'));
  fs.writeFileSync(path.join(vaultDir, '.env'), 'KEY=short\n');
  process.cwd = () => vaultDir;

  try {
    const km = new KeychainManager();
    // getAllFilesRecursive is called by scanForLeaks via getModifiedFiles fallback
    const files = (km as any).getAllFilesRecursive(tmpDir);
    const filenames = files.map((f: string) => path.basename(f));
    expect(filenames).toContain('leaked.ts');
    expect(filenames).toContain('top-level.ts');
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
    fs.rmSync(vaultDir, { recursive: true });
  }
});

test('scanForLeaks detects leak in deeply nested file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-deep-leak-'));

  const deepDir = path.join(tmpDir, 'src', 'utils', 'config');
  fs.mkdirSync(deepDir, { recursive: true });
  fs.writeFileSync(
    path.join(deepDir, 'secrets.ts'),
    'const key = "sk-ant-abcdefghijklmnopqrstuvwxyz0123456789ABCDE";'
  );

  const originalCwd = process.cwd;
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-deep-'));
  fs.writeFileSync(path.join(vaultDir, '.env'), 'SOME_KEY=unrelated\n');
  process.cwd = () => vaultDir;

  try {
    const km = new KeychainManager();
    const clean = (km as any).scanForLeaks(tmpDir);
    expect(clean).toBe(false); // pattern match in nested file
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
    fs.rmSync(vaultDir, { recursive: true });
  }
});


// ---------------------------------------------------------------------------
// C1: exactMatchSecrets population + short-secret detection
// ---------------------------------------------------------------------------

test('secrets loaded from .env are detected by scanForLeaks (C1)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-c1-env-'));
  // Create a vault .env with a 12-char secret (previously bypassed by 17-char floor)
  fs.writeFileSync(path.join(tmpDir, '.env'), 'SHORT_API_KEY=abcdef123456\n');

  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    const km = new KeychainManager();

    // Write a file that leaks the 12-char secret
    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-c1-leak-'));
    fs.writeFileSync(path.join(worktreeDir, 'config.py'), "KEY = 'abcdef123456'");

    const clean = (km as any).scanForLeaks(worktreeDir);
    expect(clean).toBe(false); // should detect the 12-char secret

    fs.rmSync(worktreeDir, { recursive: true });
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('5-char value does NOT trigger false positive (C1)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-c1-short-'));
  fs.writeFileSync(path.join(tmpDir, '.env'), 'DEBUG=true\nPORT=3000\n');

  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    const km = new KeychainManager();

    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-c1-clean-'));
    fs.writeFileSync(path.join(worktreeDir, 'config.py'), "DEBUG = True\nPORT = 3000");

    const clean = (km as any).scanForLeaks(worktreeDir);
    expect(clean).toBe(true); // short values should not trigger

    fs.rmSync(worktreeDir, { recursive: true });
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('secrets loaded from encrypted vault are detected by scanForLeaks (C1)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-c1-vault-'));
  const originalCwd = process.cwd;
  const originalEnv = process.env.VAULT_MASTER_PASSWORD;

  process.cwd = () => tmpDir;

  try {
    // Create vault with a 12-char secret
    const km1 = new KeychainManager();
    km1.initVault('test-password', { SHORT_SECRET: 'secret12char' });

    // Reload with password
    process.env.VAULT_MASTER_PASSWORD = 'test-password';
    const km2 = new KeychainManager();

    // Write a file that leaks the secret
    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-c1-vault-leak-'));
    fs.writeFileSync(path.join(worktreeDir, 'leaked.py'), "API_KEY = 'secret12char'");

    const clean = (km2 as any).scanForLeaks(worktreeDir);
    expect(clean).toBe(false); // should detect the leaked vault secret

    fs.rmSync(worktreeDir, { recursive: true });
  } finally {
    process.cwd = originalCwd;
    if (originalEnv !== undefined) process.env.VAULT_MASTER_PASSWORD = originalEnv;
    else delete process.env.VAULT_MASTER_PASSWORD;
    fs.rmSync(tmpDir, { recursive: true });
  }
});


// ---------------------------------------------------------------------------
// C3: exactMatchSecrets Set deduplication (plan-build-v5)
// ---------------------------------------------------------------------------

test('adding same secret twice results in single entry (C3)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-dedup-'));
  fs.writeFileSync(path.join(tmpDir, '.env'), 'KEY1=short1\n');
  const originalCwd = process.cwd;
  const originalEnv = process.env.VAULT_MASTER_PASSWORD;
  process.cwd = () => tmpDir;
  process.env.VAULT_MASTER_PASSWORD = 'test-dedup-pw';

  try {
    const km = new KeychainManager();
    km.initVault('test-dedup-pw', { SECRET_A: 'my-secret-value-long-enough' });

    // Add same secret twice
    km.addSecret('DUP1', 'short');
    km.addSecret('DUP2', 'short');

    const secrets = (km as any).exactMatchSecrets;
    // Set should deduplicate
    expect(secrets instanceof Set).toBe(true);
    const arr = [...secrets];
    const count = arr.filter((v: string) => v === 'short').length;
    expect(count).toBe(1);
  } finally {
    process.cwd = originalCwd;
    if (originalEnv !== undefined) process.env.VAULT_MASTER_PASSWORD = originalEnv;
    else delete process.env.VAULT_MASTER_PASSWORD;
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('scanForLeaks still detects secret after deduplication (C3)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-dedup-scan-'));
  fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=abcdef1234567890\n');
  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    const km = new KeychainManager();
    // Secret is loaded from .env into exactMatchSecrets

    const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-dedup-leak-'));
    fs.writeFileSync(path.join(worktreeDir, 'config.py'), "KEY = 'abcdef1234567890'");

    const clean = (km as any).scanForLeaks(worktreeDir);
    expect(clean).toBe(false);

    fs.rmSync(worktreeDir, { recursive: true });
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
  }
});


// ---------------------------------------------------------------------------
// A3: scanForLeaks OOM guard (plan-build-v6)
// ---------------------------------------------------------------------------

test('scanForLeaks skips files over 1MB (A3)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-a3-large-'));

  const originalCwd = process.cwd;
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-a3-vault-'));
  fs.writeFileSync(path.join(vaultDir, '.env'), 'SECRET=abcdef1234567890\n');
  process.cwd = () => vaultDir;

  try {
    const km = new KeychainManager();

    // Create a file just over 1MB that contains the secret
    const bigContent = 'x'.repeat(1024 * 1024 + 100) + 'abcdef1234567890';
    fs.writeFileSync(path.join(tmpDir, 'big-file.ts'), bigContent);

    const clean = (km as any).scanForLeaks(tmpDir);
    // Should be true because the large file is skipped (not scanned)
    expect(clean).toBe(true);
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
    fs.rmSync(vaultDir, { recursive: true });
  }
});

test('scanForLeaks skips binary extensions like .png (A3)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-a3-binary-'));

  const originalCwd = process.cwd;
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-a3-vault-bin-'));
  fs.writeFileSync(path.join(vaultDir, '.env'), 'SECRET=abcdef1234567890\n');
  process.cwd = () => vaultDir;

  try {
    const km = new KeychainManager();

    // Write secret into a .png file (should be skipped)
    fs.writeFileSync(path.join(tmpDir, 'image.png'), 'abcdef1234567890');

    const clean = (km as any).scanForLeaks(tmpDir);
    expect(clean).toBe(true); // .png skipped
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
    fs.rmSync(vaultDir, { recursive: true });
  }
});

test('scanForLeaks still scans normal .ts files under 1MB (A3)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-a3-normal-'));

  const originalCwd = process.cwd;
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-a3-vault-normal-'));
  fs.writeFileSync(path.join(vaultDir, '.env'), 'SECRET=abcdef1234567890\n');
  process.cwd = () => vaultDir;

  try {
    const km = new KeychainManager();

    // Write a normal-sized .ts file with the secret
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), 'const key = "abcdef1234567890";');

    const clean = (km as any).scanForLeaks(tmpDir);
    expect(clean).toBe(false); // should detect the leak
  } finally {
    process.cwd = originalCwd;
    fs.rmSync(tmpDir, { recursive: true });
    fs.rmSync(vaultDir, { recursive: true });
  }
});
