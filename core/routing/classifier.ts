// core/routing/classifier.ts
// 2-pass ComplexityClassifier (plan-build-v4 A1)
//
// Pass 1: Hardcoded unambiguous patterns (zero cost, no API call)
// Pass 2: Haiku fallback for ambiguous inputs (~$0.0001/call)
//
// This replaces the old substring keyword matching which had extreme
// false-positive rates ("run", "test", "clone", "fetch" etc.).

import Anthropic from '@anthropic-ai/sdk';

export enum TaskComplexity {
  DIRECT        = 'DIRECT',         // Handled immediately by User Agent (local model / no API)
  BRAIN_ONLY    = 'BRAIN_ONLY',     // Brain answers — no Clones, no Keychain, no worktrees
  FULL_PIPELINE = 'FULL_PIPELINE'   // Full V4: Brain → Keychain → Clones → Janitor
}

// Pass 1 — hardcoded unambiguous DIRECT (saves a Haiku call for common interactions)
const DIRECT_PATTERNS: RegExp[] = [
  // Greetings
  /^(hi|hello|hey|good morning|good evening|good afternoon|yo|sup)\b/,
  // Acknowledgements
  /^(ok|okay|got it|thanks|thank you|cheers|perfect|great|awesome|sounds good|makes sense)\b/,
  // Simple yes/no/confirmation
  /^(yes|no|sure|nope|yep|yup|definitely|absolutely|agreed)\b/,
  // Short questions that are clearly conversational
  /^(what('s| is) (the )?(time|date|day|weather))/,
  /^(how are you|how's it going|what's up)\b/,
];

// Pass 1 — hardcoded unambiguous FULL_PIPELINE (phrase-level, not substring)
const FULL_PIPELINE_UNAMBIGUOUS: RegExp[] = [
  // Must include a verb + object that unambiguously implies file/code execution
  /\b(write|create|build|implement|generate|make)\s+(a\s+)?(script|file|function|class|module|api|endpoint|cli|tool|app|program|bot)\b/,
  /\b(refactor|debug|fix|patch)\s+(the\s+)?(code|bug|error|issue|test|function)\b/,
  /\b(run|execute)\s+(this\s+)?(script|command|test suite|migration)\b/,
  /\b(deploy|push to|commit to|publish to)\s+(github|prod|staging|main|heroku)\b/,
  /\b(set up|configure|install)\s+(the\s+)?(server|database|docker|nginx|cron)\b/,
];

export class ComplexityClassifier {
  private anthropic: Anthropic;

  constructor(anthropic?: Anthropic) {
    this.anthropic = anthropic ?? new Anthropic();
  }

  /**
   * 2-pass classification:
   * 1. Hardcoded patterns for unambiguous DIRECT and FULL_PIPELINE
   * 2. Haiku call for everything else
   */
  public async classify(userPrompt: string): Promise<TaskComplexity> {
    const lower = userPrompt.toLowerCase().trim();

    // Pass 1: unambiguous patterns — no API call needed
    if (DIRECT_PATTERNS.some(p => p.test(lower))) return TaskComplexity.DIRECT;
    if (FULL_PIPELINE_UNAMBIGUOUS.some(p => p.test(lower))) return TaskComplexity.FULL_PIPELINE;

    // Pass 2: ambiguous — ask Haiku
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        system: [
          'Classify the user request. Reply with exactly one word only: DIRECT, BRAIN_ONLY, or FULL_PIPELINE.',
          'DIRECT = greeting, simple question, chitchat, acknowledgement — no tools needed',
          'BRAIN_ONLY = explanation, analysis, planning, advice — no file writes or code execution',
          'FULL_PIPELINE = must write files, run code, call external APIs, or use system tools',
          'When in doubt, prefer BRAIN_ONLY over FULL_PIPELINE.',
        ].join('\n'),
        messages: [{ role: 'user', content: userPrompt }],
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('')
        .trim()
        .toUpperCase();

      if (text === 'DIRECT') return TaskComplexity.DIRECT;
      if (text === 'FULL_PIPELINE') return TaskComplexity.FULL_PIPELINE;
      if (text === 'BRAIN_ONLY') return TaskComplexity.BRAIN_ONLY;

      // Unexpected response — safe fallback
      return TaskComplexity.BRAIN_ONLY;
    } catch (err) {
      console.error('[CLASSIFIER] Haiku call failed, falling back to BRAIN_ONLY:', err);
      return TaskComplexity.BRAIN_ONLY;
    }
  }
}
