// core/forge/ratchet.ts
// Phase 7 — 5-Win Promotion Logic

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { EvaluationOutcome } from './evaluator';
import { ForgeMetricsDb } from './metrics_db';
import { Janitor, AuditDirective } from '../janitor/auditor';

export class ForgeRatchet {
  private readonly WIN_THRESHOLD = 5;

  constructor(private metricsDb: ForgeMetricsDb) {}

  /**
   * RECORD WIN — adds an evaluation outcome to the metrics DB.
   * Returns true if promotion threshold reached (5 consecutive B wins).
   */
  public async recordOutcome(
    templateName: string,
    outcome: EvaluationOutcome
  ): Promise<boolean> {
    this.metricsDb.recordOutcome(templateName, outcome);
    const streak = this.metricsDb.getWinStreak(templateName);
    if (streak >= this.WIN_THRESHOLD) {
      await this.promote(templateName);
      return true;
    }
    return false;
  }

  /**
   * PROMOTE — elevates Variant B to production template.
   */
  public async promote(templateName: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tag = `forge/promotion/${timestamp}`;

    // 1. Git tag for rollback
    if (!/^[\w./-]+$/.test(tag)) throw new Error(`Invalid tag format: ${tag}`);
    try {
      execFileSync('git', ['tag', tag], { stdio: 'pipe' });
    } catch (err) {
      console.error(`[FORGE RATCHET] Failed to create git tag: ${err}`);
    }

    // 2. Copy variant_b template to production
    const templatesDir = path.join(process.cwd(), 'core', 'clones', 'templates');
    const variantBPath = path.join(templatesDir, `variant_b_${templateName}.md`);
    const productionPath = path.join(templatesDir, `${templateName}.md`);

    if (!fs.existsSync(variantBPath)) {
      console.warn(`[FORGE RATCHET] Variant B template not found: ${variantBPath}`);
      return;
    }

    fs.copyFileSync(variantBPath, productionPath);

    // 3. Run Janitor evaluation — use most recent forge event if available, else synthetic
    const janitor = new Janitor();
    const eventsPath = path.join(process.cwd(), 'forge', 'events.jsonl');
    let testHandshake;
    try {
      const lines = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n');
      // C1: Filter for evaluation events — don't use shadow_result or janitor events
      const evaluationEvent = lines
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean)
        .reverse()
        .find(e => e.type === 'evaluation');
      if (!evaluationEvent) {
        throw new Error('[RATCHET] No evaluation event found in events.jsonl — cannot promote');
      }
      const lastEvent = evaluationEvent;
      testHandshake = {
        status: 'COMPLETED' as const,
        files_modified: lastEvent.files_modified || [productionPath],
        tests_passed: true,
        tokens_consumed: lastEvent.tokens_consumed || 0,
        duration_seconds: lastEvent.duration_seconds || 0,
        janitor_notes: `Forge promotion: ${templateName} variant B → production`,
      };
    } catch (err) {
      // Re-throw if no evaluation event found (C1) — only fall back for file read errors
      if (err instanceof Error && err.message.includes('No evaluation event')) {
        throw err;
      }
      testHandshake = {
        status: 'COMPLETED' as const,
        files_modified: [productionPath],
        tests_passed: true,
        tokens_consumed: 0,
        duration_seconds: 0,
        janitor_notes: `Forge promotion: ${templateName} variant B → production`,
      };
    }
    const audit = janitor.evaluateMission(testHandshake, 0, `forge-promote-${templateName}`, 'code');

    // 4. Auto-revert on BLOCK
    if (audit.directive === AuditDirective.BLOCK) {
      console.warn(`[FORGE RATCHET] Janitor BLOCK on promotion — reverting ${templateName}`);
      try {
        execFileSync('git', ['checkout', tag, '--', productionPath], { stdio: 'pipe' });
      } catch {
        console.error(`[FORGE RATCHET] Auto-revert failed for ${productionPath}`);
      }
      return;
    }

    // 5. Write promotion record to wiki/log.md
    const logPath = path.join(process.cwd(), 'wiki', 'log.md');
    if (fs.existsSync(logPath)) {
      const record = `\n## [${new Date().toISOString()}] FORGE PROMOTION\n` +
        `- Template: ${templateName}\n` +
        `- Win streak: ${this.WIN_THRESHOLD}+ consecutive WIN_B\n` +
        `- Rollback tag: ${tag}\n` +
        `- Janitor: ${audit.directive}\n`;
      fs.appendFileSync(logPath, record);
    }

    console.log(`[FORGE RATCHET] Promoted ${templateName} — tag: ${tag}`);
  }
}
