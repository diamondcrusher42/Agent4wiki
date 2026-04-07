# Review — Opus Review 2: Implementation File Review

> Source: `raw/Opus-review2-file-review.md` | Created: 2026-04-08
> Reviewer: Claude Opus
> Scope: Code review of 3 Phase deliverables — TASK template, MemoryStore interface, Keychain Manager

---

## Overall Verdict

"Someone has been thinking hard about the implementation layer — this is the bridge between architecture spec and running code." All three files are structurally correct. The review applies specific, concrete fixes — all applied in V2 of each file.

---

## TASK Template — Fixes Applied (V2)

### ✅ Confirmed Correct
- INTAKE→DISCOVER→DECOMPOSE→EXECUTE→AUDIT lifecycle is exactly right
- Repomix trap in DISCOVER prevents hallucinated architecture ("the kind of detail that separates a template that works from one that produces garbage")
- Security sandbox well-defined

### 🔧 Fixed: Network Scope Declaration
Template now includes `## 2b. NETWORK SCOPE` section with `{INJECT_ALLOWED_ENDPOINTS_HERE}`. Clone can only call declared endpoints — Janitor flags unexpected outbound calls. A code clone with `ANTHROPIC_API_KEY` shouldn't make Telegram calls.

### 🔧 Fixed: JSON Handshake — Two New Fields
Added `tokens_consumed` and `duration_seconds` to the handshake JSON. Without these, the Forge has no performance signal to optimize templates against. These fields turn the handshake from an audit tool into a Forge data source.

### 🔧 Fixed: BLOCKED_IMPOSSIBLE Status
Added 4th status: `BLOCKED_IMPOSSIBLE` with required `reason` field. When the clone discovers during DISCOVER that the task is impossible or contradicts existing code, it exits early instead of retrying an impossible task. Brain re-plans instead of the Janitor issuing repeated BLOCKs.

### 🔧 Fixed: Wiki Context Injection Point
Added `## 3. WIKI CONTEXT` section with `{INJECT_WIKI_CONTEXT_HERE}` between SOUL and MISSION OBJECTIVE. Brain pre-loads relevant wiki pages into the brief. Clone reads compiled domain knowledge instead of discovering everything from scratch via repomix alone.

---

## MemoryStore Interface — Fixes Applied (V2)

### ✅ Confirmed Correct
- Interface-adapter pattern is the right abstraction
- L0/L1/L2/L3 tier system maps cleanly to token budget pyramid
- Architecture win: Brain calls `await memory.readContext(MemoryTier.L0_WAKE)` and doesn't care what's underneath

### 🔧 Fixed: MemoryTier Enum (not string)
`readContext` now takes `MemoryTier` enum instead of raw string. Typo `L0_WAKEUP` instead of `L0_WAKE` previously silently returned wrong data. Enum prevents all such failures at compile time.

### 🔧 Fixed: writeSummary() Method
Added `writeSummary(digest: InteractionDigest): Promise<string>`. User Agent has a specific write path for structured digests. The `InteractionDigest` type enforces the `{timestamp, intent, entities_mentioned, outcome, open_items, confidence}` schema from the architecture spec.

### 🔧 Fixed: audit() Method for Janitor
Added `audit(olderThan?: Date): Promise<AuditReport>`. Janitor now has dedicated memory operations: `findContradictions`, `findOrphanPages`, `findStaleEntries` — all returned as structured `AuditReport`. Without this, the Janitor had to implement its own search-and-analyze logic instead of using the memory layer.

### ⚠️ Language Decision Required

> **This is the most important decision before Phase 3 starts.**

The deliverables are TypeScript. MemPalace, BitNet, and most AI tooling are Python. Mixed-language stacks create maintenance debt.

**Opus recommendation: Python for core agents and adapters.**

| Option | Pros | Cons |
|--------|------|------|
| Full Python | One language, native MemPalace + BitNet import | No TypeScript type safety for interfaces |
| Full TypeScript | Type-safe interfaces, good for web/Node | Must access MemPalace via MCP (can't import natively) |
| Hybrid (Python core + TS dashboard) | Best of both | Clear boundary required — TS only for web/Telegram bot runtime |

**If staying TypeScript:** MemPalace adapter must be an MCP client (calling MemPalace's 19-tool MCP server via JSON-RPC), not a direct import. This is actually cleaner — it enforces the interface abstraction perfectly.

---

## Keychain Manager — Fixes Applied (V2)

### ✅ Confirmed Correct
- JIT Scoped Injection philosophy matches architecture spec precisely
- Kids Bot isolation: separate vault, separate directory, zero cross-pollination

### 🔧 Fixed: Ephemeral .env → Process Memory Injection
The `.env` file approach had a security gap: file exists on disk in plaintext between provision and revoke. If clone crashes, `.env` persists indefinitely.

**Fix:** Credentials injected as env vars into spawned process — never written to disk:
```typescript
const child = spawn('claude', ['code'], {
  cwd: worktreePath,
  env: { ...process.env, ...scopedEnv }
});
```
Eliminates the file-on-disk attack surface entirely.

### 🔧 Fixed: try/finally CloneLifecycle
Added `executeCloneMission()` with `try/finally` — revocation runs even if clone crashes. The missing piece in the original MVP.

### 🔧 Fixed: Kids Bot maxTokensPerSession
Added to vault config note. Even if attacker can't steal keys via prompt injection, they could rack up API costs. Session token limit prevents cost-based attacks.

### 🔧 Fixed: Leak Scanner Pattern Library
Scanner now uses both exact-match AND `patterns.yaml` regex patterns. Catches: direct hardcoding, base64-encoded keys, keys split across strings, keys in comments. Exact-match alone misses partial exposure.

---

## Cross-File Synthesis (Full Phase 2 Flow)

```
Brain creates task → fills TASK.md (soul + wiki context + objective + network scope)
  ↓
keychain.executeCloneMission(task)
  → buildScopedEnv(requiredKeys) — credentials in memory only
  → launchClone(worktree, task, scopedEnv) — spawn with env
  → try { clone runs INTAKE→DISCOVER→DECOMPOSE→EXECUTE→AUDIT }
  → finally { scanForLeaks() — always runs, even on crash }
  ↓
Clone outputs JSON handshake (status/files/tests/tokens/duration/notes)
  ↓
Janitor parses handshake → BLOCK / SUGGEST / NOTE
  ↓
If clean: Brain merges worktree → atomize pass → memory.write() → wiki updated
```

### What's Still Missing for Phase 2 Completion

| Item | Status |
|------|--------|
| MemoryStore interface + adapter | ✅ Done (V2) |
| Keychain Manager + CloneLifecycle | ✅ Done (V2) |
| TASK template | ✅ Done (V2) |
| Dispatcher (`brain/dispatcher.py`) | ⬜ Pending |
| Telegram bot inbox (drops tasks for dispatcher) | ⬜ Pending |
| Brain planning logic (task → decompose → dispatch) | ⬜ Pending |

---

*See also: [[plan-implementation-v4]], [[tool-keychain-agent]], [[tool-mempalace]], [[concept-mission-briefs]], [[concept-dispatcher]]*
