// core/clones/clone_worker.ts
// Phase 5 — Clone lifecycle orchestrator
//
// Orchestrates the full clone lifecycle:
//   CloneSpawner → CloneRunner → Janitor → CloneTeardown
//
// This is the top-level class that other components (Brain dispatcher,
// Python dispatcher.py) hand off to. It owns the retry loop and circuit breaker.

import { CloneSpawner } from './lifecycle/spawner';
import { CloneRunner } from './lifecycle/runner';
import { CloneTeardown } from './lifecycle/teardown';
import { KeychainManager, HandshakeResult } from '../keychain/manager';
import { Janitor, AuditDirective, AuditResult } from '../janitor/auditor';
import { DispatchDecision } from '../brain/router';
import { PromptBuilder } from '../brain/prompt_builder';
import { MissionBrief } from '../brain/planner';

const SENSITIVE_ENV_KEYS = [
  'VAULT_MASTER_PASSWORD',
  'ANTHROPIC_API_KEY',  // injected per-task via keychain, not globally
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
];

export function buildCloneEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !SENSITIVE_ENV_KEYS.includes(k)) {
      env[k] = v;
    }
  }
  return env;
}

export interface CloneResult {
  directive: AuditDirective;
  feedback: string;
  escalate_to_human: boolean;
  retries_used: number;
}

export class CloneWorker {
  private spawner = new CloneSpawner();
  private runner = new CloneRunner();
  private teardown = new CloneTeardown();
  private janitor = new Janitor();

  constructor(
    private keychain: KeychainManager,
    private promptBuilder: PromptBuilder
  ) {}

  /**
   * EXECUTE — full clone lifecycle with retry loop.
   *
   * Loop (max 3 retries per Janitor circuit breaker):
   *   spawn worktree → inject credentials → run clone → audit → teardown
   *   BLOCK  → re-delegate to Brain (different strategy)
   *   SUGGEST → retry same task with Janitor feedback appended
   *   NOTE   → merge + done
   */
  public async execute(
    brief: MissionBrief,
    decision: DispatchDecision,
    taskId: string
  ): Promise<CloneResult> {
    let retries = 0;
    let lastFeedback = '';

    while (retries < 3) {
      const cloneId = `${taskId}-r${retries}`;
      const handle = await this.spawner.createWorktree(cloneId, decision.skill);

      // Inject augmented objective if this is a SUGGEST retry
      const objective = retries > 0
        ? `${brief.objective}\n\nJanitor feedback from previous attempt: ${lastFeedback}`
        : brief.objective;

      const prompt = await this.promptBuilder.build(decision.templatePath, {
        ...brief,
        objective
      });

      let handshake: HandshakeResult;
      let noLeaks = true;
      try {
        await this.keychain.provisionEnvironment(handle.path, decision.requiredKeys);
        handshake = await this.runner.run(handle, prompt, brief.timeoutMinutes * 60 * 1000);
      } finally {
        noLeaks = await this.keychain.revokeEnvironment(handle.path);
        if (!noLeaks) {
          console.error(`[CLONE_WORKER] SECURITY: Credential leak detected in ${handle.path} — forcing BLOCK`);
        }
      }

      // A3: If credentials leaked, force BLOCK immediately — do not evaluate mission
      if (!noLeaks) {
        await this.teardown.teardown(handle, AuditDirective.BLOCK);
        return {
          directive: AuditDirective.BLOCK,
          feedback: 'SECURITY HALT: Credential leak detected in worktree after revoke. Task output discarded.',
          escalate_to_human: true,
          retries_used: retries,
        };
      }

      const audit: AuditResult = this.janitor.evaluateMission(handshake, retries, taskId, decision.skill);

      if (audit.directive === AuditDirective.NOTE || audit.directive === AuditDirective.BLOCK) {
        await this.teardown.teardown(handle, audit.directive);
        return {
          directive: audit.directive,
          feedback: audit.feedback,
          escalate_to_human: audit.escalate_to_human,
          retries_used: retries
        };
      }

      // SUGGEST — cleanup worktree, retry with feedback
      await this.teardown.teardown(handle, AuditDirective.BLOCK); // don't merge
      lastFeedback = audit.feedback;
      retries++;
    }

    // Should not reach here — circuit breaker fires at retries >= 3 inside Janitor
    return {
      directive: AuditDirective.BLOCK,
      feedback: 'Max retries exceeded',
      escalate_to_human: true,
      retries_used: retries
    };
  }
}
