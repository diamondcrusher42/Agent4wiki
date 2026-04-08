// core/janitor/scythe.ts
// The Wiki Scythe — memory maintenance for the Brain's context
// Phase 6A: Wired contradiction detection + cold-tier archival + health scoring

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { MemoryStore, MemoryTier } from '../memory_store/interface';

const AUDIT_BOARD_PATH = 'state/janitor/audit-board.md';
const COLD_QUEUE_PATH = 'state/janitor/cold-queue.json';
const HEALTH_PATH = 'state/janitor/health.json';

export class WikiScythe {
  constructor(private memory: MemoryStore) {}

  /**
   * PRUNE STALE KNOWLEDGE — runs asynchronously on Janitor audit schedule.
   */
  public async pruneStaleKnowledge(olderThan?: Date): Promise<void> {
    const report = await this.memory.audit(olderThan);

    // Delete stale entries
    for (const stale of report.stale_entries) {
      console.log(`[SCYTHE] Pruning stale entry: ${stale.id} (${stale.age_days} days old)`);
      await this.memory.delete(stale.id);
    }

    // Write contradictions to audit board
    for (const contradiction of report.contradictions) {
      console.warn(
        `[SCYTHE] Contradiction detected:\n` +
        `  Page A: ${contradiction.page_a}\n` +
        `  Page B: ${contradiction.page_b}\n` +
        `  Conflict: ${contradiction.conflict}`
      );

      const auditPath = path.join(process.cwd(), AUDIT_BOARD_PATH);
      fs.mkdirSync(path.dirname(auditPath), { recursive: true });
      const entry = `\n## [${new Date().toISOString()}] CONTRADICTION\n` +
        `- Page A: ${contradiction.page_a}\n` +
        `- Page B: ${contradiction.page_b}\n` +
        `- Conflict: ${contradiction.conflict}\n` +
        `- Status: OPEN\n`;
      fs.appendFileSync(auditPath, entry);
    }

    // Flag orphan pages for cold-tier archival
    for (const orphan of report.orphan_pages) {
      console.warn(`[SCYTHE] Orphan page detected: ${orphan}`);

      const coldPath = path.join(process.cwd(), COLD_QUEUE_PATH);
      fs.mkdirSync(path.dirname(coldPath), { recursive: true });
      const queue = fs.existsSync(coldPath) ? JSON.parse(fs.readFileSync(coldPath, 'utf-8')) : [];
      queue.push({ page: orphan, flagged_at: new Date().toISOString() });
      fs.writeFileSync(coldPath, JSON.stringify(queue, null, 2));
    }
  }

  /**
   * FULL AUDIT CYCLE — called weekly or after major architecture changes.
   */
  public async runFullAuditCycle(): Promise<void> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Prune stale entries
    await this.pruneStaleKnowledge(ninetyDaysAgo);

    // Get fresh report for counts
    const report = await this.memory.audit(ninetyDaysAgo);

    // Wiki-tiering pass: archive old wiki pages
    let pagesArchived = 0;
    const wikiDir = path.join(process.cwd(), 'wiki');
    if (fs.existsSync(wikiDir)) {
      const archiveDir = path.join(wikiDir, 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      const wikiFiles = this.getWikiFiles(wikiDir);
      for (const filePath of wikiFiles) {
        const mtime = this.getGitMtime(filePath);
        if (mtime && mtime < ninetyDaysAgo) {
          const basename = path.basename(filePath);
          const destPath = path.join(archiveDir, basename);
          try {
            fs.copyFileSync(filePath, destPath);
            fs.unlinkSync(filePath);
            pagesArchived++;
            console.log(`[SCYTHE] Archived wiki page: ${basename}`);
          } catch (err) {
            console.error(`[SCYTHE] Failed to archive ${basename}: ${err}`);
          }
        }
      }
    }

    // Update audit board with cycle summary
    const auditPath = path.join(process.cwd(), AUDIT_BOARD_PATH);
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    const summary = `\n## [${new Date().toISOString()}] CYCLE SUMMARY\n` +
      `- Stale pruned: ${report.stale_entries.length}\n` +
      `- Contradictions found: ${report.contradictions.length}\n` +
      `- Orphans flagged: ${report.orphan_pages.length}\n` +
      `- Pages archived: ${pagesArchived}\n`;
    fs.appendFileSync(auditPath, summary);

    // Compute health score delta
    const healthPath = path.join(process.cwd(), HEALTH_PATH);
    fs.mkdirSync(path.dirname(healthPath), { recursive: true });

    let previous = { score: 0, last_run: null as string | null };
    if (fs.existsSync(healthPath)) {
      try {
        previous = JSON.parse(fs.readFileSync(healthPath, 'utf-8'));
      } catch { /* use defaults */ }
    }

    const newScore = 25
      - (report.contradictions.length * 3)
      - (report.orphan_pages.length * 1)
      - (report.stale_entries.length * 0.5);

    const delta = newScore - previous.score;
    console.log(`[SCYTHE] Health score: ${newScore} (delta: ${delta >= 0 ? '+' : ''}${delta})`);

    fs.writeFileSync(healthPath, JSON.stringify({
      score: newScore,
      last_run: new Date().toISOString(),
    }, null, 2));
  }

  /**
   * Get all .md files in wiki/ (excluding archive/ and index.md).
   */
  private getWikiFiles(wikiDir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(wikiDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'archive') continue;
      const fullPath = path.join(wikiDir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md') {
        files.push(fullPath);
      } else if (entry.isDirectory()) {
        // Recurse into subdirectories
        const subFiles = this.getWikiFiles(fullPath);
        files.push(...subFiles);
      }
    }
    return files;
  }

  /**
   * Get git modification time for a file. Returns null if not in git.
   */
  private getGitMtime(filePath: string): Date | null {
    try {
      const result = execSync(`git log --format=%ct -1 "${filePath}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const timestamp = parseInt(result.trim(), 10);
      if (isNaN(timestamp)) return null;
      return new Date(timestamp * 1000);
    } catch {
      return null;
    }
  }
}
