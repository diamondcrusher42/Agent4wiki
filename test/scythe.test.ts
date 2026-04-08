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
