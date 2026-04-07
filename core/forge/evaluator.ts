// core/forge/evaluator.ts
// Phase 7 (deferred) — LLM-as-a-Judge for A/B template comparison
//
// Uses Sonnet to grade Variant A vs Variant B based on:
//   - Janitor notes (quality self-report from the clone)
//   - Test pass/fail
//   - Token consumption (efficiency)
//   - Duration (speed)
//   - Files modified vs task scope
//
// Output: WIN_A | WIN_B | TIE — fed to ratchet.ts for promotion tracking.

import Anthropic from '@anthropic-ai/sdk';
import { ShadowResult } from './shadow_runner';

export type EvaluationOutcome = 'WIN_A' | 'WIN_B' | 'TIE';

export interface EvaluationResult {
  outcome: EvaluationOutcome;
  reasoning: string;
  scores: { a: number; b: number }; // 0-100
}

export class ForgeEvaluator {
  private client = new Anthropic();

  /**
   * EVALUATE — grades Variant A vs Variant B.
   * Uses Sonnet (not Haiku — judgment quality matters here).
   * Returns structured EvaluationResult with reasoning.
   */
  public async evaluate(variantA: ShadowResult, variantB: ShadowResult): Promise<EvaluationResult> {
    // TODO: build evaluation prompt comparing A and B metrics
    // TODO: call Sonnet with structured output (EvaluationResult JSON)
    // TODO: log result to forge/events.jsonl via metrics_db
    throw new Error('ForgeEvaluator.evaluate() not yet implemented — Phase 7 deferred');
  }
}
