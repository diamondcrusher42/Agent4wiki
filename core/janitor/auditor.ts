// core/janitor/auditor.ts
// Phase 6 deliverable — Janitor audit engine
//
// Sits between Clone finishing its task and Brain accepting the result.
// Reads the JSON handshake from the Master Code Clone Template.
// Issues BLOCK / SUGGEST / NOTE directive to Brain.
// Circuit breaker: 3 failures → escalate to human via Bridge (Telegram).
//
// Dispatcher integration (from Opus review 3):
//   dispatcher.execute_task() extracts handshake from clone stdout →
//   calls janitor.evaluateMission(handshake, retryCount) →
//   BLOCK  → move to failed/, optionally re-queue with retryCount + 1
//   SUGGEST → re-queue with janitor.feedback injected into task objective
//   NOTE   → merge worktree, write structured record to forge/events.jsonl

import { HandshakeResult } from '../keychain/manager';
import * as fs from 'fs';
import * as path from 'path';

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

/** Structured record written to forge/events.jsonl on every NOTE */
export interface ForgeRecord {
  task_id: string;
  skill: string;
  directive: AuditDirective;
  janitor_notes: string;
  tokens_consumed: number;
  duration_seconds: number;
  files_modified: string[];
  timestamp: string;
}

const FORGE_EVENTS_PATH = process.env.FORGE_EVENTS_PATH || './forge/events.jsonl';

export class Janitor {
  private maxRetries = 3; // Circuit breaker threshold

  /**
   * PRIMARY AUDIT LOOP — called after Clone finishes + Keychain revokes + scans.
   * Decision sequence (in priority order):
   * 1. Circuit breaker → BLOCK + human escalation
   * 2. Fatal failure → BLOCK (let Brain try different strategy)
   * 3. BLOCKED_IMPOSSIBLE → BLOCK + human escalation (Brain must re-plan)
   * 4. Structural mess → SUGGEST (1 more try with specific guidance)
   * 5. Passable → NOTE (merge + write structured record for Forge)
   */
  public evaluateMission(
    handshake: HandshakeResult,
    currentRetries: number,
    taskId: string = 'unknown',
    skill: string = 'code'
  ): AuditResult {

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
        escalate_to_human: true
      };
    }

    // 3. FATAL FAILURES — tests failed or security breach → BLOCK
    if (handshake.tests_passed === false || handshake.status === 'FAILED_REQUIRE_HUMAN') {
      return {
        directive: AuditDirective.BLOCK,
        feedback: `CRITICAL FAILURE: Tests did not pass or security boundaries breached. Status: ${handshake.status}`,
        escalate_to_human: handshake.status === 'FAILED_REQUIRE_HUMAN'
      };
    }

    // 4. STRUCTURAL MESS — code works but architecture has structural problems → SUGGEST
    const structuralIssue = this.detectStructuralIssue(handshake);
    if (structuralIssue) {
      return {
        directive: AuditDirective.SUGGEST,
        feedback: structuralIssue,
        escalate_to_human: false
      };
    }

    // 5. PASSABLE → NOTE — merge it, write structured record for Forge
    const result: AuditResult = {
      directive: AuditDirective.NOTE,
      feedback: handshake.janitor_notes || 'Clean execution. Merged.',
      escalate_to_human: false
    };

    // Write machine-parseable Forge record (never fails silently — log error but don't block merge)
    this.writeForgeRecord(taskId, skill, handshake, result.directive).catch(err =>
      console.error(`[JANITOR] Failed to write Forge record: ${err}`)
    );

    return result;
  }

  /**
   * STRUCTURAL MESS DETECTION (V2 — Opus review 3 upgrade)
   *
   * V1 was keyword-only ("hacky", "todo") — too naive, misses real problems,
   * false-positives on legitimate TODOs. V2 adds structural checks that don't
   * need an LLM: scope creep, missing tests, shared config edits.
   *
   * Phase 7 upgrade: replace with fast Haiku LLM call to evaluate note quality.
   */
  private detectStructuralIssue(handshake: HandshakeResult): string | null {
    const notes = handshake.janitor_notes || '';
    const files = handshake.files_modified || [];

    // --- Structural checks (no LLM needed) ---

    // Scope creep: clone touched files outside its objective area
    // Heuristic: if >5 files modified and notes mention "also fixed" or "while I was at it"
    if (files.length > 5 && /also fixed|while i was at it|unrelated|out of scope/i.test(notes)) {
      return `SCOPE CREEP: Clone modified ${files.length} files and notes suggest unrelated changes. Refactor to stated objective only.`;
    }

    // Missing tests: clone added source files but no test files
    const sourceFiles = files.filter(f => /\.(ts|js|py)$/.test(f) && !/test|spec/.test(f));
    const testFiles = files.filter(f => /test|spec/.test(f));
    if (sourceFiles.length > 0 && testFiles.length === 0 && handshake.tests_passed !== true) {
      return `MISSING TESTS: Clone added ${sourceFiles.length} source file(s) but no test files. Add tests before merging.`;
    }

    // Shared config mutation: clone edited config files it shouldn't own
    const sharedConfigs = files.filter(f =>
      /\b(tsconfig|package\.json|\.gitignore|CLAUDE\.md|\.env\.example)\b/.test(f)
    );
    if (sharedConfigs.length > 0) {
      return `SHARED CONFIG EDIT: Clone modified shared config files: ${sharedConfigs.join(', ')}. Requires explicit approval.`;
    }

    // Performance flag from notes (semantic keyword check — kept from V1 but limited to performance)
    if (/\b(slow|O\(n²\)|timeout|perf|bottleneck)\b/i.test(notes)) {
      return `PERFORMANCE CONCERN flagged in notes: "${notes}". Address before merging to avoid Forge regression.`;
    }

    // Legacy semantic check for explicit quality admissions
    const lowered = notes.toLowerCase();
    if (['hacky', 'tech debt', 'fragile', 'temporary'].some(kw => lowered.includes(kw))) {
      return `QUALITY ADMISSION in notes: "${notes}". Refactor before merging.`;
    }

    return null; // No structural issues detected
  }

  /**
   * FORGE RECORD — structured JSONL entry for every NOTE directive.
   * The Forge pattern-matches this to find improvement opportunities.
   * Written to forge/events.jsonl (machine-parseable, not wiki/log.md).
   */
  private async writeForgeRecord(
    taskId: string,
    skill: string,
    handshake: HandshakeResult,
    directive: AuditDirective
  ): Promise<void> {
    const record: ForgeRecord = {
      task_id: taskId,
      skill,
      directive,
      janitor_notes: handshake.janitor_notes || '',
      tokens_consumed: handshake.tokens_consumed || 0,
      duration_seconds: handshake.duration_seconds || 0,
      files_modified: handshake.files_modified || [],
      timestamp: new Date().toISOString()
    };

    const dir = path.dirname(FORGE_EVENTS_PATH);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.appendFile(FORGE_EVENTS_PATH, JSON.stringify(record) + '\n');
  }
}
