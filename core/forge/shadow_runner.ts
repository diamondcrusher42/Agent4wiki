// core/forge/shadow_runner.ts
// Phase 7 — Parallel shadow execution for A/B template testing

import * as fs from 'fs';
import * as path from 'path';
import { CloneWorker, CloneResult } from '../clones/clone_worker';
import { MissionBrief } from '../brain/planner';
import { ForgeMetricsDb } from './metrics_db';

/** Default budget cap: 50000 tokens per daily cycle */
const DEFAULT_MAX_SHADOW_BUDGET_TOKENS = 50000;
/** Estimated tokens per shadow run (conservative) */
const ESTIMATED_TOKENS_PER_RUN = 5000;

export interface ShadowResult {
  variant: 'A' | 'B';
  taskId: string;
  directive: string;
  tokensConsumed: number;
  durationSeconds: number;
  janitorNotes: string;
  templatePath: string;
  filesModified?: string[];
  codePreview?: string;
}

export class ShadowRunner {
  private maxBudgetTokens: number;

  constructor(
    private cloneWorker: CloneWorker,
    private metricsDb?: ForgeMetricsDb,
    maxBudgetTokens?: number,
  ) {
    this.maxBudgetTokens = maxBudgetTokens ?? DEFAULT_MAX_SHADOW_BUDGET_TOKENS;
  }

  /**
   * RUN SHADOW — spawns Variant B in background, returns its result.
   * Returns null if budget cap is exceeded (evaluator treats null as skip).
   */
  public async runShadow(brief: MissionBrief, variantBTemplatePath: string): Promise<ShadowResult | null> {
    // A3: Check budget before launching variant B
    if (this.metricsDb) {
      const currentSpend = this.metricsDb.getTotalTokensThisCycle();
      if (currentSpend + ESTIMATED_TOKENS_PER_RUN > this.maxBudgetTokens) {
        console.warn(`[FORGE] Budget cap reached (${currentSpend} tokens). Skipping shadow run.`);
        return null;
      }
    }

    // Deep clone the brief, override templatePath
    const shadowBrief: MissionBrief = JSON.parse(JSON.stringify(brief));
    const shadowId = `shadow-${brief.id}-${Date.now()}`;

    const startTime = Date.now();

    // Run via CloneWorker — full lifecycle
    const result: CloneResult = await this.cloneWorker.execute(
      shadowBrief,
      {
        skill: 'code',
        templatePath: variantBTemplatePath,
        requiredKeys: brief.requiredKeys,
        priority: 5, // background priority
      },
      shadowId
    );

    const durationSeconds = (Date.now() - startTime) / 1000;

    const shadowResult: ShadowResult = {
      variant: 'B',
      taskId: shadowId,
      directive: result.directive,
      tokensConsumed: result.tokensConsumed,
      durationSeconds,
      janitorNotes: result.feedback,
      templatePath: variantBTemplatePath,
      filesModified: result.filesModified,
    };

    // Write result to forge/events.jsonl
    const eventsPath = path.join(process.cwd(), 'forge', 'events.jsonl');
    const dir = path.dirname(eventsPath);
    fs.mkdirSync(dir, { recursive: true });
    const record = {
      type: 'shadow_result',
      ...shadowResult,
      timestamp: new Date().toISOString(),
    };
    fs.appendFileSync(eventsPath, JSON.stringify(record) + '\n');

    return shadowResult;
  }
}
