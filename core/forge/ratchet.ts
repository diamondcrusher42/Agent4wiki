// core/forge/ratchet.ts
// Phase 7 (deferred) — 5-Win Promotion Logic
//
// Tracks win/loss ratios for Variant B vs Variant A.
// If Variant B wins 5 times in a row → promotes B to production by
// rewriting the template in core/clones/templates/.
//
// Before any promotion:
//   1. git tag forge/promotion/<timestamp> (rollback point)
//   2. Janitor veto check (Janitor can reject if quality regresses)
//   3. Write to wiki/log.md: promotion record with before/after metrics

import { EvaluationOutcome } from './evaluator';
import { ForgeMetricsDb } from './metrics_db';

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
    // TODO: increment/reset win streak in metrics_db
    // TODO: if streak >= WIN_THRESHOLD: trigger promote()
    throw new Error('ForgeRatchet.recordOutcome() not yet implemented — Phase 7 deferred');
  }

  /**
   * PROMOTE — elevates Variant B to production template.
   * Creates rollback tag, checks Janitor veto, rewrites template file.
   */
  private async promote(templateName: string): Promise<void> {
    // TODO: git tag forge/promotion/<timestamp>
    // TODO: copy variant_b_<template>.md → core/clones/templates/<template>.md
    // TODO: run Janitor.evaluateMission() on a test handshake with new template
    // TODO: if BLOCK from Janitor: git checkout <tag> -- <templatePath> (auto-revert)
    // TODO: write promotion record to wiki/log.md
    throw new Error('ForgeRatchet.promote() not yet implemented — Phase 7 deferred');
  }
}
