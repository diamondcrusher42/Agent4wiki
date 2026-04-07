// core/forge/shadow_runner.ts
// Phase 7 (deferred) — Parallel shadow execution for A/B template testing
//
// Spawns a background clone using an experimental Mission Brief template
// (Variant B) while Variant A runs in production. Neither clone knows about
// the other. Results feed into evaluator.ts for comparison.
//
// Forge/Janitor territory rule ([[segment-janitor]]):
//   Janitor runs first (reactive, identifies current problems).
//   Forge runs after (proactive, builds alternatives).
//   Janitor can VETO a Forge promotion.

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
}

export class ShadowRunner {
  constructor(private cloneWorker: CloneWorker) {}

  /**
   * RUN SHADOW — spawns Variant B in background, returns its result.
   * Does not affect production execution.
   * Called by Forge after production clone (Variant A) completes.
   */
  public async runShadow(brief: MissionBrief, variantBTemplatePath: string): Promise<ShadowResult> {
    // TODO: deep clone the brief, override templatePath with variantBTemplatePath
    // TODO: run via CloneWorker (full lifecycle, isolated worktree)
    // TODO: capture result WITHOUT merging (even on NOTE — shadow never reaches main)
    // TODO: write result to metrics_db
    throw new Error('ShadowRunner.runShadow() not yet implemented — Phase 7 deferred');
  }
}
