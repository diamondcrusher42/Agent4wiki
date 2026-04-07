// bin/agent4.ts — CLI entry point
// Usage: npx ts-node bin/agent4.ts start | status | audit
//
// Routes top-level commands to the appropriate core component.
// Phase 1-6 wired up; Phase 7 (Forge) is a stub.

import { UserAgent } from '../core/user_agent/agent';

const [, , command, ...args] = process.argv;

async function main() {
  switch (command) {
    case 'start': {
      console.log('[agent4] Starting User Agent…');
      // TODO: instantiate MemoryStore, ComplexityClassifier, UserAgent
      // const ua = new UserAgent(memory, classifier, keychain);
      // ua.run();
      break;
    }

    case 'status': {
      console.log('[agent4] System status — not yet implemented');
      // TODO: read SESSION_STATE, show active clones, health score
      break;
    }

    case 'audit': {
      console.log('[agent4] Janitor audit — not yet implemented');
      // TODO: instantiate Janitor + WikiScythe, run full audit cycle
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
