// core/forge/metrics_db.ts
// Phase 7 — Lightweight SQLite metrics store for Forge
// Tracks latency, token usage, janitor rejection rates, win/loss streaks.

import Database from 'better-sqlite3';
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
  private db: Database.Database;

  constructor(dbPath: string = 'state/memory/forge_metrics.db') {
    this.db = new Database(dbPath);
    this.init();
  }

  public init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_name TEXT, skill TEXT, directive TEXT,
        tokens_consumed INTEGER, duration_seconds REAL,
        janitor_notes TEXT, timestamp TEXT
      );
      CREATE TABLE IF NOT EXISTS ab_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_name TEXT, outcome TEXT, timestamp TEXT
      );
    `);
  }

  /**
   * Record a metric from a shadow run or other forge operation.
   * This is the bridge between events.jsonl (append-only log) and the metrics table (budget tracking).
   */
  public recordMetric(data: { run_id: string; tokens_consumed: number; duration_ms: number; model: string; task_type: string }): void {
    this.db.prepare(`INSERT INTO metrics VALUES (null,?,?,?,?,?,?,?)`)
      .run(data.task_type, data.task_type, 'NOTE',
           data.tokens_consumed, data.duration_ms / 1000,
           `run_id=${data.run_id}`, new Date().toISOString());
  }

  public insertMetric(row: MetricRow): void {
    this.db.prepare(`INSERT INTO metrics VALUES (null,?,?,?,?,?,?,?)`)
      .run(row.template_name, row.skill, row.directive,
           row.tokens_consumed, row.duration_seconds,
           row.janitor_notes, row.timestamp);
  }

  public getWinStreak(templateName: string): number {
    const rows = this.db.prepare(
      `SELECT outcome FROM ab_outcomes WHERE template_name=? ORDER BY id DESC LIMIT 10`
    ).all(templateName) as {outcome: string}[];
    let streak = 0;
    for (const row of rows) {
      if (row.outcome === 'WIN_B') streak++;
      else break;
    }
    return streak;
  }

  public recordOutcome(templateName: string, outcome: EvaluationOutcome): void {
    this.db.prepare(`INSERT INTO ab_outcomes VALUES (null,?,?,?)`)
      .run(templateName, outcome, new Date().toISOString());
  }

  /**
   * A3: Sum tokens consumed in the current cycle (since midnight UTC today).
   */
  public getTotalTokensThisCycle(): number {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const cycleStart = today.toISOString();

    const row = this.db.prepare(
      `SELECT COALESCE(SUM(tokens_consumed), 0) as total FROM metrics WHERE timestamp >= ?`
    ).get(cycleStart) as { total: number };
    return row.total;
  }

  public close(): void {
    this.db.close();
  }
}
