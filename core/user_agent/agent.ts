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
import { PromptBuilder } from '../brain/prompt_builder';
import Anthropic from '@anthropic-ai/sdk';
import cloneConfig from '../config/clone_config.json';

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
  private promptBuilder: PromptBuilder;
  private anthropic: Anthropic;
  private conversationHistory: Array<{role: string; content: string; timestamp: string}>;
  private state: UserAgentState;
  private directCount = 0; // Track DIRECT interactions for flushState trigger
  private readonly MAX_HISTORY_ENTRIES = 50;
  private readonly TOKEN_FLUSH_THRESHOLD = 4000; // estimated tokens (~4 chars per token)
  private soulContent: string | null = null; // Cached soul.md content (C2)
  private soulLoadedAt: number = 0;
  private readonly SOUL_TTL_MS = 60_000; // 60 seconds

  constructor(anthropicClient?: Anthropic) {
    this.anthropic = anthropicClient || new Anthropic();
    this.classifier = new ComplexityClassifier(this.anthropic);
    this.planner = new BrainPlanner(this.anthropic);
    this.promptBuilder = new PromptBuilder();
    this.conversationHistory = [];
    this.state = this.loadState();
  }

  /**
   * MAIN ENTRY POINT — called for every incoming user message.
   * Route: DIRECT (<1s) | BRAIN_ONLY (2-5s) | FULL_PIPELINE (10-60s+)
   */
  public async handleUserInput(prompt: string): Promise<string> {
    console.log(`[USER AGENT] Received prompt. Classifying...`);

    const complexity = await this.classifier.classify(prompt);
    console.log(`[ROUTING] Task classified as: ${complexity}`);

    this.conversationHistory.push({ role: 'user', content: prompt, timestamp: new Date().toISOString() });

    // C2: Enforce history size limit
    if (this.conversationHistory.length > this.MAX_HISTORY_ENTRIES) {
      this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY_ENTRIES);
    }

    // C2: Token-based flush trigger
    const estimatedTokens = this.conversationHistory
      .map(h => ((h.content || '') as string).length / 4)
      .reduce((a, b) => a + b, 0);
    if (estimatedTokens > this.TOKEN_FLUSH_THRESHOLD) {
      await this.flushState();
    }

    let response: string;
    switch (complexity) {
      case TaskComplexity.DIRECT:
        this.directCount++;
        // Flush state every 5 DIRECT interactions
        if (this.directCount % 5 === 0) {
          await this.flushState();
        }
        response = await this.executeDirect(prompt);
        break;

      case TaskComplexity.BRAIN_ONLY:
        response = await this.routeToBrain(prompt);
        break;

      case TaskComplexity.FULL_PIPELINE:
        // Always flush state on FULL_PIPELINE
        await this.flushState();
        response = await this.triggerFullPipeline(prompt);
        break;
    }

    this.conversationHistory.push({ role: 'assistant', content: response, timestamp: new Date().toISOString() });
    return response;
  }

  /**
   * DIRECT — fast path with Soul.md personality and conversation history (C2).
   */
  private async executeDirect(prompt: string): Promise<string> {
    try {
      const soul = this.loadSoul();
      const history = this.conversationHistory.slice(-11, -1).map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      }));
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: soul || 'You are a helpful assistant. Answer directly and concisely.',
        messages: [...history, { role: 'user', content: prompt }],
      });
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');
    } catch (err) {
      console.error(`[USER AGENT] executeDirect failed: ${err}`);
      return `I encountered an error processing your request: ${(err as Error).message}. Please try again.`;
    }
  }

  /**
   * BRAIN_ONLY — run planner then use reasoning as context for a proper answer (C2).
   */
  private async routeToBrain(prompt: string): Promise<string> {
    try {
      const soul = this.loadSoul();
      // BRAIN_ONLY gets wiki context (DIRECT does not)
      const wikiContext = await this.promptBuilder.loadWikiContext((cloneConfig as any).brainWikiPages || ['concept-routing-classifier', 'segment-brain']);
      const systemPrompt = [soul, wikiContext ? `\n\n## Knowledge\n${wikiContext}` : '']
        .filter(Boolean).join('');
      const history = this.conversationHistory.slice(-11, -1).map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      }));
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt || 'You are a helpful assistant. Provide clear, well-reasoned answers.',
        messages: [...history, { role: 'user', content: prompt }],
      });
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');
    } catch (err) {
      console.error(`[USER AGENT] routeToBrain failed: ${err}`);
      return `I encountered an error processing your request: ${(err as Error).message}. Please try again.`;
    }
  }

  /**
   * FULL PIPELINE — Brain plans → task.json written to inbox → dispatcher picks up.
   * This is the TS→Python bridge: UserAgent writes, dispatcher.py reads.
   */
  private async triggerFullPipeline(prompt: string): Promise<string> {
    try {
      const taskId = `task-${crypto.randomUUID().slice(0, 8)}`;

      const planning = await this.planner.plan(prompt, taskId);

      // C3: Confidence gate — low-confidence plans get clarification instead of dispatch
      if (planning.confidence < (cloneConfig as any).confidenceGateThreshold) {
        return `I'm not confident I understood your request correctly. Could you rephrase? Here's what I understood: ${planning.brief.objective}`;
      }

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
    } catch (err) {
      console.error('[USER_AGENT] Pipeline error:', err);
      return `I encountered an error processing your request: ${(err as Error).message}. Please try again.`;
    }
  }

  /**
   * PRUNE COMPLETED — remove completed task IDs from active_worktrees (B1).
   */
  public pruneCompleted(taskId: string): void {
    this.state.active_worktrees = this.state.active_worktrees.filter(id => id !== taskId);
    this.saveState();
  }

  /**
   * STARTUP CLEANUP — remove stale worktree IDs not in registry (B1).
   */
  public cleanupStaleWorktrees(): void {
    const registryPath = path.join(
      process.env.AGENT_BASE_DIR || process.cwd(),
      'state', 'worktrees', 'registry.json'
    );
    let registeredIds: string[] = [];
    try {
      const data = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      // Registry is an object keyed by cloneId (written by spawner.ts)
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        registeredIds = Object.keys(data);
      }
    } catch {
      // No registry file — clear all
    }
    const before = this.state.active_worktrees.length;
    this.state.active_worktrees = this.state.active_worktrees.filter(id => registeredIds.includes(id));
    if (this.state.active_worktrees.length < before) {
      console.log(`[USER AGENT] Startup cleanup: removed ${before - this.state.active_worktrees.length} stale worktree IDs`);
      this.saveState();
    }
  }

  /**
   * Load Soul.md content (cached). Used as system prompt for executeDirect and routeToBrain.
   */
  private loadSoul(): string {
    const now = Date.now();
    if (this.soulContent !== null && (now - this.soulLoadedAt) < this.SOUL_TTL_MS) {
      return this.soulContent;
    }

    const baseDir = process.env.AGENT_BASE_DIR || process.cwd();
    let content = '';
    const soulPath = path.join(baseDir, 'wiki', 'Soul.md');
    const soulPrivatePath = path.join(baseDir, 'wiki', 'soul-private.md');

    try {
      if (fs.existsSync(soulPath)) {
        content += fs.readFileSync(soulPath, 'utf-8');
      }
    } catch { /* soul.md missing is fine */ }

    try {
      if (fs.existsSync(soulPrivatePath)) {
        content += '\n\n' + fs.readFileSync(soulPrivatePath, 'utf-8');
      }
    } catch { /* soul-private.md missing is fine */ }

    this.soulContent = content.trim();
    this.soulLoadedAt = Date.now();
    return this.soulContent;
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
      await this.truncateHistory();
    }

    this.saveState();
  }

  /**
   * Simple recency truncation — not semantic compression.
   * TODO: wire to Haiku for summarization when history > N turns.
   */
  private async truncateHistory(): Promise<void> {
    this.conversationHistory = this.conversationHistory.slice(-10);
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
