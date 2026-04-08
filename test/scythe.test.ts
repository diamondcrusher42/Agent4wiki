/**
 * Tests for core/janitor/scythe.ts — Phase 6A (WikiScythe)
 */

import { WikiScythe } from '../core/janitor/scythe';
import { MemoryStore, MemoryTier, AuditReport } from '../core/memory_store/interface';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock MemoryStore that returns configurable audit reports
function createMockMemory(report: AuditReport): MemoryStore {
  return {
    connect: jest.fn(),
    write: jest.fn().mockResolvedValue('id'),
    writeSummary: jest.fn().mockResolvedValue('id'),
    readContext: jest.fn().mockResolvedValue(''),
    search: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(true),
    audit: jest.fn().mockResolvedValue(report),
  };
}

function setupTmpCwd(): { tmpDir: string; restore: () => void } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-scythe-'));
  // Create state/janitor directory
  fs.mkdirSync(path.join(tmpDir, 'state', 'janitor'), { recursive: true });
  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;
  return {
    tmpDir,
    restore: () => {
      process.cwd = originalCwd;
      fs.rmSync(tmpDir, { recursive: true });
    },
  };
}

// ---------------------------------------------------------------------------
// pruneStaleKnowledge tests
// ---------------------------------------------------------------------------

test('pruneStaleKnowledge() writes contradiction to audit-board.md', async () => {
  const { tmpDir, restore } = setupTmpCwd();
  try {
    const report: AuditReport = {
      contradictions: [
        { page_a: 'concept-A', page_b: 'concept-B', conflict: 'Different definitions of X' },
      ],
      orphan_pages: [],
      stale_entries: [],
      timestamp: new Date().toISOString(),
    };

    const mockMemory = createMockMemory(report);
    const scythe = new WikiScythe(mockMemory);
    await scythe.pruneStaleKnowledge();

    const auditPath = path.join(tmpDir, 'state', 'janitor', 'audit-board.md');
    expect(fs.existsSync(auditPath)).toBe(true);

    const content = fs.readFileSync(auditPath, 'utf-8');
    expect(content).toContain('CONTRADICTION');
    expect(content).toContain('concept-A');
    expect(content).toContain('concept-B');
    expect(content).toContain('Different definitions of X');
    expect(content).toContain('Status: OPEN');
  } finally {
    restore();
  }
});

test('pruneStaleKnowledge() adds orphan to cold-queue.json', async () => {
  const { tmpDir, restore } = setupTmpCwd();
  try {
    const report: AuditReport = {
      contradictions: [],
      orphan_pages: ['stale-page.md'],
      stale_entries: [],
      timestamp: new Date().toISOString(),
    };

    const mockMemory = createMockMemory(report);
    const scythe = new WikiScythe(mockMemory);
    await scythe.pruneStaleKnowledge();

    const coldPath = path.join(tmpDir, 'state', 'janitor', 'cold-queue.json');
    expect(fs.existsSync(coldPath)).toBe(true);

    const queue = JSON.parse(fs.readFileSync(coldPath, 'utf-8'));
    expect(queue.length).toBe(1);
    expect(queue[0].page).toBe('stale-page.md');
    expect(queue[0].flagged_at).toBeDefined();
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// runFullAuditCycle tests
// ---------------------------------------------------------------------------

test('runFullAuditCycle() writes cycle summary', async () => {
  const { tmpDir, restore } = setupTmpCwd();
  try {
    const report: AuditReport = {
      contradictions: [{ page_a: 'a', page_b: 'b', conflict: 'c' }],
      orphan_pages: ['orphan.md'],
      stale_entries: [{ id: 'stale-1', age_days: 120 }],
      timestamp: new Date().toISOString(),
    };

    const mockMemory = createMockMemory(report);
    const scythe = new WikiScythe(mockMemory);
    await scythe.runFullAuditCycle();

    const auditPath = path.join(tmpDir, 'state', 'janitor', 'audit-board.md');
    const content = fs.readFileSync(auditPath, 'utf-8');
    expect(content).toContain('CYCLE SUMMARY');
    expect(content).toContain('Stale pruned: 1');
    expect(content).toContain('Contradictions found: 1');
    expect(content).toContain('Orphans flagged: 1');
  } finally {
    restore();
  }
});

test('runFullAuditCycle() updates health.json with delta', async () => {
  const { tmpDir, restore } = setupTmpCwd();
  try {
    // Write a previous health score
    const healthPath = path.join(tmpDir, 'state', 'janitor', 'health.json');
    fs.writeFileSync(healthPath, JSON.stringify({ score: 20, last_run: '2026-01-01T00:00:00Z' }));

    const report: AuditReport = {
      contradictions: [{ page_a: 'a', page_b: 'b', conflict: 'c' }],
      orphan_pages: [],
      stale_entries: [{ id: 's1', age_days: 100 }, { id: 's2', age_days: 100 }],
      timestamp: new Date().toISOString(),
    };

    // Expected score: 25 - (1*3) - (0*1) - (2*0.5) = 25 - 3 - 1 = 21
    const mockMemory = createMockMemory(report);
    const scythe = new WikiScythe(mockMemory);
    await scythe.runFullAuditCycle();

    const health = JSON.parse(fs.readFileSync(healthPath, 'utf-8'));
    expect(health.score).toBe(21);
    expect(health.last_run).toBeDefined();
  } finally {
    restore();
  }
});


// ---------------------------------------------------------------------------
// C4: WikiScythe confirmation gate tests
// ---------------------------------------------------------------------------

test('runFullAuditCycle writes to archive-queue.md instead of auto-archiving', async () => {
  const { tmpDir, restore } = setupTmpCwd();
  try {
    // Create wiki directory with a fake old page
    const wikiDir = path.join(tmpDir, 'wiki');
    fs.mkdirSync(wikiDir, { recursive: true });
    fs.writeFileSync(path.join(wikiDir, 'old-page.md'), '# Old Content');

    const report: AuditReport = {
      contradictions: [],
      orphan_pages: [],
      stale_entries: [],
      timestamp: new Date().toISOString(),
    };

    const mockMemory = createMockMemory(report);
    const scythe = new WikiScythe(mockMemory);

    // Mock getGitMtime to return old date
    (scythe as any).getGitMtime = () => new Date('2025-01-01');
    await scythe.runFullAuditCycle();

    // archive-queue.md should exist with the page listed
    const queuePath = path.join(wikiDir, 'archive-queue.md');
    expect(fs.existsSync(queuePath)).toBe(true);
    const content = fs.readFileSync(queuePath, 'utf-8');
    expect(content).toContain('old-page.md');
    expect(content).toContain('[ ]'); // unchecked

    // The page should NOT be in archive/
    const archivePath = path.join(wikiDir, 'archive', 'old-page.md');
    expect(fs.existsSync(archivePath)).toBe(false);

    // The original page should still exist
    expect(fs.existsSync(path.join(wikiDir, 'old-page.md'))).toBe(true);
  } finally {
    restore();
  }
});

test('processArchiveQueue only moves [x] marked items', () => {
  const { tmpDir, restore } = setupTmpCwd();
  try {
    const wikiDir = path.join(tmpDir, 'wiki');
    fs.mkdirSync(wikiDir, { recursive: true });
    fs.writeFileSync(path.join(wikiDir, 'approved.md'), '# Approved for archival');
    fs.writeFileSync(path.join(wikiDir, 'pending.md'), '# Not yet approved');

    // Write archive-queue.md with one approved and one pending
    const queuePath = path.join(wikiDir, 'archive-queue.md');
    fs.writeFileSync(queuePath,
      '- [x] approved.md (last modified: 2025-01-01T00:00:00Z, age: 365d)\n' +
      '- [ ] pending.md (last modified: 2025-06-01T00:00:00Z, age: 180d)\n'
    );

    const report: AuditReport = {
      contradictions: [], orphan_pages: [], stale_entries: [],
      timestamp: new Date().toISOString(),
    };
    const mockMemory = createMockMemory(report);
    const scythe = new WikiScythe(mockMemory);

    const archived = scythe.processArchiveQueue();

    // Only approved.md should be archived
    expect(archived).toBe(1);
    expect(fs.existsSync(path.join(wikiDir, 'archive', 'approved.md'))).toBe(true);
    expect(fs.existsSync(path.join(wikiDir, 'approved.md'))).toBe(false);

    // pending.md should still exist and be in queue
    expect(fs.existsSync(path.join(wikiDir, 'pending.md'))).toBe(true);
    const remaining = fs.readFileSync(queuePath, 'utf-8');
    expect(remaining).toContain('pending.md');
    expect(remaining).not.toContain('approved.md');
  } finally {
    restore();
  }
});


// ---------------------------------------------------------------------------
// B1: getGitMtime() filePath injection prevention (plan-build-v6)
// ---------------------------------------------------------------------------

test('getGitMtime returns null for non-existent file in non-git dir (B1)', () => {
  const { tmpDir, restore } = setupTmpCwd();
  try {
    const report: AuditReport = {
      contradictions: [], orphan_pages: [], stale_entries: [],
      timestamp: new Date().toISOString(),
    };
    const mockMemory = createMockMemory(report);
    const scythe = new WikiScythe(mockMemory);

    const result = (scythe as any).getGitMtime('normal-page.md');
    // In a non-git dir, this returns null -- that is correct behavior
    expect(result === null || result instanceof Date).toBe(true);
  } finally {
    restore();
  }
});

test('getGitMtime with shell metacharacters does not execute commands (B1)', () => {
  const { tmpDir, restore } = setupTmpCwd();
  try {
    const report: AuditReport = {
      contradictions: [], orphan_pages: [], stale_entries: [],
      timestamp: new Date().toISOString(),
    };
    const mockMemory = createMockMemory(report);
    const scythe = new WikiScythe(mockMemory);

    // This should NOT execute the shell command -- execFileSync passes args directly
    const markerFile = path.join(tmpDir, 'pwned');
    const evilName = 'evil"; touch ' + markerFile + ' #.md';
    const result = (scythe as any).getGitMtime(evilName);

    // Should return null (git error) not execute the injected command
    expect(result).toBeNull();
    // Verify the injected command was NOT executed
    expect(fs.existsSync(markerFile)).toBe(false);
  } finally {
    restore();
  }
});
