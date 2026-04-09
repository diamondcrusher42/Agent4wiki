// core/brain/router.ts
// Phase 4 — Brain routing switchboard
//
// Separation of concerns from planner.ts:
//   planner.ts    → thinks (Sequential Thinking MCP → step-by-step logic)
//   dispatcher.ts → delegates (takes the plan, selects Mission Brief, requests creds)
//
// The Brain should never worry about how a worktree operates.
// This module handles the handoff from plan → execution.

import { MissionBrief } from './planner';
import { KeychainManager } from '../keychain/manager';

export type SkillType = 'code' | 'research' | 'devops' | 'qa' | 'docs' | 'data';

export interface DispatchDecision {
  skill: SkillType;
  templatePath: string;   // path to the Mission Brief template
  requiredKeys: string[]; // from scopes.yaml for this skill
  priority: number;       // 1 = urgent, 5 = background
}

export class BrainDispatcher {
  constructor(private keychain: KeychainManager) {}

  /**
   * DISPATCH — takes a Brain plan, selects the right Mission Brief + credentials,
   * and returns a DispatchDecision for clone_worker.ts to execute.
   *
   * Decision logic:
   * - Reads task type from MissionBrief.skill
   * - Looks up required keys from core/keychain/config/scopes.yaml
   * - Selects template from core/clones/templates/<skill>_task.md
   */
  public async dispatch(brief: MissionBrief): Promise<DispatchDecision> {
    const skill = this.inferSkill(brief.skill);
    const templatePath = `core/clones/templates/${skill}_task.md`;
    const requiredKeys = await this.keychain.getScopeKeys(skill);

    return {
      skill,
      templatePath,
      requiredKeys,
      priority: 3 // default — Brain can override for urgent tasks
    };
  }

  private inferSkill(rawSkill: string): SkillType {
    const validSkills: SkillType[] = ['code', 'research', 'devops', 'qa', 'docs', 'data'];
    if (validSkills.includes(rawSkill as SkillType)) return rawSkill as SkillType;
    console.warn(`[DISPATCHER] Unknown skill "${rawSkill}" — defaulting to "code"`);
    return 'code';
  }
}
