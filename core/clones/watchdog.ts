// core/clones/watchdog.ts
// B4: Stale worktree watchdog — cleans up orphaned worktrees
// that may have leaked credentials after OOM/SIGKILL.
// Run via cron: */5 * * * * npx ts-node core/clones/watchdog.ts

import * as fs from 'fs';
import * as path from 'path';
import { CloneTeardown } from './lifecycle/teardown';
import { AuditDirective } from '../janitor/auditor';

const REGISTRY_PATH = path.join(process.cwd(), 'state', 'worktrees', 'registry.json');
const MAX_AGE_MINUTES = 30;

export interface RegistryEntry {
  path: string;
  branch: string;
  createdAt: string;
}

export async function runWatchdog(): Promise<{ cleaned: string[]; failed: string[] }> {
  const cleaned: string[] = [];
  const failed: string[] = [];

  if (!fs.existsSync(REGISTRY_PATH)) return { cleaned, failed };

  let registry: Record<string, RegistryEntry>;
  try {
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  } catch {
    return { cleaned, failed };
  }

  const now = Date.now();
  const teardown = new CloneTeardown();

  for (const [cloneId, entry] of Object.entries(registry)) {
    const age = (now - new Date(entry.createdAt).getTime()) / 60000;
    if (age > MAX_AGE_MINUTES) {
      console.warn(`[WATCHDOG] Stale worktree ${cloneId} (${age.toFixed(0)}min) — forcing teardown`);
      try {
        await teardown.teardown(
          { cloneId, path: entry.path, branch: entry.branch, createdAt: new Date(entry.createdAt) },
          AuditDirective.BLOCK
        );
        cleaned.push(cloneId);
      } catch (err) {
        console.error(`[WATCHDOG] Teardown failed for ${cloneId}: ${err}`);
        // Still try to delete .env directly
        const envPath = path.join(entry.path, '.env');
        if (fs.existsSync(envPath)) {
          fs.unlinkSync(envPath);
          console.warn(`[WATCHDOG] Force-deleted .env from ${entry.path}`);
        }
        failed.push(cloneId);
      }
    }
  }

  return { cleaned, failed };
}

// Run if invoked directly (from cron or CLI)
if (require.main === module) {
  runWatchdog()
    .then(result => {
      if (result.cleaned.length > 0) {
        console.log(`[WATCHDOG] Cleaned: ${result.cleaned.join(', ')}`);
      }
      if (result.failed.length > 0) {
        console.error(`[WATCHDOG] Failed: ${result.failed.join(', ')}`);
      }
    })
    .catch(console.error);
}
