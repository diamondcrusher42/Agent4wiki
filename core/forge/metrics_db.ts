// core/forge/metrics_db.ts
// Phase 7 (deferred) — Lightweight SQLite metrics store for Forge
//
// Tracks over time:
//   - Latency (duration_seconds) per skill/template
//   - Token usage (tokens_consumed) per skill/template
//   - Janitor rejection rates (BLOCK/SUGGEST counts)
//   - Win/loss streaks for A/B comparisons
//
// SQLite chosen over JSONL for Forge metrics because:
//   - Queries (avg latency, win streak) are easier in SQL than JSONL scan
//   - The Forge is the only writer → no concurrency issues
//   - JSONL (forge/events.jsonl) remains the Janitor's append-only audit log
//
// NOTE: metrics DB lives in state/ (gitignored) — it's runtime data.
// Database path: state/memory/forge_metrics.db

import { EvaluationOutcome } from './evaluator';

export interface MetricRow {
  template_name: string;
  skill: string;
  directive: string;
  tokens_consumed: number;
  duration_seconds: number;
  janitor_notes: string;
  timestamp: string;
}

export class ForgeMetricsDb {
  private dbPath: string;

  constructor(dbPath: string = 'state/memory/forge_metrics.db') {
    this.dbPath = dbPath;
  }

  public async init(): Promise<void> {
    // TODO: open SQLite connection (better-sqlite3 or sqlite3 npm package)
    // TODO: CREATE TABLE IF NOT EXISTS metrics (...)
    // TODO: CREATE TABLE IF NOT EXISTS ab_outcomes (template, outcome, timestamp)
    throw new Error('ForgeMetricsDb.init() not yet implemented — Phase 7 deferred');
  }

  public async insertMetric(row: MetricRow): Promise<void> {
    throw new Error('ForgeMetricsDb.insertMetric() not yet implemented — Phase 7 deferred');
  }

  public async getWinStreak(templateName: string): Promise<number> {
    // Returns current consecutive B-win count for the given template
    throw new Error('ForgeMetricsDb.getWinStreak() not yet implemented — Phase 7 deferred');
  }

  public async recordOutcome(templateName: string, outcome: EvaluationOutcome): Promise<void> {
    throw new Error('ForgeMetricsDb.recordOutcome() not yet implemented — Phase 7 deferred');
  }
}
