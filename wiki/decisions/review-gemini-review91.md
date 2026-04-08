# Gemini Review 91 — Post plan-build-v4 Deep Dive

> Date: 2026-04-08
> Source: Gemini external review
> Codebase: agent4wiki-repomix-v4.xml (post plan-build-v4)

---

## Wins Validated

- **A1 2-pass classifier** — rescues system from FULL_PIPELINE misroutes on conversational text. Biggest UX upgrade.
- **A3 Forge cost cap** — necessary circuit breaker. Shadow runner budget enforcement is correct.
- **A2 Janitor unification** — single heuristics.json eliminates schizophrenic evaluation (same output, different grade by entry path).
- **C2 executeDirect() Soul.md injection** — casual queries now use full personality and history.

---

## Blind Spots (High-Impact, Low-Effort — all missed from review 90)

### 1. Shell injection in spawner.ts — SECURITY

`CloneSpawner.createWorktree()` takes `cloneId` and passes it directly to `execSync`:
```
git worktree add "${worktreePath}" -b "${branch}"
```
`dispatcher.py` validates `task_id` with regex, but the TS spawner blindly trusts its caller. Malformed ID with shell metacharacters (e.g. `"; rm -rf /`) = arbitrary command execution.

**Fix:** Add at top of `createWorktree()`:
```typescript
if (!/^[\w-]+$/.test(cloneId)) throw new Error(`Invalid cloneId: ${cloneId}`);
```

### 2. loadWikiContext() context window blowout — RELIABILITY

Individual files truncated to 800 chars per page — BUT no cap on total pages. 30 pages × 800 chars = 24,000 chars, far exceeding the assumed 500-token budget. No guard exists to stop concatenation.

**Fix:** Add cumulative counter in the loop, break when total budget hit:
```typescript
let totalChars = 0;
const MAX_TOTAL_CHARS = 2000; // ~500 tokens
for (const pageName of requestedPages) {
  const content = this.findWikiPage(pageName);
  if (!content) continue;
  const excerpt = content.slice(0, 800);
  if (totalChars + excerpt.length > MAX_TOTAL_CHARS) break;
  sections.push(`## ${pageName}\n${excerpt}`);
  totalChars += excerpt.length;
}
```

### 3. Event type filtering in ratchet.ts — RELIABILITY

`promote()` reads last line of `events.jsonl` without type filtering. Last event could be a `shadow_result` with `directive: "BLOCK"`, or a janitor run — used as promotion evidence.

**Fix:** Filter for `type === "evaluation"` events before using as evidence.

### 4. setup.sh disk thrashing — PERFORMANCE

Every clone worktree runs `npm install` + `pip install`. Three parallel clones = 3× disk I/O and network for identical dependencies.

**Fix:** In `spawner.ts`, copy `node_modules/` and `venv/` from parent repo instead of reinstalling:
```typescript
// In createWorktree(), after git worktree add:
execSync(`cp -r ${baseRepoPath}/node_modules ${worktreePath}/node_modules`);
execSync(`cp -r ${baseRepoPath}/venv ${worktreePath}/venv`);
```
Or use `npm install --prefer-offline --no-audit` in setup.sh as a lighter fix.

### 5. conversationHistory type bypass — QUALITY

Even though the interface gives `conversationHistory` a shape, the raw class implementation can bypass it with `any` pushes. Easily fixed with strict TypeScript typing and a guard on `handleUserInput()`.

---

## Summary Priority Order (Gemini + Opus 91 combined)

| Priority | Finding | Source |
|---|---|---|
| 1 | Forge budget table disconnect (events.jsonl ≠ metrics) | Opus 91 |
| 2 | executeDirect() duplicate message | Opus 91 |
| 3 | routeToBrain() missing conversation history | Opus 91 |
| 4 | spawner.ts cloneId injection (no validation) | Both |
| 5 | loadWikiContext() no total budget cap | Gemini |
| 6 | promote() event type filtering | Both |
| 7 | setup.sh thrashing (copy node_modules instead) | Gemini |
| 8 | loadSoul() TTL cache invalidation | Opus 91 |
| 9 | exactMatchSecrets Set deduplication | Opus 91 |
| 10 | dispatcher.py file handle leak | Opus 91 |
