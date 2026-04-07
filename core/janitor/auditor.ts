// core/janitor/auditor.ts
// Phase 6 deliverable — Janitor audit engine
//
// Sits between Clone finishing its task and Brain accepting the result.
// Reads the JSON handshake from the Master Code Clone Template.
// Issues BLOCK / SUGGEST / NOTE directive to Brain.
// Circuit breaker: 3 failures → escalate to human via Bridge (Telegram).

import { HandshakeResult } from '../keychain/manager';

export enum AuditDirective {
  BLOCK   = 'BLOCK',    // Fatal flaw. Reject completely. Brain re-delegates.
  SUGGEST = 'SUGGEST',  // Minor flaw. Send back to Clone for 1 more try.
  NOTE    = 'NOTE'      // Acceptable. Merge and log for the Forge.
}

export interface AuditResult {
  directive: AuditDirective;
  feedback: string;
  escalate_to_human: boolean; // true → Bridge sends Telegram alert
}

export class Janitor {
  private maxRetries = 3; // Circuit breaker threshold

  /**
   * PRIMARY AUDIT LOOP — called after Clone finishes + Keychain revokes + scans.
   * Decision sequence (in priority order):
   * 1. Circuit breaker → BLOCK + human escalation
   * 2. Fatal failure → BLOCK (let Brain try different strategy)
   * 3. BLOCKED_IMPOSSIBLE → BLOCK + human escalation (Brain must re-plan)
   * 4. Architectural mess → SUGGEST (1 more try)
   * 5. Passable → NOTE (merge + log for Forge)
   */
  public evaluateMission(handshake: HandshakeResult, currentRetries: number): AuditResult {

    // 1. CIRCUIT BREAKER — same mission failed 3× → escalate to human
    if (currentRetries >= this.maxRetries) {
      return {
        directive: AuditDirective.BLOCK,
        feedback: `CIRCUIT BREAKER TRIPPED: Clone failed ${this.maxRetries} times. Human intervention required.`,
        escalate_to_human: true
      };
    }

    // 2. BLOCKED_IMPOSSIBLE — task cannot be done as specified → Brain must re-plan
    if (handshake.status === 'BLOCKED_IMPOSSIBLE') {
      return {
        directive: AuditDirective.BLOCK,
        feedback: `IMPOSSIBLE TASK: ${handshake.reason || 'No reason provided'}. Brain must re-plan.`,
        escalate_to_human: true // Needs human direction to unblock
      };
    }

    // 3. FATAL FAILURES — tests failed or security breach → BLOCK (retry with better brief)
    if (handshake.tests_passed === false || handshake.status === 'FAILED_REQUIRE_HUMAN') {
      return {
        directive: AuditDirective.BLOCK,
        feedback: `CRITICAL FAILURE: Tests did not pass or security boundaries breached. Status: ${handshake.status}`,
        escalate_to_human: handshake.status === 'FAILED_REQUIRE_HUMAN'
      };
    }

    // 4. NUANCE CHECK — code works but architecture is fragile → SUGGEST (1 more try)
    if (this.detectsArchitecturalMess(handshake.janitor_notes)) {
      return {
        directive: AuditDirective.SUGGEST,
        feedback: `Architecture concern detected in janitor_notes: "${handshake.janitor_notes}". Refactor before merging.`,
        escalate_to_human: false
      };
    }

    // 5. PASSABLE → NOTE — merge it, log for Forge
    return {
      directive: AuditDirective.NOTE,
      feedback: handshake.janitor_notes || 'Clean execution. Merged.',
      escalate_to_human: false
    };
  }

  /**
   * ARCHITECTURAL MESS DETECTION
   * MVP: keyword check on janitor_notes.
   * Phase 7 upgrade: fast BitNet/Haiku LLM call to evaluate note quality.
   */
  private detectsArchitecturalMess(notes: string): boolean {
    if (!notes) return false;
    const lowered = notes.toLowerCase();
    return (
      lowered.includes('hacky') ||
      lowered.includes('todo') ||
      lowered.includes('temporary') ||
      lowered.includes('fragile') ||
      lowered.includes('slow') ||
      lowered.includes('tech debt')
    );
  }
}
