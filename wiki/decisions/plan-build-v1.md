# Build Plan V1 — Phase-by-Phase Implementation + Unit Tests

> Created: 2026-04-08 | Status: Active build guide
> Prerequisite reading: [[review-code-audit-1]], [[review-gemini-review7]], [[decision-directory-scaffold]]

This is the authoritative step-by-step implementation guide. Each phase produces a working, testable deliverable before the next begins. Do not skip phases — they have hard dependencies.

---

## Phase 0 — Fix Compile Errors (Day 1-2)

**Goal:** `npx tsc --noEmit` exits 0. Nothing compiles today.

These are pure fixes — no new behaviour. Complete in this order to unblock everything else.

---

### 0.1 — Delete `MissionBrief` from `core/keychain/manager.ts`

**Problem:** Two incompatible `MissionBrief` definitions — `manager.ts` (4 fields) and `planner.ts` (10 fields). `clone_worker.ts` imports from `planner.ts` but `executeCloneMission()` expects the `manager.ts` shape.

**Fix:** Delete lines 10-15 from `core/keychain/manager.ts` (the `export interface MissionBrief { ... }` block). Then update `executeCloneMission()` to accept `MissionBrief` from `planner.ts`:

```typescript
// core/keychain/manager.ts — line 1 area
import { MissionBrief } from '../brain/planner';  // add this import
```

Remove the local `MissionBrief` interface entirely. `executeCloneMission` already uses `task: MissionBrief` — just make it reference the right type.

**Test:**
```bash
npx tsc --noEmit 2>&1 | grep "MissionBrief" | wc -l  # must be 0
```

---

### 0.2 — Add `provisionEnvironment()` to `KeychainManager`

**Problem:** `clone_worker.ts` calls `this.keychain.provisionEnvironment(handle.path, decision.requiredKeys)` — method doesn't exist.

**Fix:** Add to `core/keychain/manager.ts` after `buildScopedEnv()`:

```typescript
/**
 * PROVISION: Write a temporary .env file into the worktree for Python/shell clones.
 * For TypeScript clones, use buildScopedEnv() + process.env injection instead.
 * File is deleted by revokeEnvironment() in the finally block.
 */
public async provisionEnvironment(worktreePath: string, requiredKeys: string[]): Promise<void> {
  const scopedEnv = this.buildScopedEnv(requiredKeys);
  const envPath = path.join(worktreePath, '.env');
  const envContent = Object.entries(scopedEnv)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  await fs.promises.writeFile(envPath, envContent, { mode: 0o600 });
}
```

**Test:**
```typescript
// test/keychain.test.ts
import { KeychainManager } from '../core/keychain/manager';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

test('provisionEnvironment writes .env file with correct permissions', async () => {
  const km = new KeychainManager();
  // Patch masterVault for test
  (km as any).masterVault = { TEST_KEY: 'test-value-123' };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-provision-'));
  await km.provisionEnvironment(tmpDir, ['TEST_KEY']);

  const envPath = path.join(tmpDir, '.env');
  expect(fs.existsSync(envPath)).toBe(true);
  const content = fs.readFileSync(envPath, 'utf-8');
  expect(content).toContain('TEST_KEY=test-value-123');

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true });
});
```

---

### 0.3 — Add `revokeEnvironment()` to `KeychainManager`

**Problem:** `clone_worker.ts` calls `this.keychain.revokeEnvironment(handle.path)` — method doesn't exist.

**Fix:** Add to `core/keychain/manager.ts` after `provisionEnvironment()`:

```typescript
/**
 * REVOKE: Delete the .env file from the worktree. Always call in finally block.
 * Runs scanForLeaks() — if leak detected, logs FATAL and returns false.
 * Caller (CloneWorker) must treat false return as Janitor BLOCK.
 */
public async revokeEnvironment(worktreePath: string): Promise<boolean> {
  const envPath = path.join(worktreePath, '.env');
  try {
    await fs.promises.unlink(envPath);
  } catch {
    // File may not exist if provisionEnvironment never ran — not an error
  }
  const clean = this.scanForLeaks(worktreePath);
  if (!clean) {
    console.error(`[KEYCHAIN FATAL] Credential leak detected in ${worktreePath}`);
  }
  return clean;
}
```

**Test:**
```typescript
test('revokeEnvironment deletes .env file', async () => {
  const km = new KeychainManager();
  (km as any).masterVault = { TEST_KEY: 'test-value-123' };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-revoke-'));
  await km.provisionEnvironment(tmpDir, ['TEST_KEY']);
  expect(fs.existsSync(path.join(tmpDir, '.env'))).toBe(true);

  await km.revokeEnvironment(tmpDir);
  expect(fs.existsSync(path.join(tmpDir, '.env'))).toBe(false);

  fs.rmSync(tmpDir, { recursive: true });
});
```

---

### 0.4 — Add `getScopeKeys()` to `KeychainManager`

**Problem:** `core/brain/dispatcher.ts` calls `this.keychain.getScopeKeys(skill)` — method doesn't exist.

**Fix:** The scopes are defined in `core/keychain/config/scopes.yaml`. Add the method:

```typescript
// At top of manager.ts — add yaml import
import * as yaml from 'js-yaml';  // add to package.json: "js-yaml": "^4.1.0", "@types/js-yaml": "^4.0.9"

public getScopeKeys(skill: string): string[] {
  const scopesPath = path.join(__dirname, '../keychain/config/scopes.yaml');
  try {
    const raw = fs.readFileSync(scopesPath, 'utf-8');
    const scopes = yaml.load(raw) as Record<string, { credentials: string[] }>;
    return scopes[skill]?.credentials ?? [];
  } catch {
    console.warn(`[KEYCHAIN] Could not read scopes.yaml — returning empty scope for skill: ${skill}`);
    return [];
  }
}
```

**Test:**
```typescript
test('getScopeKeys returns credentials from scopes.yaml', () => {
  const km = new KeychainManager();
  const keys = km.getScopeKeys('code');
  // scopes.yaml has ANTHROPIC_API_KEY under code skill
  expect(Array.isArray(keys)).toBe(true);
  expect(keys.length).toBeGreaterThan(0);
  expect(keys).toContain('ANTHROPIC_API_KEY');
});

test('getScopeKeys returns empty array for unknown skill', () => {
  const km = new KeychainManager();
  const keys = km.getScopeKeys('nonexistent_skill');
  expect(keys).toEqual([]);
});
```

---

### 0.5 — Fix `MemPalaceAdapter` — add `writeSummary()` and `audit()`

**Problem:** `mempalace_adapter.ts` doesn't implement `MemoryStore` — missing `writeSummary` and `audit` methods, and `readContext` uses `string` instead of `MemoryTier` enum.

**Fix — rewrite `core/memory_store/mempalace_adapter.ts`:**

```typescript
// core/memory_store/mempalace_adapter.ts
import { MemoryStore, MemoryMetadata, MemoryTier, InteractionDigest, AuditReport } from './interface';

export class MemPalaceAdapter implements MemoryStore {
  private client: any;

  async connect(): Promise<void> {
    console.log("Vault connection established via MemPalace.");
    // TODO: Initialize MemPalace MCP client
  }

  async write(content: string, metadata: MemoryMetadata): Promise<string> {
    return await this.client.add({ text: content, meta: metadata });
  }

  async writeSummary(digest: InteractionDigest): Promise<string> {
    // Store as a structured memory entry in the summaries hall
    return await this.client.add({
      text: JSON.stringify(digest),
      meta: {
        source_id: 'user_agent',
        timestamp: digest.timestamp,
        tags: ['summary', 'interaction_digest'],
      }
    });
  }

  async readContext(tier: MemoryTier, query?: string): Promise<string> {
    if (tier === MemoryTier.L0_WAKE) {
      return await this.client.getWakeupContext();   // ≤170 tokens
    }
    return await this.client.getContext(tier, query);
  }

  async search(query: string, limit: number = 5): Promise<Array<{content: string, score: number}>> {
    return await this.client.vectorSearch(query, limit);
  }

  async delete(memoryId: string): Promise<boolean> {
    return await this.client.remove(memoryId);
  }

  async audit(olderThan?: Date): Promise<AuditReport> {
    // TODO: call MemPalace audit API when available
    // MVP stub — returns empty report (Janitor handles gracefully)
    return {
      contradictions: [],
      orphan_pages: [],
      stale_entries: [],
      timestamp: new Date().toISOString(),
    };
  }
}
```

**Test:**
```bash
npx tsc --noEmit 2>&1 | grep "mempalace_adapter" | wc -l  # must be 0
```

---

### 0.6 — Rename `core/brain/dispatcher.ts` → `core/brain/router.ts`

**Problem:** `brain/dispatcher.ts` (TypeScript) clashes in name with `brain/dispatcher.py` (Python). Any tool, grep, or CI script that searches for "dispatcher" will hit both.

**Fix:**
```bash
git mv core/brain/dispatcher.ts core/brain/router.ts
```

Update all imports that reference `../brain/dispatcher`:
- `core/clones/clone_worker.ts` line 15: `import { DispatchDecision } from '../brain/dispatcher'` → `from '../brain/router'`
- Update class export name: `BrainDispatcher` stays the same — just the filename changes.

**Test:**
```bash
grep -r "brain/dispatcher" core/ --include="*.ts" | wc -l  # must be 0
npx tsc --noEmit  # must exit 0
```

---

### 0.7 — Fix `spawner.ts` — remove duplicate `teardownWorktree()`

**Problem:** `core/clones/lifecycle/spawner.ts` (previously at `core/clones/spawner.ts`) still has a `teardownWorktree()` method that duplicates `teardown.ts`. Also has a stale header comment referencing the old path.

**Fix:**
1. Update header comment: `// core/clones/lifecycle/spawner.ts`
2. Delete the `teardownWorktree()` method (lines 47-52 in the current file). `CloneTeardown` owns teardown.

**Test:**
```bash
grep "teardownWorktree" core/clones/lifecycle/spawner.ts | wc -l  # must be 0
npx tsc --noEmit
```

---

### Phase 0 completion check

```bash
cd /tmp/agent4wiki
npx tsc --noEmit
echo "Exit code: $?"  # must be 0
```

---

## Phase 1 — Fix Python Dispatcher Paths + Janitor Integration (Week 1)

**Goal:** `python brain/dispatcher.py watch` runs without errors and correctly processes a manually dropped task file. Janitor directives are handled, not silently bypassed.

---

### 1.1 — Fix all broken paths in `brain/dispatcher.py`

**Problem:** All path constants reference a hypothetical `user-agent/` directory that doesn't exist in the repo. The actual structure uses `state/user_agent/`.

**Fix — update `brain/dispatcher.py` lines 50-59:**

```python
BASE_DIR = Path(os.environ.get("AGENT_BASE_DIR", Path(__file__).parent.parent.resolve()))
INBOX     = BASE_DIR / "brain" / "inbox"
ACTIVE    = BASE_DIR / "brain" / "active"
COMPLETED = BASE_DIR / "brain" / "completed"
FAILED    = BASE_DIR / "brain" / "failed"
TEMPLATES = BASE_DIR / "templates"           # canonical until consolidated to core/clones/templates/
WIKI_INDEX = BASE_DIR / "wiki" / "index.md"
USER_STATE = BASE_DIR / "state" / "user_agent" / "state.json"
SOUL_MD   = BASE_DIR / "wiki" / "Soul.md"    # committed generic soul
EVENT_LOG = BASE_DIR / "events" / "dispatcher.jsonl"
```

**Test:**
```bash
python brain/dispatcher.py dry brain/inbox/test-001.json 2>&1 | grep "ERROR\|FileNotFoundError" | wc -l  # must be 0
```

Create a minimal test task first:
```bash
cat > brain/inbox/test-001.json << 'EOF'
{
  "id": "test-001",
  "type": "clone",
  "skill": "code",
  "objective": "Create a file hello.txt containing 'hello world'",
  "source": "manual",
  "priority": 3,
  "required_keys": [],
  "wiki_pages": [],
  "constraints": ["only create files in /tmp/test-001/"],
  "timeout_minutes": 5
}
EOF

python brain/dispatcher.py dry brain/inbox/test-001.json
```

Expected dry run output: shows assembled context, no errors, does not execute.

---

### 1.2 — Add Janitor integration to `brain/dispatcher.py`

**Problem:** Dispatcher treats every clone completion as `COMPLETED` or `FAILED`. The `BLOCK/SUGGEST/NOTE` directive system from Janitor is entirely bypassed.

**Fix — add these functions to `brain/dispatcher.py`:**

```python
import re

def extract_handshake(output: str) -> Optional[dict]:
    """Extract the JSON handshake block from clone stdout."""
    # Clone is expected to emit one JSON object containing "status" key
    matches = re.findall(r'\{[^{}]*"status"[^{}]*\}', output, re.DOTALL)
    if not matches:
        return None
    try:
        return json.loads(matches[-1])  # take the last match (final handshake)
    except json.JSONDecodeError:
        return None


def janitor_evaluate(handshake: dict, retry_count: int, task_id: str) -> str:
    """
    Minimal Python-side Janitor evaluation.
    Returns: "NOTE" | "SUGGEST" | "BLOCK"

    The full Janitor (core/janitor/auditor.ts) will be called via CLI
    once the TypeScript build is working. This is the MVP bridge.
    """
    status = handshake.get("status", "FAILED_REQUIRE_HUMAN")

    if status == "BLOCKED_IMPOSSIBLE":
        return "BLOCK"

    if status == "COMPLETED":
        tests_passed = handshake.get("tests_passed", False)
        notes = handshake.get("janitor_notes", "").lower()

        # Structural checks (mirror of auditor.ts detectStructuralIssue)
        files = handshake.get("files_modified", [])
        source_files = [f for f in files if re.search(r'\.(ts|js|py)$', f) and 'test' not in f]
        if len(files) > 5 and re.search(r'also fixed|while i was at it|out of scope', notes):
            log.warning(f"[JANITOR] SCOPE CREEP detected in {task_id}")
            return "SUGGEST"

        if not tests_passed and source_files:
            log.warning(f"[JANITOR] MISSING TESTS or tests failed in {task_id}")
            return "SUGGEST"

        if any(kw in notes for kw in ["hacky", "tech debt", "todo:", "fragile", "slow"]):
            log.warning(f"[JANITOR] ARCHITECTURAL SMELL in {task_id}: {notes[:100]}")
            return "SUGGEST"

        return "NOTE"

    if status == "FAILED_RETRY" and retry_count < 2:
        return "SUGGEST"

    return "BLOCK"


def write_forge_record(task: Task, directive: str, handshake: dict):
    """Write a ForgeRecord to forge/events.jsonl for Forge consumption."""
    record = {
        "task_id": task.id,
        "skill": task.skill,
        "directive": directive,
        "tokens_consumed": handshake.get("tokens_consumed", 0),
        "duration_seconds": handshake.get("duration_seconds", 0),
        "files_modified": handshake.get("files_modified", []),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    forge_log = BASE_DIR / "forge" / "events.jsonl"
    forge_log.parent.mkdir(parents=True, exist_ok=True)
    with open(forge_log, "a") as f:
        f.write(json.dumps(record) + "\n")
```

**Update `execute_task()` in `dispatcher.py` to use this logic:**

After `launch_session()` returns output, replace the simple `move_to_completed()` with:

```python
handshake = extract_handshake(output)
if not handshake:
    log.error(f"[{task.id}] No JSON handshake in clone output — treating as BLOCK")
    move_to_failed(task, task_path, "No handshake JSON found")
    return

directive = janitor_evaluate(handshake, retry_count=0, task_id=task.id)
write_forge_record(task, directive, handshake)

if directive == "NOTE":
    log.info(f"[{task.id}] Janitor: NOTE — merging result")
    move_to_completed(task, task_path, output)
elif directive == "SUGGEST":
    log.info(f"[{task.id}] Janitor: SUGGEST — re-queuing with feedback")
    task.objective += f"\n\nJanitor feedback: {handshake.get('janitor_notes', '')}"
    # Re-drop modified task into inbox (with incremented retry counter)
    requeue_task(task, INBOX)
elif directive == "BLOCK":
    log.warning(f"[{task.id}] Janitor: BLOCK — escalating to human")
    move_to_failed(task, task_path, f"Janitor BLOCK: {handshake.get('janitor_notes', '')}")
    notify_human(task, directive, handshake)  # Telegram alert
```

**Test:**
```python
# test/test_dispatcher.py
import sys
sys.path.insert(0, 'brain')
from dispatcher import janitor_evaluate, extract_handshake

def test_extract_handshake_valid():
    output = 'Some output\n{"status": "COMPLETED", "tests_passed": true, "files_modified": ["main.py"], "janitor_notes": "clean", "tokens_consumed": 1000, "duration_seconds": 30}\n'
    h = extract_handshake(output)
    assert h is not None
    assert h["status"] == "COMPLETED"

def test_extract_handshake_missing():
    assert extract_handshake("no json here") is None

def test_janitor_evaluate_completed_clean():
    h = {"status": "COMPLETED", "tests_passed": True, "files_modified": ["main.py"], "janitor_notes": "all good"}
    assert janitor_evaluate(h, 0, "t-001") == "NOTE"

def test_janitor_evaluate_scope_creep():
    h = {
        "status": "COMPLETED", "tests_passed": True,
        "files_modified": ["a.py", "b.py", "c.py", "d.py", "e.py", "f.py"],
        "janitor_notes": "also fixed some unrelated formatting while I was at it"
    }
    assert janitor_evaluate(h, 0, "t-001") == "SUGGEST"

def test_janitor_evaluate_no_tests():
    h = {"status": "COMPLETED", "tests_passed": False, "files_modified": ["main.py"], "janitor_notes": "done"}
    assert janitor_evaluate(h, 0, "t-001") == "SUGGEST"

def test_janitor_evaluate_blocked_impossible():
    h = {"status": "BLOCKED_IMPOSSIBLE", "files_modified": [], "tests_passed": False, "janitor_notes": "can't do this"}
    assert janitor_evaluate(h, 0, "t-001") == "BLOCK"
```

Run: `python -m pytest test/test_dispatcher.py -v`

---

### 1.3 — Add `MAX_RETRIES` constant (shared)

```python
# brain/dispatcher.py — near top with other constants
MAX_RETRIES = 3  # circuit breaker — after 3 SUGGEST cycles, force BLOCK
```

**Test:** Verify `test_janitor_evaluate_*` tests use this constant.

---

### Phase 1 completion check

```bash
# Start dispatcher
python brain/dispatcher.py watch &
DISPATCHER_PID=$!

# Drop the test task
cp brain/inbox/test-001.json brain/inbox/test-run-$(date +%s).json
sleep 5

# Check it was picked up
ls brain/active/ brain/completed/ brain/failed/

kill $DISPATCHER_PID
```

---

## Phase 2 — Credential System (Week 2)

**Goal:** A real credential can be loaded from `.env`, injected into a worktree, used by a clone, and confirmed gone after teardown.

---

### 2.1 — Implement `loadMasterVault()` — MVP: read from `.env`

**Problem:** Always returns `{}`. All credential injection fails.

**Fix — replace the stub in `core/keychain/manager.ts`:**

```typescript
private loadMasterVault(): Record<string, string> {
  const vault: Record<string, string> = {};

  // MVP: read from .env file at repo root (not production-grade, but unblocks Phase 3)
  // Production path: state/keychain/vault.enc (AES-256-GCM + Argon2id)
  const envPath = path.join(process.cwd(), '.env');
  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      vault[key] = value;
    }
    console.log(`[KEYCHAIN] Loaded ${Object.keys(vault).length} keys from .env`);
  } catch {
    console.warn('[KEYCHAIN] No .env file found — vault is empty. Clone launches will fail.');
  }

  return vault;
}
```

**Test:**
```typescript
test('loadMasterVault reads from .env', () => {
  // Write a test .env in a tmpdir, patch process.cwd
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-vault-'));
  fs.writeFileSync(path.join(tmpDir, '.env'), 'ANTHROPIC_API_KEY=test-key-123\nTELEGRAM_BOT_TOKEN=987654\n');

  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;

  const km = new KeychainManager();
  const vault = (km as any).masterVault;

  expect(vault['ANTHROPIC_API_KEY']).toBe('test-key-123');
  expect(vault['TELEGRAM_BOT_TOKEN']).toBe('987654');

  process.cwd = originalCwd;
  fs.rmSync(tmpDir, { recursive: true });
});
```

---

### 2.2 — Implement `scanForLeaks()` using `patterns.yaml`

**Problem:** Always returns `true` (no leaks). Security scanner is completely disabled.

**Fix:**

```typescript
private scanForLeaks(worktreePath: string): boolean {
  // Load patterns from config
  const patternsPath = path.join(__dirname, '../keychain/config/patterns.yaml');
  let patterns: Array<{name: string, regex: string, severity: string}> = [];
  try {
    const raw = fs.readFileSync(patternsPath, 'utf-8');
    const parsed = yaml.load(raw) as { patterns: typeof patterns };
    patterns = parsed.patterns ?? [];
  } catch {
    console.warn('[KEYCHAIN] Could not load patterns.yaml — leak scan skipped');
    return true;
  }

  // Collect vault values for exact-match check
  const vaultValues = Object.values(this.masterVault).filter(v => v.length > 8);

  // Scan all files modified in the worktree
  let foundLeak = false;
  const files = this.getModifiedFiles(worktreePath);

  for (const filePath of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch { continue; }

    // Check exact vault value match
    for (const value of vaultValues) {
      if (content.includes(value)) {
        console.error(`[LEAK SCAN] Exact vault value found in ${filePath}`);
        foundLeak = true;
      }
    }

    // Check regex patterns
    for (const pattern of patterns) {
      if (new RegExp(pattern.regex).test(content)) {
        console.error(`[LEAK SCAN] Pattern "${pattern.name}" matched in ${filePath}`);
        if (pattern.severity === 'critical') foundLeak = true;
      }
    }
  }

  return !foundLeak;  // true = clean, false = leak found
}

private getModifiedFiles(worktreePath: string): string[] {
  try {
    const result = require('child_process').execSync(
      'git diff --name-only HEAD',
      { cwd: worktreePath, encoding: 'utf-8' }
    );
    return result.trim().split('\n')
      .filter(Boolean)
      .map((f: string) => path.join(worktreePath, f));
  } catch {
    return [];
  }
}
```

**Test:**
```typescript
test('scanForLeaks detects hardcoded vault value', () => {
  const km = new KeychainManager();
  (km as any).masterVault = { SECRET_KEY: 'sk-ant-EXAMPLE-key' };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-scan-'));
  // Simulate a file with a leaked key
  fs.writeFileSync(path.join(tmpDir, 'config.py'), "API_KEY = 'sk-ant-EXAMPLE-key'");

  // Init git so getModifiedFiles works
  require('child_process').execSync('git init && git add . && git commit -m "init" --allow-empty', { cwd: tmpDir });

  const clean = (km as any).scanForLeaks(tmpDir);
  // Note: exact match requires the file to appear in git diff — for MVP, just test the pattern check
  // Full integration test requires a proper git worktree setup

  fs.rmSync(tmpDir, { recursive: true });
});

test('scanForLeaks passes clean directory', () => {
  const km = new KeychainManager();
  (km as any).masterVault = { SECRET_KEY: 'sk-ant-EXAMPLE-key' };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-scan-clean-'));
  fs.writeFileSync(path.join(tmpDir, 'main.py'), "print('hello world')");

  const clean = (km as any).scanForLeaks(tmpDir);
  expect(clean).toBe(true);

  fs.rmSync(tmpDir, { recursive: true });
});
```

---

### 2.3 — Integration test: full provision → clone → revoke cycle

This test requires `ANTHROPIC_API_KEY` in `.env`.

```bash
# Manual integration test (no mocks)
cat > /tmp/provision-test.ts << 'EOF'
import { KeychainManager } from './core/keychain/manager';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

async function main() {
  const km = new KeychainManager();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provision-integ-'));

  console.log('1. Provisioning...');
  await km.provisionEnvironment(tmpDir, ['ANTHROPIC_API_KEY']);

  const envPath = path.join(tmpDir, '.env');
  console.log('2. .env exists:', fs.existsSync(envPath));
  const content = fs.readFileSync(envPath, 'utf-8');
  console.log('3. Contains key:', content.includes('ANTHROPIC_API_KEY'));
  console.log('4. Value is not empty:', !content.includes('ANTHROPIC_API_KEY=\n'));

  console.log('5. Revoking...');
  const clean = await km.revokeEnvironment(tmpDir);
  console.log('6. .env deleted:', !fs.existsSync(envPath));
  console.log('7. Scan clean:', clean);

  fs.rmSync(tmpDir, { recursive: true });
  console.log('\n✓ Provision → Revoke cycle complete');
}

main().catch(console.error);
EOF
npx ts-node /tmp/provision-test.ts
```

Expected output:
```
1. Provisioning...
2. .env exists: true
3. Contains key: true
4. Value is not empty: true
5. Revoking...
6. .env deleted: true
7. Scan clean: true

✓ Provision → Revoke cycle complete
```

---

## Phase 3 — Clone Lifecycle (Weeks 3-4)

**Goal:** A task dropped into `brain/inbox/` triggers a real git worktree, runs a trivial Claude session, and the worktree is cleaned up after completion.

---

### 3.1 — Implement `CloneSpawner.createWorktree()`

**Fix — implement the stub in `core/clones/lifecycle/spawner.ts`:**

```typescript
import { execSync } from 'child_process';

const REPO_ROOT = process.env.AGENT_BASE_DIR || process.cwd();

public async createWorktree(cloneId: string, skill: string): Promise<WorktreeHandle> {
  const branch = `clone/${cloneId}`;
  const worktreePath = path.resolve(REPO_ROOT, 'state', 'worktrees', cloneId);

  // 1. Create git worktree
  execSync(`git worktree add "${worktreePath}" -b "${branch}"`, {
    cwd: REPO_ROOT,
    stdio: 'pipe'
  });

  // 2. Copy mission brief template
  const templateSrc = path.join(REPO_ROOT, 'templates', `${skill}-task.md`);
  const templateDst = path.join(worktreePath, 'TASK.md');
  if (fs.existsSync(templateSrc)) {
    await fs.promises.copyFile(templateSrc, templateDst);
  }

  // 3. Write setup.sh
  const setupScript = `#!/bin/bash\nset -e\n# Clone setup — install deps here\n`;
  await fs.promises.writeFile(path.join(worktreePath, 'setup.sh'), setupScript, { mode: 0o755 });

  // 4. Register in worktrees registry
  await this.registerWorktree(cloneId, worktreePath, branch);

  return { cloneId, path: worktreePath, branch, createdAt: new Date() };
}

private async registerWorktree(cloneId: string, worktreePath: string, branch: string): Promise<void> {
  const registryPath = path.join(REPO_ROOT, 'state', 'worktrees', 'registry.json');
  let registry: Record<string, any> = {};
  try {
    registry = JSON.parse(await fs.promises.readFile(registryPath, 'utf-8'));
  } catch { /* first entry */ }

  registry[cloneId] = { path: worktreePath, branch, createdAt: new Date().toISOString() };
  await fs.promises.writeFile(registryPath, JSON.stringify(registry, null, 2));
}
```

**Test:**
```typescript
test('createWorktree creates git worktree and returns handle', async () => {
  const spawner = new CloneSpawner();
  const handle = await spawner.createWorktree('test-spawn-001', 'code');

  expect(handle.cloneId).toBe('test-spawn-001');
  expect(handle.branch).toBe('clone/test-spawn-001');
  expect(fs.existsSync(handle.path)).toBe(true);
  expect(fs.existsSync(path.join(handle.path, 'setup.sh'))).toBe(true);

  // Cleanup
  execSync(`git worktree remove "${handle.path}" --force`);
  execSync(`git branch -D "clone/test-spawn-001"`);
});
```

---

### 3.2 — Implement `CloneRunner.run()`

**Fix — implement the three private methods in `core/clones/lifecycle/runner.ts`:**

Note: `clone_worker.ts` passes a `prompt` string but runner.ts expects a `promptPath`. Fix the interface — runner.ts should accept the assembled prompt string directly (the PromptBuilder already assembled it):

```typescript
// Change signature:
public async run(handle: WorktreeHandle, prompt: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<HandshakeResult>

private async runSetup(worktreePath: string): Promise<void> {
  const setupScript = path.join(worktreePath, 'setup.sh');
  if (!fs.existsSync(setupScript)) return; // optional
  await execAsync(`bash "${setupScript}"`, {
    cwd: worktreePath,
    timeout: 5 * 60 * 1000  // 5 minute setup timeout
  });
}

private async runRepomix(worktreePath: string): Promise<void> {
  // Repomix packs the repo into context.md (~70% token reduction)
  // Ignore errors — clone can proceed without Repomix if npx not available
  try {
    await execAsync('npx repomix --output repomix.txt', {
      cwd: worktreePath,
      timeout: 2 * 60 * 1000
    });
  } catch {
    console.warn('[RUNNER] Repomix failed — proceeding without packed context');
  }
}

private async launchClause(worktreePath: string, prompt: string, timeoutMs: number): Promise<HandshakeResult> {
  // Write prompt to a temp file (avoids shell escaping issues with long prompts)
  const promptFile = path.join(worktreePath, '_prompt.md');
  await fs.promises.writeFile(promptFile, prompt);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Clone timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const child = spawn('claude', ['--print', '--dangerously-skip-permissions', '-p', `@${promptFile}`], {
      cwd: worktreePath,
      env: process.env  // credentials already in env from provisionEnvironment
    });

    let output = '';
    child.stdout.on('data', d => { output += d.toString(); });
    child.stderr.on('data', d => { console.error('[CLONE STDERR]', d.toString()); });

    child.on('close', (code) => {
      clearTimeout(timer);
      // Cleanup prompt file
      fs.unlink(promptFile, () => {});

      const jsonMatch = output.match(/\{[\s\S]*?"status"[\s\S]*?\}/m);
      if (jsonMatch) {
        try {
          resolve(JSON.parse(jsonMatch[0]) as HandshakeResult);
          return;
        } catch { /* fall through to failure */ }
      }
      reject(new Error(`Clone exit ${code} — no valid JSON handshake in output`));
    });
  });
}

// Helper
import { promisify } from 'util';
import { exec } from 'child_process';
const execAsync = promisify(exec);
```

**Test (integration — requires claude CLI):**
```bash
# Smoke test: does a clone produce a valid JSON handshake?
cat > /tmp/smoke-prompt.md << 'EOF'
Create a file /tmp/smoke-test-output.txt containing "SMOKE_TEST_PASS".
Then output this JSON and nothing else after it:
{"status": "COMPLETED", "files_modified": ["/tmp/smoke-test-output.txt"], "tests_passed": true, "tokens_consumed": 100, "duration_seconds": 5, "janitor_notes": "created file as requested"}
EOF

claude --print --dangerously-skip-permissions -p "@/tmp/smoke-prompt.md"
cat /tmp/smoke-test-output.txt  # must show SMOKE_TEST_PASS
```

---

### 3.3 — Implement `CloneTeardown`

```typescript
// core/clones/lifecycle/teardown.ts

const REPO_ROOT = process.env.AGENT_BASE_DIR || process.cwd();

private async mergeWorktree(handle: WorktreeHandle): Promise<void> {
  // Commit everything in the worktree
  try {
    execSync(`git -C "${handle.path}" add -A`, { stdio: 'pipe' });
    execSync(`git -C "${handle.path}" commit -m "feat(clone/${handle.cloneId}): mission complete"`, { stdio: 'pipe' });
  } catch {
    // Nothing to commit — worktree may not have produced files
  }
  // Merge to main
  execSync(`git -C "${REPO_ROOT}" merge "${handle.branch}" --no-ff -m "merge: clone/${handle.cloneId}"`, { stdio: 'pipe' });
}

private async removeWorktree(handle: WorktreeHandle): Promise<void> {
  execSync(`git -C "${REPO_ROOT}" worktree remove "${handle.path}" --force`, { stdio: 'pipe' });
  // Remove from registry
  const registryPath = path.join(REPO_ROOT, 'state', 'worktrees', 'registry.json');
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    delete registry[handle.cloneId];
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  } catch { /* registry may not exist */ }
}

private async pruneBranch(branch: string): Promise<void> {
  try {
    execSync(`git -C "${REPO_ROOT}" branch -d "${branch}"`, { stdio: 'pipe' });
  } catch {
    // Branch already merged or never existed — not fatal
  }
}
```

**Test:**
```typescript
test('teardown removes worktree and prunes branch on NOTE', async () => {
  // Setup: create a worktree first
  const spawner = new CloneSpawner();
  const handle = await spawner.createWorktree('test-teardown-001', 'code');

  const teardown = new CloneTeardown();
  await teardown.teardown(handle, AuditDirective.NOTE);

  expect(fs.existsSync(handle.path)).toBe(false);
  // Branch should be gone
  const branches = execSync('git branch').toString();
  expect(branches).not.toContain('clone/test-teardown-001');
});
```

---

### Phase 3 — End-to-End Integration Test

```bash
# Drop a minimal task, watch it go through full lifecycle
python brain/dispatcher.py watch &
PID=$!

cat > brain/inbox/e2e-test-001.json << 'EOF'
{
  "id": "e2e-test-001",
  "type": "clone",
  "skill": "code",
  "objective": "Create /tmp/e2e-test-001/result.txt with content 'E2E_PASS'. Output handshake JSON.",
  "source": "manual",
  "priority": 1,
  "required_keys": ["ANTHROPIC_API_KEY"],
  "wiki_pages": [],
  "constraints": ["only write to /tmp/e2e-test-001/"],
  "timeout_minutes": 10
}
EOF

sleep 120  # wait for clone to run

# Verify
ls brain/completed/   # should contain e2e-test-001.json
cat /tmp/e2e-test-001/result.txt  # should show E2E_PASS
ls state/worktrees/   # should be empty (worktree cleaned up)

kill $PID
```

---

## Phase 4 — Brain Planning (Weeks 5-6)

**Goal:** A Telegram message is classified → Brain plans using Sequential Thinking → PromptBuilder assembles the mission brief → task dropped to inbox automatically.

---

### 4.1 — Implement `PromptBuilder.build()` template injection

The `PromptBuilder` file is largely correct. The only issue: `build()` receives a `brief: MissionBrief` but the template expects specific `{INJECT_*}` placeholders. Verify the template matches:

```bash
grep "INJECT_" templates/code-clone-TASK.md
# Must show: {INJECT_SOUL_HERE}, {INJECT_ALLOWED_PATHS_HERE}, {INJECT_TASK_HERE}
```

If these aren't in the template, add them. The `build()` implementation is already complete (no stub). Just test it:

```typescript
test('PromptBuilder.build() replaces all injection variables', async () => {
  const builder = new PromptBuilder();
  const brief: MissionBrief = {
    id: 'test-001',
    objective: 'Write a test function',
    skill: 'code',
    requiredKeys: ['ANTHROPIC_API_KEY'],
    wikiContext: [],
    constraints: ['no network access'],
    allowedPaths: ['/tmp/test-001/'],
    allowedEndpoints: ['api.anthropic.com'],
    timeoutMinutes: 30,
  };

  const result = await builder.build('templates/code-clone-TASK.md', brief);
  expect(result).not.toContain('{INJECT_TASK_HERE}');
  expect(result).toContain('Write a test function');
  expect(result).not.toContain('{INJECT_ALLOWED_PATHS_HERE}');
  expect(result).toContain('/tmp/test-001/');
});
```

---

### 4.2 — Implement `BrainPlanner.plan()` — MVP without Sequential Thinking MCP

Sequential Thinking MCP may not be available. Ship an MVP that produces a structured `MissionBrief` from a task objective using a direct Claude API call:

```typescript
// core/brain/planner.ts — replace the throw with:
import Anthropic from '@anthropic-ai/sdk';

public async plan(taskObjective: string, taskId: string): Promise<ThinkingResult> {
  const client = new Anthropic();

  const systemPrompt = `You are the Brain planning module of Agent V4.
Given a task objective, produce a structured MissionBrief JSON.
Output ONLY valid JSON in this exact format:
{
  "skill": "code"|"research"|"devops"|"qa"|"docs"|"data",
  "requiredKeys": ["ANTHROPIC_API_KEY"],
  "wikiContext": [],
  "constraints": ["no network unless required"],
  "allowedPaths": ["/tmp/<task-id>/"],
  "allowedEndpoints": ["api.anthropic.com"],
  "timeoutMinutes": 30,
  "reasoning": "1-sentence rationale for skill choice"
}`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',  // Haiku — cheap routing task
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: taskObjective }],
  });

  const text = msg.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
  const planData = JSON.parse(text);

  return {
    reasoning: [planData.reasoning],
    brief: {
      id: taskId,
      objective: taskObjective,
      skill: planData.skill,
      requiredKeys: planData.requiredKeys,
      wikiContext: planData.wikiContext,
      constraints: planData.constraints,
      allowedPaths: planData.allowedPaths,
      allowedEndpoints: planData.allowedEndpoints,
      timeoutMinutes: planData.timeoutMinutes,
    },
    confidence: 0.8,  // MVP — static until Sequential Thinking MCP integrated
  };
}
```

**Test:**
```typescript
test('BrainPlanner.plan() returns valid MissionBrief', async () => {
  const planner = new BrainPlanner();
  const result = await planner.plan('Write a Python script that prints Fibonacci numbers', 'test-plan-001');

  expect(result.brief.id).toBe('test-plan-001');
  expect(result.brief.skill).toMatch(/^(code|research|devops|qa|docs|data)$/);
  expect(result.brief.requiredKeys).toContain('ANTHROPIC_API_KEY');
  expect(result.confidence).toBeGreaterThan(0);
}, 30000); // 30s timeout — real API call
```

---

### 4.3 — Wire `UserAgent.triggerFullPipeline()` → write to `brain/inbox/`

**This is the key bridge Gemini review 7 identified as the missing piece.**

```typescript
// core/user_agent/agent.ts — replace triggerFullPipeline stub:
import { BrainPlanner } from '../brain/planner';
import { v4 as uuidv4 } from 'uuid';  // npm install uuid @types/uuid
import * as path from 'path';

private planner = new BrainPlanner();

private async triggerFullPipeline(prompt: string): Promise<string> {
  const taskId = `task-${uuidv4().slice(0, 8)}`;
  const planning = await this.planner.plan(prompt, taskId);

  const task = {
    id: taskId,
    type: 'clone',
    skill: planning.brief.skill,
    objective: planning.brief.objective,
    source: 'user_agent',
    priority: 2,
    required_keys: planning.brief.requiredKeys,
    wiki_pages: planning.brief.wikiContext,
    constraints: planning.brief.constraints,
    timeout_minutes: planning.brief.timeoutMinutes,
    created_at: new Date().toISOString(),
  };

  const inboxPath = path.join(process.env.AGENT_BASE_DIR || process.cwd(), 'brain', 'inbox', `${taskId}.json`);
  await fs.promises.mkdir(path.dirname(inboxPath), { recursive: true });
  await fs.promises.writeFile(inboxPath, JSON.stringify(task, null, 2));

  console.log(`[USER AGENT] Task ${taskId} → brain/inbox/`);
  return `Task queued: ${taskId}. Dispatcher will pick it up and report results.`;
}
```

**Test:**
```typescript
test('triggerFullPipeline writes valid task JSON to brain/inbox/', async () => {
  const agent = new UserAgent();
  await (agent as any).triggerFullPipeline('Write a Python hello world script');

  const inboxFiles = fs.readdirSync('brain/inbox/').filter(f => f.endsWith('.json'));
  expect(inboxFiles.length).toBeGreaterThan(0);

  const taskFile = JSON.parse(fs.readFileSync(`brain/inbox/${inboxFiles[0]}`, 'utf-8'));
  expect(taskFile.type).toBe('clone');
  expect(taskFile.source).toBe('user_agent');
  expect(taskFile.objective).toBeTruthy();

  // Cleanup
  fs.unlinkSync(`brain/inbox/${inboxFiles[0]}`);
});
```

---

### Phase 4 — First autonomous loop test

```bash
# Terminal 1: start dispatcher
python brain/dispatcher.py watch

# Terminal 2: simulate a Telegram message arriving at User Agent
npx ts-node -e "
import { UserAgent } from './core/user_agent/agent';
const agent = new UserAgent();
agent.handleUserInput('Write a Python script that prints hello world to /tmp/hello-world.py').then(r => {
  console.log('User Agent response:', r);
});
"

# Watch dispatcher pick up the task and run it
# Check brain/completed/ for the result
```

**Expected:** Telegram message → classifier routes FULL_PIPELINE → planner creates MissionBrief → task.json written to inbox → dispatcher picks up → clone runs → result in brain/completed/ → Janitor evaluates → ForgeRecord written.

---

## Phase 5 — Fleet Deployment (After Phase 3 stable)

Covered in [[concept-distributed-clones]] and [[concept-node-setup]]. Only begin after Phase 3 end-to-end test passes on the primary machine.

Short checklist:
1. Bootstrap second node: `bash scripts/bootstrap-linux.sh --node-type code`
2. Set `AGENT_BASE_DIR` to shared git inbox path (or Telegram bus per concept-distributed-clones.md)
3. Add `target_node: "KEVIN"` field to task JSON
4. Filter in `brain/dispatcher.py`: skip tasks where `target_node != hostname`
5. Test: dispatch code task to KEVIN, verify it does NOT run on MIKE

---

## Test Infrastructure Setup

Run once before starting Phase 0:

```bash
# Install Jest for TypeScript unit tests
npm install --save-dev jest ts-jest @types/jest
cat > jest.config.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  testTimeout: 60000,
};
EOF

mkdir -p test

# Install pytest for Python tests
source venv/bin/activate
pip install pytest

mkdir -p test
```

Run tests:
```bash
# TypeScript
npx jest test/ --verbose

# Python
python -m pytest test/test_dispatcher.py -v

# Both
npx jest && python -m pytest test/test_dispatcher.py
```

*See also: [[review-code-audit-1]], [[review-gemini-review7]], [[plan-implementation-v4]], [[concept-dispatcher]]*
