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
import { KeychainManager, HandshakeResult, ScanResult } from '../keychain/manager';
import { Janitor, AuditDirective, AuditResult } from '../janitor/auditor';
import { DispatchDecision } from '../brain/router';
import { PromptBuilder } from '../brain/prompt_builder';
import { MissionBrief } from '../brain/planner';
import cloneConfig from '../config/clone_config.json';

const REQUIRED_ENV_KEYS = ['PATH', 'HOME', 'NODE_ENV', 'TMPDIR', 'LANG', 'LC_ALL'];

export function buildCloneEnv(scopedEnv: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  // Allowlist: only pass safe system keys
  for (const key of REQUIRED_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key]!;
    }
  }
  // Merge task-scoped keys from Keychain
  return { ...env, ...scopedEnv };
}

export interface CloneResult {
  directive: AuditDirective;
  feedback: string;
  escalate_to_human: boolean;
  retries_used: number;
  tokensConsumed: number;     // C3: populated from handshake
  filesModified: string[];    // C3: populated from handshake
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
    let lastHandshake: HandshakeResult | null = null;

    while (retries < cloneConfig.maxRetries) {
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
      let scanResult: ScanResult = { clean: true, largeFilesSkipped: [] };
      try {
        await this.keychain.provisionEnvironment(handle.path, decision.requiredKeys);
        handshake = await this.runner.run(handle, prompt, brief.timeoutMinutes * 60 * 1000);
      } finally {
        scanResult = await this.keychain.revokeEnvironment(handle.path);
        noLeaks = scanResult.clean;
        if (!noLeaks) {
          console.error(`[CLONE_WORKER] SECURITY: Credential leak detected in ${handle.path} — forcing BLOCK`);
        }
      }

      lastHandshake = handshake;

      // A3: If credentials leaked, force BLOCK immediately — do not evaluate mission
      if (!noLeaks) {
        await this.teardown.teardown(handle, AuditDirective.BLOCK);
        return {
          directive: AuditDirective.BLOCK,
          feedback: 'SECURITY HALT: Credential leak detected in worktree after revoke. Task output discarded.',
          escalate_to_human: true,
          retries_used: retries,
          tokensConsumed: handshake.tokens_consumed || 0,
          filesModified: handshake.files_modified || [],
        };
      }

      // A4: Annotate janitor notes with skipped large files for manual review
      if (scanResult.largeFilesSkipped.length > 0) {
        handshake.janitor_notes = (handshake.janitor_notes || '') +
          `\nLARGE FILES SKIPPED (manual review needed): ${scanResult.largeFilesSkipped.join(', ')}`;
      }

      const audit: AuditResult = this.janitor.evaluateMission(handshake, retries, taskId, decision.skill);

      if (audit.directive === AuditDirective.NOTE || audit.directive === AuditDirective.BLOCK) {
        await this.teardown.teardown(handle, audit.directive);
        return {
          directive: audit.directive,
          feedback: audit.feedback,
          escalate_to_human: audit.escalate_to_human,
          retries_used: retries,
          tokensConsumed: handshake.tokens_consumed || 0,
          filesModified: handshake.files_modified || [],
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
      retries_used: retries,
      tokensConsumed: lastHandshake?.tokens_consumed || 0,
      filesModified: lastHandshake?.files_modified || [],
    };
  }
}
