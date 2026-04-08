# Gemini Review — Post-Plan-Build-V7 (Review 94)

> Source: Gemini, 2026-04-08
> Branch: `opus-build` after v7 (174 tests)
> Pair review: [[review-opus-review94]]

## 🟢 The Good

- **buildCloneEnv allowlist**: Moving from blacklist to allowlist eliminates host env bleed. Correct maturation step.
- **git status --porcelain**: Closes the untracked-file secret loophole in manager.ts.
- **AES-256-GCM Vault**: scrypt KDF + separate salt file = production-grade. No finding here.
- **Archive Gate**: archive-queue.md [x] checkbox before scythe.ts deletes = prevents silent self-lobotomy.

## 🔴 The Bad — Architectural Flaws

### 1. "Two Brains" Problem
`dispatcher.py` (Python) and `clone_worker.ts` (TypeScript) both orchestrate worktrees, inject environments, and evaluate Janitor logic (`janitor_evaluate` vs `auditor.ts`). Will inevitably drift. Example already present: `auditor.ts` checks for shared config edits; Python dispatcher does not.

**Fix:** Have `dispatcher.py` call `npx ts-node core/janitor/cli.ts <handshake.json>` so `auditor.ts` is the single source of truth.

### 2. False Positives in Regex Parsing
`dispatcher.py` `extract_handshake` falls back to regex `\{[^{}]*"status"[^{}]*\}`. If a clone writes a code block discussing the JSON schema in its output, the regex will parse it as the actual handshake status.

### 3. Synchronous Watch Loop
`watch()` states `MAX_CONCURRENT = 3` but implementation calls `process_task_file(tasks[0])` sequentially. If one clone takes 30 minutes to time out, the entire queue is blocked.

### 4. Blind Teardown
`teardown.ts` force-deletes branches (`git branch -D`) if deletion fails. If the worktree filesystem is in a weird state, this can leave git index locks hanging and break subsequent clone spawns.

## 👹 The Ugly

- **`--dangerously-skip-permissions`**: Enabled in both `runner.ts` and `dispatcher.py`. Git worktrees don't provide process or filesystem isolation. A rogue clone can `cd ../../../` to escape.
- **String-interpolated shell**: `runner.ts` uses `execAsync('bash "${setupScript}"')`. Should use `execFile` or array-based `spawn` to avoid shell escaping risks.
- **State race conditions**: `agent.ts` manages state async but saves sync. Two rapid FULL_PIPELINE triggers → `flushState()` race on `state.json` writes.

## 🔍 Unseen Problems

- **Disk/inode exhaustion**: `npm install` + `pip install` on every clone spawn creates massive `node_modules` per task. If watchdog crashes, host machine runs out of disk/inodes in days.
- **Context truncation mangling**: `loadWikiContext` slices at 800 chars: `content.slice(0, 800)`. Can slice mid-JSON block, mid-code-fence, mid-table → LLM sees broken syntax.
- **Missing teardown quarantine**: When clone BLOCKs, `teardown.ts` removes the entire worktree. All forensic evidence of why it failed is lost.

## 🍎 Low-Hanging Fruit

1. **Consolidate Janitor**: `dispatcher.py` → `npx ts-node core/janitor/cli.ts <handshake.json>`. Single source of truth.
2. **Quarantine Mode**: BLOCK → move worktree to `state/worktrees/quarantine/` instead of delete. Compress for storage.
3. **Fix compressHistory**: It's just `.slice(-5)`. Rename to `truncateHistory` or actually wire to Haiku. Misleading name causes developer confusion.
4. **SENSITIVE_ENV_KEYS in Python**: Still a blacklist — must mirror the TS allowlist approach.
5. **events.jsonl scrubbing**: Janitor logs capture everything LLM outputs. PII/proprietary code is permanently logged. Need data-scrubbing middleware before writing.

## Summary

V7 is significantly safer than V6 (credential leak fixes are solid). System is limited by:
1. Lack of true containerized sandboxing
2. Duplicated TS/Python routing logic

**Verdict:** Ready for controlled testing. Not production-ready with internet access until Docker/sandbox isolation is implemented.

## Priority Actions for V8

| Priority | Issue | File |
|----------|-------|------|
| 🔴 Critical | Unify Janitor decision tree (Two Brains) | `dispatcher.py` → calls `auditor.ts` |
| 🔴 Critical | Fix synchronous watch loop (queue blocking) | `dispatcher.py` `watch()` |
| 🟡 High | String-interpolated shell in runner.ts | `core/clones/lifecycle/runner.ts` |
| 🟡 High | Quarantine mode for BLOCK worktrees | `core/clones/lifecycle/teardown.ts` |
| 🟡 High | Context truncation at line boundary | `core/brain/prompt_builder.ts` |
| 🟢 Low | Fix compressHistory → truncateHistory | `core/user_agent/agent.ts` |
