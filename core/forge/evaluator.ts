// core/forge/evaluator.ts
// Phase 7 — LLM-as-a-Judge for A/B template comparison

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { ShadowResult } from './shadow_runner';

export type EvaluationOutcome = 'WIN_A' | 'WIN_B' | 'TIE';

export interface EvaluationResult {
  outcome: EvaluationOutcome;
  reasoning: string;
  scores: { a: number; b: number };
}

export class ForgeEvaluator {
  private client: Anthropic;

  constructor(client?: Anthropic) {
    this.client = client || new Anthropic();
  }

  /**
   * EVALUATE — grades Variant A vs Variant B.
   * Uses Sonnet (not Haiku — judgment quality matters).
   */
  public async evaluate(variantA: ShadowResult, variantB: ShadowResult): Promise<EvaluationResult> {
    const codePreviewA = variantA.codePreview ? `\nCode diff A: ${variantA.codePreview}` : '';
    const codePreviewB = variantB.codePreview ? `\nCode diff B: ${variantB.codePreview}` : '';

    const prompt = `You are the Forge Evaluator. Grade two clone runs on the same task.

Variant A: ${variantA.tokensConsumed} tokens, ${variantA.durationSeconds}s, Janitor: ${variantA.janitorNotes}${codePreviewA}
Variant B: ${variantB.tokensConsumed} tokens, ${variantB.durationSeconds}s, Janitor: ${variantB.janitorNotes}${codePreviewB}

Winner is: more correct (Janitor NOTE > SUGGEST), then fewer tokens, then faster.
Reply with exactly one line: WIN_A, WIN_B, or TIE. Then one sentence of reasoning.`;

    const msg = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Parse response
    const outcome = this.parseOutcome(text);
    const reasoning = text.replace(/^(WIN_A|WIN_B|TIE)[.\s]*/i, '').trim();

    const result: EvaluationResult = {
      outcome,
      reasoning,
      scores: this.computeScores(variantA, variantB, outcome),
    };

    // Log to forge/events.jsonl
    const eventsPath = path.join(process.cwd(), 'forge', 'events.jsonl');
    fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
    const record = {
      type: 'evaluation',
      ...result,
      variantA: { taskId: variantA.taskId, tokens: variantA.tokensConsumed, duration: variantA.durationSeconds },
      variantB: { taskId: variantB.taskId, tokens: variantB.tokensConsumed, duration: variantB.durationSeconds },
      timestamp: new Date().toISOString(),
    };
    fs.appendFileSync(eventsPath, JSON.stringify(record) + '\n');

    return result;
  }

  private parseOutcome(text: string): EvaluationOutcome {
    const upper = text.toUpperCase();
    if (upper.startsWith('WIN_A') || upper.includes('WIN_A')) return 'WIN_A';
    if (upper.startsWith('WIN_B') || upper.includes('WIN_B')) return 'WIN_B';
    return 'TIE';
  }

  private computeScores(a: ShadowResult, b: ShadowResult, outcome: EvaluationOutcome): { a: number; b: number } {
    // Simple scoring: winner gets 70, loser 30, tie gets 50/50
    if (outcome === 'WIN_A') return { a: 70, b: 30 };
    if (outcome === 'WIN_B') return { a: 30, b: 70 };
    return { a: 50, b: 50 };
  }
}
