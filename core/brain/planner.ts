// core/brain/planner.ts
// Phase 4 deliverable — Brain sequential planning via MCP
//
// The Brain is not a persistent process. It is a Claude Code session
// launched by the dispatcher with task context pre-loaded. This module
// handles the Sequential Thinking MCP integration that the Brain uses
// to decompose tasks before writing Mission Briefs.
//
// Rule: Brain MUST complete a Sequential Thinking pass before producing
// any Mission Brief. No shortcuts. See [[segment-brain]] for rationale.

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

export class BrainPlanner {
  /**
   * SEQUENTIAL THINKING PASS — mandatory before any Mission Brief.
   * In a real session this calls the Sequential Thinking MCP server.
   * Stub: returns a minimal brief from the task objective.
   */
  public async plan(taskObjective: string, taskId: string): Promise<ThinkingResult> {
    // TODO: call Sequential Thinking MCP (mcp__sequential_thinking__think)
    // with taskObjective, return structured reasoning steps

    // TODO: parse reasoning steps into MissionBrief fields
    // (skill selection, required_keys from keychain catalog, wiki pages to inject)

    throw new Error('BrainPlanner.plan() not yet implemented — Phase 4 in progress');
  }
}
