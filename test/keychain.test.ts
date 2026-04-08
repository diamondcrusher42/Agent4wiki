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
