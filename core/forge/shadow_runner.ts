// core/forge/shadow_runner.ts
// Phase 7 — Parallel shadow execution for A/B template testing

import * as fs from 'fs';
import * as path from 'path';
import { CloneWorker } from '../clones/clone_worker';
import { MissionBrief } from '../brain/planner';

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
  constructor(private cloneWorker: CloneWorker) {}

  /**
   * RUN SHADOW — spawns Variant B in background, returns its result.
   * Does not affect production execution.
   */
  public async runShadow(brief: MissionBrief, variantBTemplatePath: string): Promise<ShadowResult> {
    // Deep clone the brief, override templatePath
    const shadowBrief: MissionBrief = JSON.parse(JSON.stringify(brief));
    const shadowId = `shadow-${brief.id}-${Date.now()}`;

    const startTime = Date.now();

    // Run via CloneWorker — full lifecycle
    const result = await this.cloneWorker.execute(
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
      tokensConsumed: (result as any).tokensConsumed || 0,
      durationSeconds,
      janitorNotes: result.feedback,
      templatePath: variantBTemplatePath,
      filesModified: (result as any).filesModified || [],
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
