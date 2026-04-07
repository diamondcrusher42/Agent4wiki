// core/user_agent/agent.ts
// Phase 3 deliverable — User Agent (top-level orchestrator)
//
// Responsibilities:
// 1. Receive input (Telegram / UI / CLI)
// 2. Run ComplexityClassifier to route task
// 3. Maintain conversation state via state.json (compressed every 5-10 turns)
// 4. Dispatch to direct handler / Brain / full pipeline

import { ComplexityClassifier, TaskComplexity } from '../routing/classifier';
// import { BrainSegment } from '../brain/brain';
// import { MemoryStore } from '../memory_store/interface';
// import { KeychainManager } from '../keychain/manager';

export interface UserAgentState {
  last_updated: string;           // ISO timestamp
  current_intent: string;         // What the user is working on right now
  active_worktrees: string[];     // Clone IDs currently running
  open_items: string[];           // Unresolved tasks
  recent_context_summary: string; // Compressed from last N turns by local model
  confidence_score: number;       // 0-1 — how confident the compression is
}

export class UserAgent {
  private classifier: ComplexityClassifier;
  private conversationHistory: any[];  // Raw turns — compressed by Summary Pipeline
  private state: UserAgentState;

  constructor() {
    this.classifier = new ComplexityClassifier();
    this.conversationHistory = [];
    this.state = this.loadState();
  }

  /**
   * MAIN ENTRY POINT — called for every incoming user message.
   * Route: DIRECT (<1s) | BRAIN_ONLY (2-5s) | FULL_PIPELINE (10-60s+)
   */
  public async handleUserInput(prompt: string): Promise<string> {
    console.log(`[USER AGENT] Received prompt. Classifying...`);

    const complexity = this.classifier.classify(prompt);
    console.log(`[ROUTING] Task classified as: ${complexity}`);

    // Compress history every 10 turns to keep context lean
    if (this.conversationHistory.length % 10 === 0) {
      await this.compressHistory();
    }

    switch (complexity) {
      case TaskComplexity.DIRECT:
        // Fast, zero-cost. Local model (BitNet 2B) or hardcoded response.
        // Never wakes the Brain or Keychain.
        return await this.executeDirect(prompt);

      case TaskComplexity.BRAIN_ONLY:
        // Brain reads L0/L1 Memory, answers without spawning Clones.
        // Keychain not involved. No worktrees created.
        return await this.routeToBrain(prompt);

      case TaskComplexity.FULL_PIPELINE:
        // Full V4 sequence:
        // Brain plans → Keychain provisions → Clones execute → Janitor audits
        return await this.triggerFullPipeline(prompt);
    }
  }

  private async executeDirect(prompt: string): Promise<string> {
    // TODO: Call BitNet 2B local model or return scripted response
    // No API call — zero cost, <1s latency
    return "Direct response placeholder";
  }

  private async routeToBrain(prompt: string): Promise<string> {
    // TODO: Wake Brain session with L0 context + prompt
    // Brain reads wiki, answers, no Clones spawned
    return "Brain-only response placeholder";
  }

  private async triggerFullPipeline(prompt: string): Promise<string> {
    // TODO: Dispatcher creates task file → Brain plans → Keychain provisions
    // → Clones execute in worktrees → Janitor audits → results merged
    return "Full pipeline triggered — see dispatcher";
  }

  /**
   * SUMMARY PIPELINE: Compress conversation history every N turns.
   * Uses a small local model (BitNet 2B) — zero API cost.
   * Writes compressed digest to state.json.
   */
  private async compressHistory(): Promise<void> {
    // TODO: Call local BitNet model to compress conversationHistory
    // Update state.recent_context_summary
    // Keep state.json under 500 tokens total
    this.state.last_updated = new Date().toISOString();
    this.saveState();
  }

  private loadState(): UserAgentState {
    // TODO: Read from state/user_agent/state.json
    return {
      last_updated: new Date().toISOString(),
      current_intent: '',
      active_worktrees: [],
      open_items: [],
      recent_context_summary: '',
      confidence_score: 1.0
    };
  }

  private saveState(): void {
    // TODO: Write to state/user_agent/state.json (atomic write)
  }
}
