// bin/agent4.ts — CLI entry point
// Usage: npx ts-node bin/agent4.ts start | status | audit
//
// Routes top-level commands to the appropriate core component.
// Phase 1-6 wired up; Phase 7 (Forge) is a stub.

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { UserAgent } from '../core/user_agent/agent';
import { WikiScythe } from '../core/janitor/scythe';
import { MemoryStore, MemoryMetadata, MemoryTier, InteractionDigest, AuditReport } from '../core/memory_store/interface';

const [, , command] = process.argv;

// Minimal no-op MemoryStore for CLI audit — MemPalace is not running in this context.
// WikiScythe's wiki-file scanning works fine; memory-backed features return empty results.
class NullMemoryStore implements MemoryStore {
  async connect(): Promise<void> {}
  async write(_content: string, _metadata: MemoryMetadata): Promise<string> { return ''; }
  async writeSummary(_digest: InteractionDigest): Promise<string> { return ''; }
  async readContext(_tier: MemoryTier, _query?: string): Promise<string> { return ''; }
  async search(_query: string, _limit?: number): Promise<Array<{content: string, score: number}>> { return []; }
  async delete(_memoryId: string): Promise<boolean> { return false; }
  async audit(_olderThan?: Date): Promise<AuditReport> {
    return { contradictions: [], orphan_pages: [], stale_entries: [], timestamp: new Date().toISOString() };
  }
}

async function main() {
  switch (command) {
    case 'start': {
      console.log('[agent4] Starting User Agent…');
      const ua = new UserAgent();

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      process.stdout.write('> ');

      rl.on('line', async (line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          process.stdout.write('> ');
          return;
        }
        try {
          const response = await ua.handleUserInput(trimmed);
          console.log(response);
        } catch (err) {
          console.error('[agent4] Error:', (err as Error).message);
        }
        process.stdout.write('> ');
      });

      rl.on('close', () => {
        console.log('\n[agent4] Session ended.');
        process.exit(0);
      });
      break;
    }

    case 'status': {
      const statePath = path.join(process.cwd(), 'state', 'user_agent', 'state.json');
      if (!fs.existsSync(statePath)) {
        console.log('No session state found.');
        break;
      }
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      console.log('=== Agent4 Status ===');
      console.log(`Last updated:    ${state.last_updated}`);
      console.log(`Current intent:  ${state.current_intent || '(none)'}`);
      console.log(`Confidence:      ${state.confidence_score}`);
      console.log(`Active clones:   ${state.active_worktrees.length > 0 ? state.active_worktrees.join(', ') : '(none)'}`);
      console.log(`Open items:      ${state.open_items.length > 0 ? state.open_items.join(', ') : '(none)'}`);
      if (state.recent_context_summary) {
        console.log(`\nRecent context:\n${state.recent_context_summary}`);
      }
      break;
    }

    case 'audit': {
      console.log('[agent4] Running wiki audit…');
      const scythe = new WikiScythe(new NullMemoryStore());
      await scythe.runFullAuditCycle();
      console.log('Audit complete.');
      break;
    }

    default: {
      console.log('Usage: agent4 <start|status|audit>');
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error('[agent4] Fatal:', err);
  process.exit(1);
});
