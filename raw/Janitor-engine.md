# The Janitor Engine (Core Logic)
# The Janitor sits between the Clone finishing its task and the Brain accepting the result. It reads the JSON handshake we defined in the Master Code Clone Template.

// core/janitor/auditor.ts

export enum AuditDirective {
  BLOCK = 'BLOCK',       // Fatal flaw. Reject completely.
  SUGGEST = 'SUGGEST',   // Minor flaw. Send back to Clone for 1 more try.
  NOTE = 'NOTE'          // Acceptable. Merge it, but log a warning for the Forge.
}

export interface AuditResult {
  directive: AuditDirective;
  feedback: string;
  escalate_to_human: boolean;
}

export class Janitor {
  private maxRetries = 3;

  /**
   * The primary audit loop called after a Clone finishes a mission.
   */
  public evaluateMission(cloneOutputJson: any, currentRetries: number): AuditResult {
    
    // 1. The Circuit Breaker (Escalate to Human)
    if (currentRetries >= this.maxRetries) {
      return {
        directive: AuditDirective.BLOCK,
        feedback: "CIRCUIT BREAKER TRIPPED: Clone failed 3 times. Human intervention required.",
        escalate_to_human: true
      };
    }

    // 2. Fatal Security or Execution Failures -> BLOCK
    // E.g., The Clone admits tests failed, or the Keychain flagged a leak.
    if (cloneOutputJson.tests_passed === false || cloneOutputJson.status === 'FAILED_REQUIRE_HUMAN') {
      return {
        directive: AuditDirective.BLOCK,
        feedback: "CRITICAL FAILURE: Tests did not pass or security boundaries breached.",
        escalate_to_human: false // Let the Brain try a different Clone/Strategy first
      };
    }

    // 3. Nuance Check -> SUGGEST
    // E.g., The code works, but the Janitor spots a messy architecture choice in the notes.
    if (this.detectsArchitecturalMess(cloneOutputJson.janitor_notes)) {
      return {
        directive: AuditDirective.SUGGEST,
        feedback: "Code passed tests, but architecture is fragile. Refactor the helper function before merging.",
        escalate_to_human: false
      };
    }

    // 4. Passable -> NOTE
    // The code is good enough. Merge it, but log the Clone's notes for Phase 7 (The Forge).
    return {
      directive: AuditDirective.NOTE,
      feedback: cloneOutputJson.janitor_notes || "Clean execution. Merged.",
      escalate_to_human: false
    };
  }

  private detectsArchitecturalMess(notes: string): boolean {
    // In a full implementation, this might be a fast BitNet/Haiku LLM check 
    // to see if the Clone admitted to writing "hacky" code in its JSON.
    return notes.toLowerCase().includes('hacky') || notes.toLowerCase().includes('todo');
  }
}

## The Wiki Scythe (Memory Maintenance)
## The Janitor isn't just a code reviewer; it is the caretaker of the wiki/ directory. If the wiki rots, the Brain's planning drifts. The Janitor needs a routine background task (perfect for a local LLM or scheduled cron job) to prune contradictions.

// core/janitor/scythe.ts
// import { MemoryStore } from '../memory_store/interface';

export class WikiScythe {
  constructor(private memory: MemoryStore) {}

  /**
   * Runs asynchronously to keep the Brain's context clean.
   */
  public async pruneStaleKnowledge() {
    // 1. Search memory for contradictory tags (e.g., "React 18" vs "React 19")
    // 2. Use the `valid_until` metadata we defined in Phase 1.
    // 3. Execute `this.memory.delete(staleMemoryId)`
  }
}

### Notes: How the Loop Closes
Here is how Phase 6 ties the entire system together:

Clone Finishes: It submits its code and its JSON handshake ({ "tests_passed": true, "janitor_notes": "It works, but it's a bit slow." }).

Keychain Sweeps: Phase 2 revokes the .env and scans for leaked keys. (Passes).

Janitor Audits: The Janitor reads the JSON. It sees tests passed, but notes it is slow. It issues a NOTE directive.

The Merge: Because it is a NOTE (not a BLOCK), the system automatically commits the worktree to the main branch.

The Forge Log: The Janitor writes the "It works, but it's a bit slow" note to wiki/log.md. (In Phase 7, the Forge will read this log, realize the Clone template writes slow code, and attempt to upgrade the prompt).

