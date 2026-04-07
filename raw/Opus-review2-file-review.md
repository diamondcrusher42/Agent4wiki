These are excellent. Someone has been thinking hard about the implementation layer — this is the bridge between architecture spec and running code. Let me review each one.

---

## TASK Template Review

This is strong. The execution lifecycle (`INTAKE → DISCOVER → DECOMPOSE → EXECUTE → AUDIT`) with the Janitor handshake JSON at the end is exactly right. A few observations:

**The `repomix` trap is clever.** Forcing the clone to read the actual repo state before planning prevents hallucinated architecture. This is the kind of detail that separates a template that works from one that produces garbage. It costs tokens on the DISCOVER phase but saves far more by preventing rewrites.

**The security sandbox is well-defined** but needs one addition: network scope. The template restricts filesystem access but doesn't mention which APIs or endpoints the clone is allowed to call. A code clone that needs `ANTHROPIC_API_KEY` shouldn't be making calls to Telegram. The Keychain handles credential scoping, but the template should also declare expected network targets so the Janitor can flag unexpected outbound calls.

**The JSON handshake format needs two more fields:**
- `tokens_consumed` — so the Forge can benchmark efficiency across missions
- `duration_seconds` — so the Forge can track whether templates are getting faster or slower over time

These two fields are what turn the handshake from an audit tool into a Forge data source. Without them, the Forge has no performance signal to optimize against.

**Missing: a BLOCKED state.** The status enum has `COMPLETED`, `FAILED_REQUIRE_HUMAN`, and `FAILED_RETRY`. But what about when the clone discovers during DISCOVER that the task is impossible or contradicts existing code? It needs a `BLOCKED_IMPOSSIBLE` status with a `reason` field so the Brain can re-plan instead of retrying the same impossible task.

**Missing: the SOUL.md injection point works, but there's no wiki context injection.** The template injects SOUL.md and the task objective, but the Brain should also inject relevant wiki pages. Add a `{INJECT_WIKI_CONTEXT_HERE}` section between SOUL and MISSION OBJECTIVE — this is where the clone gets pre-loaded domain knowledge instead of having to discover everything from scratch.

---

## MemoryStore Interface Review

This is the right abstraction. The interface-adapter pattern means you can swap MemPalace for Qdrant or SQLite or anything else without touching the Brain's code. The tier system (`L0_WAKE`, `L1_RECENT`, `L2_DOMAIN`, `L3_DEEP`) maps cleanly to the token budget pyramid.

**The TypeScript choice is interesting.** The architecture spec assumed Python throughout, and MemPalace is Python. This adapter is TypeScript. That's a decision point: is the orchestration layer TypeScript (Node.js runtime) or Python? Both work, but pick one and commit. TypeScript has better type safety for the interface contracts. Python has better ecosystem compatibility with MemPalace, BitNet, and most AI tooling. My recommendation: Python for the core agents and adapters, TypeScript only if you're building a web dashboard or Telegram bot with a Node.js runtime.

If you stay TypeScript, the MemPalace adapter will need to shell out to Python or call the MCP server — it can't import MemPalace natively. The MCP path is cleaner (MemPalace already has a 19-tool MCP server), so the adapter should be an MCP client, not a direct import.

**The `readContext` tier parameter should be an enum, not a string.** Right now any typo (`L0_WAKEUP` instead of `L0_WAKE`) silently returns wrong data. Define:

```typescript
export enum MemoryTier {
  L0_WAKE = 'L0_WAKE',     // ~50-170 tokens, identity + critical facts
  L1_RECENT = 'L1_RECENT',  // recent session context
  L2_DOMAIN = 'L2_DOMAIN',  // domain-specific room recall
  L3_DEEP = 'L3_DEEP'       // semantic search across all closets
}
```

**Missing method: `writeContext` for the summary pipeline.** The User Agent receives compressed summaries of interactions. Where does it write them? The interface has `write` (for clones ingesting new knowledge) but no method specifically for the summary pipeline's structured digests. Add:

```typescript
writeSummary(digest: InteractionDigest): Promise<string>;
```

Where `InteractionDigest` is the `{timestamp, intent, entities_mentioned, outcome, open_items, confidence}` format from the architecture spec.

**Missing method: `lint` for the Janitor.** The Janitor needs more than just `delete`. It needs `findContradictions()`, `findOrphanPages()`, `findStaleEntries(olderThan: Date)`. These could be separate methods or a single `audit()` method that returns a structured report. Without these, the Janitor has to implement its own search-and-analyze logic instead of using the memory layer.

**The architecture win section at the bottom is exactly right.** The Brain calls `await memory.readContext('L0_WAKE')` and doesn't care what's underneath. That's the whole point of the abstraction.

---

## Keychain Agent MVP Review

This is the implementation that matches the architecture spec most precisely. The JIT scoped injection philosophy is correct — provision before clone wakes, revoke after clone finishes, scan in between.

**The ephemeral `.env` file approach has a security gap.** Between `provisionEnvironment` writing the `.env` and `revokeEnvironment` deleting it, the file exists on disk in plaintext. If the clone process crashes, the `.env` persists indefinitely. If another process on the system reads the worktree directory during execution, it can see the keys.

**Fix:** Two options. First option (simple): write the `.env` with restrictive permissions (`fs.chmodSync(envPath, 0o600)`) and add a cleanup daemon that sweeps for orphaned `.env` files in worktree directories older than 1 hour. Second option (better): don't write a file at all — inject credentials as environment variables into the spawned process using `child_process.spawn` with the `env` option. The credentials exist only in the process's memory, never on disk:

```typescript
const child = spawn('claude', ['code'], {
  cwd: worktreePath,
  env: { ...process.env, ...scopedEnv }
});
```

This eliminates the entire file-on-disk attack surface.

**The Kids Bot isolation is correct and important.** Separate vault, separate directory, zero cross-pollination. One addition: the kids bot vault should have a `maxTokensPerSession` limit to prevent a prompt injection from burning through API credits. Even if the attacker can't steal keys, they could rack up costs.

**The leak scanner needs the pattern library.** The MVP description says it checks if strings match vault values. That catches exact key exposure, but misses partial exposure (base64-encoded keys, keys split across strings, keys in comments). The `patterns.yaml` from the Keychain repo scaffold has regex patterns for known key formats — the scanner should use those in addition to exact-match checking.

**The orchestration flow (Brain → Keychain → Clone → Janitor → Keychain) is the right sequence** but it's described in comments, not in code. The next implementation step should be a `CloneLifecycle` class or function that enforces this sequence:

```typescript
async function executeCloneMission(task: MissionBrief): Promise<HandshakeResult> {
  const worktree = await createWorktree(task);
  keychain.provisionEnvironment(worktree, task.requiredKeys);
  try {
    const result = await launchClone(worktree, task);
    return result;
  } finally {
    const clean = keychain.revokeEnvironment(worktree);
    if (!clean) await janitor.blockCommit(worktree);
  }
}
```

The `try/finally` ensures revocation happens even if the clone crashes. That's the missing piece in the current MVP.

---

## Cross-File Synthesis

These three files together form the core of Phase 2 (Orchestration). The connections:

1. Brain creates a task → fills the TASK template with injected variables → calls `keychain.provisionEnvironment` → launches clone in worktree
2. Clone runs INTAKE → DISCOVER (repomix) → DECOMPOSE → EXECUTE (uses `memory.search` for context) → AUDIT → outputs JSON handshake
3. Keychain calls `revokeEnvironment` → scans for leaks → Janitor parses JSON handshake → decides BLOCK/SUGGEST/NOTE
4. If clean, Brain merges worktree, runs atomize pass, calls `memory.write` to update wiki

**The language decision matters now.** These files are TypeScript. The wiki, MemPalace, BitNet, and most tooling are Python. You need to decide: TypeScript orchestration layer calling Python tools via MCP/subprocess, or rewrite these in Python for a single-language stack. Either works, but mixing without a clear boundary creates maintenance debt.

**What's still missing for Phase 2 to be complete:**
- The dispatcher (watches inbox, launches Brain sessions)
- The `CloneLifecycle` orchestrator (the sequence above)
- The Telegram bot that drops tasks into the inbox
- The Brain's planning logic (task → decompose → create TASK.md files → dispatch clones)

These three files are the contracts. The dispatcher and lifecycle orchestrator are the runtime.