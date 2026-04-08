/**
 * Tests for core/clones/lifecycle/ — Phase 3 (clone lifecycle)
 *
 * These tests exercise spawner, runner (parseHandshake), and teardown.
 * Spawner/teardown tests use the actual git repo (they create real worktrees).
 * Runner tests mock the subprocess layer.
 */

import { CloneSpawner, WorktreeHandle } from '../core/clones/lifecycle/spawner';
import { CloneRunner } from '../core/clones/lifecycle/runner';
import { CloneTeardown } from '../core/clones/lifecycle/teardown';
import { AuditDirective } from '../core/janitor/auditor';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// CloneRunner — parseHandshake (unit tests, no subprocess needed)
// ---------------------------------------------------------------------------

describe('CloneRunner.parseHandshake', () => {
  const runner = new CloneRunner();
  // Access private method for testing
  const parse = (output: string) => (runner as any).parseHandshake(output);

  test('parses handshake from last line of stdout', () => {
    const output = [
      'Debug line 1',
      'Debug line 2',
      '{"status": "COMPLETED", "files_modified": ["a.py"], "tests_passed": true, "tokens_consumed": 500, "duration_seconds": 10, "janitor_notes": "clean"}',
    ].join('\n');

    const result = parse(output);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('COMPLETED');
    expect(result!.files_modified).toEqual(['a.py']);
  });

  test('picks last JSON block, not first', () => {
    const output = [
      '{"status": "debug_not_real"}',
      'some logs in between',
      '{"status": "COMPLETED", "files_modified": [], "tests_passed": true, "tokens_consumed": 100, "duration_seconds": 5, "janitor_notes": "final"}',
    ].join('\n');

    const result = parse(output);
    expect(result).not.toBeNull();
    expect(result!.janitor_notes).toBe('final');
  });

  test('returns null when no JSON found', () => {
    expect(parse('just plain text\nno json here')).toBeNull();
  });

  test('returns null on empty output', () => {
    expect(parse('')).toBeNull();
  });

  test('skips malformed JSON lines', () => {
    const output = [
      '{bad json',
      '{"status": "COMPLETED", "files_modified": [], "tests_passed": true, "tokens_consumed": 0, "duration_seconds": 0, "janitor_notes": "ok"}',
    ].join('\n');

    const result = parse(output);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('COMPLETED');
  });

  test('handles BLOCKED_IMPOSSIBLE status', () => {
    const output = '{"status": "BLOCKED_IMPOSSIBLE", "files_modified": [], "tests_passed": false, "tokens_consumed": 0, "duration_seconds": 0, "janitor_notes": "impossible", "reason": "no access"}';
    const result = parse(output);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('BLOCKED_IMPOSSIBLE');
    expect(result!.reason).toBe('no access');
  });
});

// ---------------------------------------------------------------------------
// CloneSpawner — createWorktree (integration tests, real git)
// ---------------------------------------------------------------------------

describe('CloneSpawner.createWorktree', () => {
  let handle: WorktreeHandle | null = null;

  afterEach(async () => {
    // Always clean up worktrees created during tests
    if (handle) {
      try {
        execSync(`git worktree remove "${handle.path}" --force`, { stdio: 'pipe' });
      } catch { /* may already be removed */ }
      try {
        execSync(`git branch -D "${handle.branch}"`, { stdio: 'pipe' });
      } catch { /* may already be removed */ }
      handle = null;
    }
  });

  test('creates git worktree and returns handle', async () => {
    const spawner = new CloneSpawner();
    handle = await spawner.createWorktree('test-spawn-001', 'code');

    expect(handle.cloneId).toBe('test-spawn-001');
    expect(handle.branch).toBe('clone/test-spawn-001');
    expect(fs.existsSync(handle.path)).toBe(true);
  });

  test('writes setup.sh with correct permissions', async () => {
    const spawner = new CloneSpawner();
    handle = await spawner.createWorktree('test-spawn-002', 'code');

    const setupPath = path.join(handle.path, 'setup.sh');
    expect(fs.existsSync(setupPath)).toBe(true);

    const content = fs.readFileSync(setupPath, 'utf-8');
    expect(content).toContain('#!/bin/bash');
    expect(content).toContain('npm install');
    expect(content).toContain('pip install');

    // Check executable permission
    const stat = fs.statSync(setupPath);
    expect(stat.mode & 0o111).toBeGreaterThan(0); // at least one execute bit
  });

  test('registers worktree in registry.json', async () => {
    const spawner = new CloneSpawner();
    handle = await spawner.createWorktree('test-spawn-003', 'code');

    const registryPath = path.join(process.cwd(), 'state', 'worktrees', 'registry.json');
    expect(fs.existsSync(registryPath)).toBe(true);

    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    expect(registry['test-spawn-003']).toBeDefined();
    expect(registry['test-spawn-003'].branch).toBe('clone/test-spawn-003');
  });
});

// ---------------------------------------------------------------------------
// CloneTeardown (integration tests, real git)
// ---------------------------------------------------------------------------

describe('CloneTeardown', () => {
  test('teardown removes worktree and prunes branch on BLOCK', async () => {
    // Setup: create a worktree first
    const spawner = new CloneSpawner();
    const handle = await spawner.createWorktree('test-teardown-001', 'code');
    expect(fs.existsSync(handle.path)).toBe(true);

    // Teardown with BLOCK (no merge)
    const teardown = new CloneTeardown();
    await teardown.teardown(handle, AuditDirective.BLOCK);

    // Worktree should be gone
    expect(fs.existsSync(handle.path)).toBe(false);

    // Branch should be gone
    const branches = execSync('git branch', { encoding: 'utf-8' });
    expect(branches).not.toContain('clone/test-teardown-001');
  });

  test('teardown merges and cleans up on NOTE', async () => {
    const spawner = new CloneSpawner();
    const handle = await spawner.createWorktree('test-teardown-002', 'code');

    // Create a file in the worktree so there's something to commit
    fs.writeFileSync(
      path.join(handle.path, 'test-output.txt'),
      'Clone output for teardown test'
    );

    const teardown = new CloneTeardown();
    await teardown.teardown(handle, AuditDirective.NOTE);

    // Worktree should be gone
    expect(fs.existsSync(handle.path)).toBe(false);

    // Branch should be gone (merged and pruned)
    const branches = execSync('git branch', { encoding: 'utf-8' });
    expect(branches).not.toContain('clone/test-teardown-002');

    // The merge should have brought the file into our current branch
    // Clean it up so we don't pollute the repo
    try {
      if (fs.existsSync('test-output.txt')) {
        fs.unlinkSync('test-output.txt');
        execSync('git checkout -- test-output.txt 2>/dev/null || git rm -f test-output.txt 2>/dev/null || true', { stdio: 'pipe' });
      }
    } catch { /* cleanup best-effort */ }
  });

  test('teardown removes from registry', async () => {
    const spawner = new CloneSpawner();
    const handle = await spawner.createWorktree('test-teardown-003', 'code');

    const registryPath = path.join(process.cwd(), 'state', 'worktrees', 'registry.json');
    let registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    expect(registry['test-teardown-003']).toBeDefined();

    const teardown = new CloneTeardown();
    await teardown.teardown(handle, AuditDirective.BLOCK);

    registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    expect(registry['test-teardown-003']).toBeUndefined();
  });
});
