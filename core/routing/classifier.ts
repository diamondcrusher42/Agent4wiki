// core/routing/classifier.ts
// Phase 3 deliverable — Complexity Classifier (User Agent router)
//
// MVP: regex-based heuristics, NOT an LLM.
// Using an LLM for classification adds an API call before the system starts working.
// Heuristics are fast, zero-cost, and sufficient for the initial routing decision.
// See: wiki/concepts/concept-token-economics.md, review-gemini-review3

export enum TaskComplexity {
  DIRECT        = 'DIRECT',         // Handled immediately by User Agent (local model / no API)
  BRAIN_ONLY    = 'BRAIN_ONLY',     // Brain answers — no Clones, no Keychain, no worktrees
  FULL_PIPELINE = 'FULL_PIPELINE'   // Full V4: Brain → Keychain → Clones → Janitor
}

export class ComplexityClassifier {

  // Triggers that require executing code, reading files, or physical orchestration
  private fullPipelineKeywords = [
    'build', 'write a script', 'migrate', 'deploy', 'scrape',
    'refactor', 'test', 'docker', 'react', 'tailwind',
    'run', 'execute', 'fetch', 'search', 'install', 'create a file',
    'commit', 'push', 'clone'
  ];

  // Triggers that require wiki knowledge or deep planning but no execution
  private brainOnlyKeywords = [
    'plan', 'explain', 'summarize', 'research', 'how do i', 'compare',
    'what is', 'should i', 'review', 'analyse', 'analyze', 'describe'
  ];

  public classify(userPrompt: string): TaskComplexity {
    const prompt = userPrompt.toLowerCase();

    // 1. Check for heavy execution triggers first (highest priority)
    if (this.fullPipelineKeywords.some(kw => prompt.includes(kw))) {
      return TaskComplexity.FULL_PIPELINE;
    }

    // 2. Check for planning / knowledge triggers
    if (this.brainOnlyKeywords.some(kw => prompt.includes(kw))) {
      return TaskComplexity.BRAIN_ONLY;
    }

    // 3. Fallback: direct conversational response, no API call needed
    return TaskComplexity.DIRECT;
  }
}
