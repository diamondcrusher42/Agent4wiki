// core/user_agent/agent.ts
// Phase 4 deliverable — User Agent (top-level orchestrator)
//
// Responsibilities:
// 1. Receive input (Telegram / UI / CLI)
// 2. Run ComplexityClassifier to route task
// 3. Maintain conversation state via state.json (compressed every 5-10 turns)
// 4. Dispatch to direct handler / Brain / full pipeline

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ComplexityClassifier, TaskComplexity } from '../routing/classifier';
import { BrainPlanner } from '../brain/planner';

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
  private planner: BrainPlanner;
  private conversationHistory: any[];  // Raw turns — compressed by Summary Pipeline
  private state: UserAgentState;
  private directCount = 0; // Track DIRECT interactions for flushState trigger

  constructor() {
    this.classifier = new ComplexityClassifier();
    this.planner = new BrainPlanner();
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

    this.conversationHistory.push({ role: 'user', content: prompt, timestamp: new Date().toISOString() });

    switch (complexity) {
      case TaskComplexity.DIRECT:
        this.directCount++;
        // Flush state every 5 DIRECT interactions
        if (this.directCount % 5 === 0) {
          await this.flushState();
        }
        return await this.executeDirect(prompt);

      case TaskComplexity.BRAIN_ONLY:
        return await this.routeToBrain(prompt);

      case TaskComplexity.FULL_PIPELINE:
        // Always flush state on FULL_PIPELINE
        await this.flushState();
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

  /**
   * FULL PIPELINE — Brain plans → task.json written to inbox → dispatcher picks up.
   * This is the TS→Python bridge: UserAgent writes, dispatcher.py reads.
   */
  private async triggerFullPipeline(prompt: string): Promise<string> {
    const taskId = `task-${crypto.randomUUID().slice(0, 8)}`;

    const planning = await this.planner.plan(prompt, taskId);

    const task = {
      id: taskId,
      type: 'clone',
      skill: planning.brief.skill,
      objective: planning.brief.objective,
      source: 'user_agent',
      priority: 2,
      required_keys: planning.brief.requiredKeys,
      wiki_pages: planning.brief.wikiContext,
      constraints: planning.brief.constraints,
      timeout_minutes: planning.brief.timeoutMinutes,
      created_at: new Date().toISOString(),
    };

    const inboxDir = path.join(
      process.env.AGENT_BASE_DIR || process.cwd(),
      'brain', 'inbox'
    );
    await fs.promises.mkdir(inboxDir, { recursive: true });

    const inboxPath = path.join(inboxDir, `${taskId}.json`);
    await fs.promises.writeFile(inboxPath, JSON.stringify(task, null, 2));

    // Track active task
    this.state.active_worktrees.push(taskId);
    this.state.current_intent = prompt.slice(0, 200);

    console.log(`[USER AGENT] Task ${taskId} → brain/inbox/`);
    return `Task queued: ${taskId}. Dispatcher will pick it up and report results.`;
  }

  /**
   * FLUSH STATE — write state.json to disk.
   * Called on: (a) FULL_PIPELINE trigger, (b) every 5 DIRECT interactions.
   * NOT called per-turn — that burns tokens on trivial turns.
   */
  private async flushState(): Promise<void> {
    this.state.last_updated = new Date().toISOString();

    // Compress history every 10 turns
    if (this.conversationHistory.length % 10 === 0 && this.conversationHistory.length > 0) {
      await this.compressHistory();
    }

    this.saveState();
  }

  /**
   * SUMMARY PIPELINE: Compress conversation history every N turns.
   * Uses a small local model (BitNet 2B) — zero API cost.
   * Writes compressed digest to state.json.
   */
  private async compressHistory(): Promise<void> {
    // TODO: Call local BitNet model to compress conversationHistory
    // MVP: simple truncation
    this.state.recent_context_summary = this.conversationHistory
      .slice(-5)
      .map(h => `${h.role}: ${(h.content || '').slice(0, 100)}`)
      .join('\n');
    this.state.last_updated = new Date().toISOString();
  }

  private loadState(): UserAgentState {
    const statePath = path.join(
      process.env.AGENT_BASE_DIR || process.cwd(),
      'state', 'user_agent', 'state.json'
    );
    try {
      return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    } catch {
      return {
        last_updated: new Date().toISOString(),
        current_intent: '',
        active_worktrees: [],
        open_items: [],
        recent_context_summary: '',
        confidence_score: 1.0
      };
    }
  }

  private saveState(): void {
    const stateDir = path.join(
      process.env.AGENT_BASE_DIR || process.cwd(),
      'state', 'user_agent'
    );
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(
        path.join(stateDir, 'state.json'),
        JSON.stringify(this.state, null, 2)
      );
    } catch (err) {
      console.error(`[USER AGENT] Failed to save state: ${err}`);
    }
  }
}
