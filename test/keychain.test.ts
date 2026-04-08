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
