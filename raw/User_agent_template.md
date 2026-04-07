# User Agent
## Its sole job is to maintain the conversation state, compress history so it never runs out of tokens, and act as the Complexity Classifier to route tasks efficiently.

### The Complexity Classifier (The Router)
### For the MVP, we do not want to use an LLM to classify tasks, because that adds an API call (and latency) before the system even starts working. We use a fast, regex-based heuristic engine.

// core/routing/classifier.ts

export enum TaskComplexity {
  DIRECT = 'DIRECT',           // Handled immediately by the User Agent
  BRAIN_ONLY = 'BRAIN_ONLY',   // Handled by the Brain (No Clones needed)
  FULL_PIPELINE = 'FULL_PIPELINE' // Requires Clones, Worktrees, and the Janitor
}

export class ComplexityClassifier {
  
  // Triggers that require executing code, reading files, or complex orchestration
  private fullPipelineKeywords = [
    'build', 'write a script', 'migrate', 'deploy', 'scrape', 
    'refactor', 'test', 'docker', 'react', 'tailwind'
  ];

  // Triggers that require deep thought or wiki access, but no physical execution
  private brainOnlyKeywords = [
    'plan', 'explain', 'summarize', 'research', 'how do i', 'compare'
  ];

  public classify(userPrompt: string): TaskComplexity {
    const prompt = userPrompt.toLowerCase();

    // 1. Check for heavy execution triggers first
    if (this.fullPipelineKeywords.some(kw => prompt.includes(kw))) {
      return TaskComplexity.FULL_PIPELINE;
    }

    // 2. Check for planning/knowledge triggers
    if (this.brainOnlyKeywords.some(kw => prompt.includes(kw))) {
      return TaskComplexity.BRAIN_ONLY;
    }

    // 3. Fallback to basic conversational handling
    return TaskComplexity.DIRECT;
  }
}


### The User Agent (The Orchestrator)
### This class sits at the very top. It receives your terminal or UI input, maintains state.json, runs the classifier, and dispatches the task.

// core/user_agent/agent.ts

import { ComplexityClassifier, TaskComplexity } from '../routing/classifier';
// import { BrainSegment } from '../brain'; 
// import { MemoryStore } from '../memory_store/interface';

export class UserAgent {
  private classifier: ComplexityClassifier;
  private conversationHistory: any[]; // Managed by the Summary Pipeline

  constructor() {
    this.classifier = new ComplexityClassifier();
    this.conversationHistory = [];
  }

  public async handleUserInput(prompt: string) {
    console.log(`[USER AGENT] Received prompt. Classifying...`);
    
    const complexity = this.classifier.classify(prompt);
    console.log(`[ROUTING] Task classified as: ${complexity}`);

    switch (complexity) {
      case TaskComplexity.DIRECT:
        // Level 0: Fast, cheap response. (e.g., "Hello", "Clear my screen")
        // Uses a cheap local model like Llama 3 8B or BitNet if available.
        return await this.executeDirect(prompt);

      case TaskComplexity.BRAIN_ONLY:
        // Level 1: Requires wiki knowledge or deep planning, but no files changed.
        // Routes to Sonnet/Opus, but skips the Clone/Worktree/Keychain overhead.
        return await this.routeToBrain(prompt);

      case TaskComplexity.FULL_PIPELINE:
        // Level 2: The heavy lifter. 
        // Wakes the Brain -> Provisions Keychain -> Spawns Clones -> Janitor Audits
        return await this.triggerFullPipeline(prompt);
    }
  }

  private async executeDirect(prompt: string) {
    // Basic LLM call, no tools, low latency.
    return "Direct response: How can I help you build today?";
  }

  private async routeToBrain(prompt: string) {
    // Brain wakes up, reads L0/L1 Memory, answers without spawning clones.
    // ...
  }

  private async triggerFullPipeline(prompt: string) {
    // The massive V4 architecture sequence.
    // ...
  }
}


### The Summary Pipeline & state.json
### o keep the User Agent fast, we cannot feed it an endlessly growing chat log. After every 5-10 conversational turns, a background task (perfect for a small local model) reads the raw chat and compresses it into a structured state.json

// state/user_agent/state.json
{
  "last_updated": "2026-04-08T12:34:16Z",
  "current_intent": "Setting up the Phase 3 routing logic",
  "active_worktrees": ["clone-842"],
  "open_items": [
    "Verify MemPalace MCP connection",
    "Test Keychain JIT injection"
  ],
  "recent_context_summary": "User is actively building the V4 architecture. We just completed Phase 1 (Memory) and Phase 2 (Keychain). Moving into User Agent routing.",
  "confidence_score": 0.95
}