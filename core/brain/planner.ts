// core/brain/planner.ts
// Phase 4 deliverable — Brain sequential planning via Claude API
//
// The Brain is not a persistent process. It is a Claude Code session
// launched by the dispatcher with task context pre-loaded. This module
// handles the planning step that the Brain uses to decompose tasks
// before writing Mission Briefs.
//
// MVP: Direct Claude API call (Haiku for cheap routing).
// Future: Sequential Thinking MCP integration for step-by-step reasoning.
//
// Rule: Brain MUST plan before producing any Mission Brief. No shortcuts.
// See [[segment-brain]] for rationale.

import Anthropic from '@anthropic-ai/sdk';

export interface MissionBrief {
  id: string;
  objective: string;
  skill: string;
  requiredKeys: string[];
  wikiContext: string[];
  constraints: string[];
  allowedPaths: string[];
  allowedEndpoints: string[];
  timeoutMinutes: number;
}

export interface ThinkingResult {
  reasoning: string[];   // Sequential Thinking steps
  brief: MissionBrief;   // Output mission brief
  confidence: number;    // 0-1 — low confidence → BLOCK, ask human
}

const PLANNING_SYSTEM_PROMPT = `You are the Brain planning module of Agent V4.
Given a task objective, produce a structured MissionBrief JSON.
Output ONLY valid JSON in this exact format — no markdown, no explanation, just the JSON object:
{
  "skill": "code",
  "requiredKeys": ["ANTHROPIC_API_KEY"],
  "wikiContext": [],
  "constraints": ["stay within allowed paths"],
  "allowedPaths": ["/tmp/task-id/"],
  "allowedEndpoints": ["api.anthropic.com"],
  "timeoutMinutes": 30,
  "reasoning": "1-sentence rationale for skill choice"
}

Rules for skill selection:
- "code" — writing, modifying, debugging, or refactoring code
- "research" — gathering information, summarizing, web searches
- "devops" — deployment, CI/CD, infrastructure, Docker, scripts
- "qa" — testing, quality assurance, test writing
- "docs" — documentation, README, wiki pages
- "data" — data processing, analysis, database operations

Rules for requiredKeys:
- Always include "ANTHROPIC_API_KEY" (the clone needs it to run)
- Add "GITHUB_TOKEN" for code/devops tasks that involve git operations
- Add "EXA_API_KEY" for research tasks

Rules for allowedPaths:
- Default to ["/tmp/<task-id>/"] for safety
- If the task mentions a specific path, use that path

Rules for timeoutMinutes:
- Simple tasks: 10-15
- Medium tasks: 30
- Complex tasks: 60`;

export class BrainPlanner {
  private readonly anthropic: Anthropic;

  constructor(anthropic?: Anthropic) {
    this.anthropic = anthropic ?? new Anthropic();
  }

  /**
   * PLAN — produces a structured MissionBrief from a task objective.
   * MVP: Direct Claude API call using Haiku (cheap routing task).
   * Future: Sequential Thinking MCP pass before any Mission Brief.
   */
  public async plan(taskObjective: string, taskId: string): Promise<ThinkingResult> {
    const msg = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: PLANNING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: taskObjective }],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const planData = this.parseMissionBrief(text);

    return {
      reasoning: [planData.reasoning || 'No reasoning provided'],
      brief: {
        id: taskId,
        objective: taskObjective,
        skill: planData.skill || 'code',
        requiredKeys: planData.requiredKeys || ['ANTHROPIC_API_KEY'],
        wikiContext: planData.wikiContext || [],
        constraints: planData.constraints || [],
        allowedPaths: planData.allowedPaths || [`/tmp/${taskId}/`],
        allowedEndpoints: planData.allowedEndpoints || ['api.anthropic.com'],
        timeoutMinutes: planData.timeoutMinutes || 30,
      },
      confidence: 0.8, // MVP — static until Sequential Thinking MCP integrated
    };
  }

  /**
   * Parse MissionBrief JSON from raw LLM output with retry and fallback (C1).
   */
  private parseMissionBrief(raw: string): any {
    // Try 1: strip markdown fences and parse
    const stripped = raw.replace(/```(?:json)?\n?/g, '').trim();
    try { return JSON.parse(stripped); } catch {}

    // Try 2: extract first {...} block
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }

    // Fallback: safe default brief
    console.error('[PLANNER] Failed to parse MissionBrief — using default');
    return {
      skill: 'code',
      requiredKeys: ['ANTHROPIC_API_KEY'],
      wikiContext: [],
      constraints: [],
      allowedPaths: [],
      allowedEndpoints: ['api.anthropic.com'],
      timeoutMinutes: 30,
      reasoning: raw.slice(0, 200),
      confidence: 0.3,
    };
  }
}
