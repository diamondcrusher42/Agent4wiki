# Build Plan V2 — Phase 5-7 Implementation Brief

> Author: Kevin (agent orchestrator)
> Date: 2026-04-08
> Target: Opus 4.6 in a fresh session on opus-build branch
> Scope: All remaining TODOs from Phase 0-4 build

## Context — What Already Exists

You are building on top of a complete Phases 0-4 implementation (57 tests, all green).
Read `wiki/decisions/build-state-2026-04-08.md` for the full picture.

**Branch:** `opus-build` (check it out, do NOT touch `main`)
**Repo path:** `/home/claudebot/clones/agent4wiki-opus-build-20260408`

Architecture decision: TypeScript for all core/ code. Python only for brain/dispatcher.py and clone scripts. MCP as the firewall between TS core and Python MemPalace process.

---

## Phase 5 — AES-256 Vault Hardening

### File: `core/keychain/manager.ts`

Replace the MVP `.env` reader in `loadMasterVault()` with a real encrypted vault.

**Current state (MVP):**
```typescript
private loadMasterVault(): Record<string, string> {
  // Reads plain .env file — not production-grade
}
```

**Required implementation:**

1. **Vault format**: `state/keychain/vault.enc` — AES-256-GCM encrypted JSON.
   - File structure: `{ iv: hex, authTag: hex, ciphertext: hex }`
   - Key derivation: Argon2id from a master password (read from `VAULT_MASTER_PASSWORD` env var, NOT from `.env`)
   - Salt: stored separately at `state/keychain/vault.salt` (32 random bytes, hex-encoded)

2. **`initVault(masterPassword: string, initialSecrets: Record<string, string>): void`** — new method
   - Generates fresh salt, derives key via Argon2id
   - Encrypts secrets as AES-256-GCM
   - Writes `vault.enc` and `vault.salt`
   - Refuses to overwrite existing vault (throw error)

3. **`loadMasterVault(): Record<string, string>`** — replace existing
   - Reads `VAULT_MASTER_PASSWORD` from `process.env` (never from disk)
   - Reads `vault.salt`, derives key via Argon2id
   - Reads `vault.enc`, decrypts AES-256-GCM
   - Falls back to `.env` if `vault.enc` does not exist (backward compat for dev)

4. **`addSecret(key: string, value: string): void`** — new method
   - Decrypts vault, adds key, re-encrypts and saves

5. **Use Node.js built-ins only**: `crypto` module (no external crypto libs). For Argon2id, use `node:crypto` `scrypt` as a substitute (Argon2id not natively available — use `crypto.scryptSync(password, salt, 32, { N: 65536, r: 8, p: 1 })`).

**Tests to add** (`test/keychain.test.ts`):
- `initVault() writes encrypted file, not plaintext`
- `loadMasterVault() decrypts correctly`
- `loadMasterVault() falls back to .env when vault.enc missing`
- `addSecret() persists across reload`
- `wrong password throws on decrypt`

---

## Phase 5 — MCP Transport (MemPalace Adapter)

### File: `core/memory_store/mempalace_adapter.ts`

Wire all TODO stubs. The MCP SDK is already installed: `@modelcontextprotocol/sdk`.

**Current state:** All methods throw or do nothing. `connect()` just logs.

**Required implementation:**

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
```

**`connect(): Promise<void>`**
```typescript
const transport = new StdioClientTransport({
  command: 'python3',
  args: ['-m', 'mempalace.server'],
  env: { ...process.env },
});
const client = new Client({ name: 'agent4-core', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);
this.client = client;
```

**`write(content, metadata): Promise<string>`**
- Call MCP tool `add_memory` with `{ text: content, meta: metadata }`
- Return the memory ID from the response

**`writeSummary(digest): Promise<string>`**
- Call MCP tool `add_memory` with structured JSON
- Tag with `['summary', 'interaction_digest']`

**`readContext(tier, query?): Promise<string>`**
- `L0_WAKE` → call tool `get_aaak_summary` (no args)
- All other tiers → call tool `search_vault` with `{ tier, query, limit: 10 }`
- Return stringified result

**`search(query, limit): Promise<Array<{content, score}>>`**
- Call tool `search_vault` with `{ query, limit }`

**`delete(memoryId): Promise<boolean>`**
- Call tool `delete_memory` with `{ id: memoryId }`

**`audit(olderThan?): Promise<AuditReport>`**
- Call tool `audit_vault` with `{ older_than: olderThan?.toISOString() }`
- Map response to `AuditReport` shape

**Error handling:** All methods must catch MCP errors and return safe fallbacks (empty string, empty array, false) — never propagate. Log `[MEMPALACE]` prefix. If `this.client` is null (not connected), log warning and return fallback instead of throwing.

**Tests to add** (`test/core/memory_store/mempalace_adapter.test.ts` — co-locate with code):
- Mock `StdioClientTransport` and `Client`
- `connect()` initialises client and calls connect
- `write()` calls add_memory tool with correct args
- `readContext(L0_WAKE)` calls get_aaak_summary
- `search()` calls search_vault
- `delete()` calls delete_memory
- Methods return safe fallbacks when client is null

---

## Phase 6 — WikiScythe Contradiction Detection

### File: `core/janitor/scythe.ts`

The scythe already has the structure. Wire the two TODO sections.

**`pruneStaleKnowledge()`** — fill in the two TODOs:

1. **Write contradictions to audit board:**
```typescript
// After detecting contradiction:
const auditPath = path.join(process.cwd(), 'state/janitor/audit-board.md');
const entry = `\n## [${new Date().toISOString()}] CONTRADICTION\n` +
  `- Page A: ${contradiction.page_a}\n` +
  `- Page B: ${contradiction.page_b}\n` +
  `- Conflict: ${contradiction.conflict}\n` +
  `- Status: OPEN\n`;
fs.appendFileSync(auditPath, entry);
```

2. **Flag orphan pages for cold-tier archival:**
```typescript
// After detecting orphan:
const coldPath = path.join(process.cwd(), 'state/janitor/cold-queue.json');
const queue = fs.existsSync(coldPath) ? JSON.parse(fs.readFileSync(coldPath, 'utf-8')) : [];
queue.push({ page: orphan, flagged_at: new Date().toISOString() });
fs.writeFileSync(coldPath, JSON.stringify(queue, null, 2));
```

**`runFullAuditCycle()`** — fill in the three TODOs:

1. **Wiki-tiering pass**: read all files in `wiki/` older than `ninetyDaysAgo` (by git mtime via `git log --format=%ct -1 <file>`), move them to `wiki/archive/` directory, update `wiki/index.md` to mark as archived.

2. **Update audit board with cycle summary**: append a `## [timestamp] CYCLE SUMMARY` section to `state/janitor/audit-board.md` with counts: stale pruned, contradictions found, orphans flagged, pages archived.

3. **Compute health score delta**: read previous score from `state/janitor/health.json` (create if missing, default `{ score: 0, last_run: null }`). New score = 25 - (contradictions × 3) - (orphans × 1) - (stale_entries × 0.5). Write updated score back. Log delta.

**Tests to add** (`test/scythe.test.ts`):
- `pruneStaleKnowledge() writes contradiction to audit-board.md`
- `pruneStaleKnowledge() adds orphan to cold-queue.json`
- `runFullAuditCycle() writes cycle summary`
- `runFullAuditCycle() updates health.json with delta`

---

## Phase 6 — Fleet Routing (dispatcher.py)

### File: `brain/dispatcher.py`

Add `target_node` parsing so tasks can be routed to remote fleet nodes.

**Current state:** `target_node` field in task.json is ignored.

**Add these functions:**

```python
import socket
import subprocess

FLEET_REGISTRY = "state/fleet/registry.json"  # list of node records

def load_fleet_registry() -> list[dict]:
    """Returns list of {node_id, host, user, capabilities, ssh_key}."""
    if not os.path.exists(FLEET_REGISTRY):
        return []
    with open(FLEET_REGISTRY) as f:
        return json.load(f)

def is_local_node(target_node: str) -> bool:
    """Returns True if target_node matches current hostname."""
    return target_node in ("local", socket.gethostname(), "")

def dispatch_remote(task: dict, node: dict) -> dict:
    """
    SSH into fleet node, write task.json to its inbox, wait for result.
    Returns the handshake JSON from the remote clone.
    """
    task_json = json.dumps(task)
    ssh_cmd = [
        "ssh", "-i", node["ssh_key"],
        f"{node['user']}@{node['host']}",
        f"echo '{task_json}' > ~/agent4/brain/inbox/{task['task_id']}.json"
    ]
    subprocess.run(ssh_cmd, check=True, timeout=10)
    
    # Poll for result (max 10 minutes)
    result_path = f"{node['user']}@{node['host']}:~/agent4/brain/completed/{task['task_id']}.json"
    for _ in range(120):  # 120 × 5s = 10 min
        time.sleep(5)
        result = subprocess.run(
            ["scp", result_path, f"/tmp/remote-result-{task['task_id']}.json"],
            capture_output=True
        )
        if result.returncode == 0:
            with open(f"/tmp/remote-result-{task['task_id']}.json") as f:
                return json.load(f)
    raise TimeoutError(f"Remote node {node['node_id']} did not complete task within 10 minutes")
```

**Wire into `process_task()`:** Before spawning local clone, check `task.get("target_node", "")`:
```python
target = task.get("target_node", "")
if target and not is_local_node(target):
    registry = load_fleet_registry()
    node = next((n for n in registry if n["node_id"] == target), None)
    if node:
        handshake = dispatch_remote(task, node)
        return janitor_evaluate(handshake, 0)
    else:
        print(f"[DISPATCHER] WARNING: target_node '{target}' not in registry — running local")
```

**Tests to add** (`test/test_dispatcher.py`):
- `is_local_node("local")` → True
- `is_local_node("unknown-host")` → False
- `dispatch_remote()` called when target_node is non-local and in registry
- Fallback to local when target_node not in registry

---

## Phase 7 — Forge Core

### Files: `core/forge/metrics_db.ts`, `shadow_runner.ts`, `evaluator.ts`, `ratchet.ts`

Implement all four. Use `better-sqlite3` (add to package.json dependencies).

### `metrics_db.ts`

```typescript
import Database from 'better-sqlite3';

export class ForgeMetricsDb {
  private db: Database.Database;

  constructor(dbPath = 'state/memory/forge_metrics.db') {
    this.db = new Database(dbPath);
    this.init();
  }

  public init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_name TEXT, skill TEXT, directive TEXT,
        tokens_consumed INTEGER, duration_seconds REAL,
        janitor_notes TEXT, timestamp TEXT
      );
      CREATE TABLE IF NOT EXISTS ab_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_name TEXT, outcome TEXT, timestamp TEXT
      );
    `);
  }

  public insertMetric(row: MetricRow): void {
    this.db.prepare(`INSERT INTO metrics VALUES (null,?,?,?,?,?,?,?)`)
      .run(row.template_name, row.skill, row.directive,
           row.tokens_consumed, row.duration_seconds,
           row.janitor_notes, row.timestamp);
  }

  public getWinStreak(templateName: string): number {
    const rows = this.db.prepare(
      `SELECT outcome FROM ab_outcomes WHERE template_name=? ORDER BY id DESC LIMIT 10`
    ).all(templateName) as {outcome: string}[];
    let streak = 0;
    for (const row of rows) {
      if (row.outcome === 'WIN_B') streak++;
      else break;
    }
    return streak;
  }

  public recordOutcome(templateName: string, outcome: EvaluationOutcome): void {
    this.db.prepare(`INSERT INTO ab_outcomes VALUES (null,?,?,?)`)
      .run(templateName, outcome, new Date().toISOString());
  }
}
```

### `shadow_runner.ts`

Implement `runShadow()`:
- Deep clone the `MissionBrief`, override `templatePath` with `variantBTemplatePath`
- Call `this.cloneWorker.run(brief)` — full lifecycle (spawner → runner → teardown)
- Do NOT merge even on NOTE (shadow results never reach main branch)
- Write result to `forge/events.jsonl` with `type: "shadow_result"`
- Return `ShadowResult` with actual token count and duration

### `evaluator.ts`

Implement `evaluate(variantA, variantB)`:
- Build evaluation prompt comparing efficiency, janitor notes, token count
- Call Sonnet (not Haiku — judgment quality matters)
- Parse response for WIN_A | WIN_B | TIE
- Log to `forge/events.jsonl` with `type: "evaluation"`
- Return `EvaluationResult`

**Evaluation prompt template:**
```
You are the Forge Evaluator. Grade two clone runs on the same task.

Variant A: ${tokensA} tokens, ${durA}s, Janitor: ${notesA}
Variant B: ${tokensB} tokens, ${durB}s, Janitor: ${notesB}

Winner is: more correct (Janitor NOTE > SUGGEST), then fewer tokens, then faster.
Reply with exactly one line: WIN_A, WIN_B, or TIE. Then one sentence of reasoning.
```

### `ratchet.ts`

Implement `recordOutcome()` and `promote()`:

`recordOutcome()`:
- Call `this.metricsDb.recordOutcome(templateName, outcome)`
- If `this.metricsDb.getWinStreak(templateName) >= WIN_THRESHOLD`: call `this.promote(templateName)`
- Return `true` if promotion triggered

`promote()`:
- `git tag forge/promotion/<timestamp>` via `child_process.execSync`
- Copy `core/clones/templates/variant_b_${templateName}.md` → `core/clones/templates/${templateName}.md`
- Run a Janitor evaluation on a minimal test handshake (status: NOTE)
- If Janitor returns BLOCK: `git checkout <tag> -- <templatePath>` (auto-revert)
- Append promotion record to `wiki/log.md`

**Tests for all 4 Forge files** (`test/forge.test.ts`):
- `ForgeMetricsDb.init()` creates tables
- `insertMetric()` / `getWinStreak()` roundtrip
- `ForgeRatchet` promotes after 5 consecutive WIN_B
- `ForgeRatchet` auto-reverts on Janitor BLOCK after promotion
- `ForgeEvaluator.evaluate()` returns WIN_A | WIN_B | TIE (mock Anthropic client)

---

## Known Edge Cases (from Gemini review — address during implementation)

1. **flushState() token volume** — current trigger (5 DIRECT turns or FULL_PIPELINE) ignores message size. A single 3,000-word paste holds in memory for 4 more turns. MVP is fine; add a `TOKEN_FLUSH_THRESHOLD = 4000` check alongside the turn counter. If `currentTurnTokens > TOKEN_FLUSH_THRESHOLD`, flush immediately regardless of turn count.

2. **Leak scanner short-secret blind spot** — entropy filter `> 16 chars` silently ignores secrets shorter than 16 characters. For the vault implementation: all secrets stored must be ≥ 17 chars (enforce in `addSecret()` with a warning log if shorter). If a short secret must be stored, add it to a separate `exactMatchSecrets: string[]` array that bypasses the length filter in `scanForLeaks()`.

3. **MCP tool name drift** — plan assumes `add_memory`, `get_aaak_summary`, `search_vault`, `delete_memory`, `audit_vault`. If actual MemPalace server uses different names, the adapter silently returns fallbacks (by design). Add a `validateTools()` method to `connect()` that calls `client.listTools()` and logs any expected tools that are missing — this makes the mismatch obvious at startup rather than at first use.

## Execution Rules

1. **Branch**: stay on `opus-build`. Never commit to `main`.
2. **Language**: TypeScript for all `core/`. Python only for `brain/dispatcher.py`.
3. **No new dependencies** except `better-sqlite3` for Forge metrics.
4. **All new code must have tests**. Run full suite after each phase: `npx jest && python3 -m pytest test/`.
5. **Staged output protocol**: implement Phase 5 first. Stop and confirm all Phase 5 tests pass before Phase 6. Stop again before Phase 7.
6. **Do not refactor existing code** unless directly required for your change.
7. **Do not touch** `wiki/`, `raw/`, README — wiki is a separate repo concern.

## Verification Command

After each phase:
```bash
npx tsc --noEmit          # must exit 0
npx jest                  # all existing + new tests green
python3 -m pytest test/   # all Python tests green
```

## Expected Final State

| Phase | New Tests | Status |
|-------|-----------|--------|
| Phase 5: AES vault | +5 Jest | ✅ |
| Phase 5: MCP transport | +7 Jest | ✅ |
| Phase 6: WikiScythe | +4 Jest | ✅ |
| Phase 6: Fleet routing | +4 pytest | ✅ |
| Phase 7: Forge core | +5 Jest | ✅ |
| **Total new** | **+25 tests** | |
| **Grand total** | **82 tests** | |
