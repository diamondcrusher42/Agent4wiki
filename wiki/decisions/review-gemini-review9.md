# Review: Gemini Review 9 — Opus Build Brief Final Audit

> Source: raw/Gemini-review9-brief-final-audit.md | Reviewer: Gemini | Date: 2026-04-08
> Scope: raw/opus-build-brief.md (v3) — final pre-send review, all 14 findings applied to v4

14 findings: 4 critical, 4 ambiguities, 3 blind spots, 3 improvements. All applied.

---

## CRITICAL ISSUES

### 1 — TS↔Python Boundary Contradictory ✓ Fixed

**Issue:** Section 5 said "TS writes, Python reads. Never the reverse." But the actual flow requires `dispatcher.py` (Python) to invoke the TypeScript Janitor for handshake evaluation. The `???` at both language boundary crossings was never specified.

**Fix applied:** Added explicit integration contract to Section 5:
```
dispatcher.py spawns clone_worker.ts via:
  npx ts-node core/clones/clone_worker.ts --task <task-json-path>
clone_worker.ts handles full TS lifecycle (spawn → keychain → run → janitor → teardown),
outputs CloneResult JSON to stdout. dispatcher.py parses that JSON, calls bridge.py.
```

---

### 2 — KeychainManager Lifecycle Ambiguity ✓ Fixed

**Issue:** Two competing lifecycle patterns existed: `KeychainManager.executeCloneMission()` (V1, owns full lifecycle) and `CloneWorker.execute()` (V2, owns full lifecycle). Opus would be confused which was authoritative.

**Fix applied:** Added deprecation note to Section 8:
```
KeychainManager.executeCloneMission() is DEPRECATED (V1 lifecycle).
CloneWorker.execute() is V2. Remove executeCloneMission() in Phase 0.
Keychain provides primitives (provisionEnvironment/revokeEnvironment).
CloneWorker orchestrates them.
```

---

### 3 — runner.ts + KeychainManager Both Spawn Claude ✓ Fixed

**Issue:** `CloneRunner.launchClause()` spawned the claude process. `KeychainManager.launchClone()` also spawned it. Two competing spawn points — Opus would implement both or neither.

**Fix applied:** Added to Section 5:
```
CloneRunner.run() is the ONLY place that spawns a claude process.
KeychainManager.launchClone() is DEPRECATED (V1). Remove it.
Runner receives credentials via provisionEnvironment() writing .env.
```

---

### 4 — setup.sh Content Not Specified ✓ Fixed

**Issue:** Brief required `runner.ts` to execute `setup.sh` but never specified what goes in it or how it's generated.

**Fix applied:** Added to Section 5:
```
setup.sh written by spawner.ts during worktree creation. Contents:
  #!/bin/bash
  cd "$(dirname "$0")"
  [[ -f package.json ]] && npm install --silent
  [[ -f requirements.txt ]] && pip install -r requirements.txt --quiet
  echo "Setup complete."
Append task-specific setup commands from template if present.
```

---

## AMBIGUITIES

### 5 — Handshake JSON Parsing Race ✓ Fixed

**Issue:** Three candidates parsed JSON from stdout with different approaches. Greedy regex in manager.ts would match the FIRST JSON object (could be a debug log, not the handshake).

**Fix applied:** Standardized in Section 5:
```
Clone MUST output its JSON handshake as the FINAL line of stdout.
Parser: split stdout by \n, reverse-iterate to find last line starting
with {, JSON.parse that line. If no valid JSON → FAILED_REQUIRE_HUMAN.
```

---

### 6 — model Field Doesn't Reach Clone ✓ Fixed

**Issue:** Section 7 added a `model` field to task JSON but `claude --print --dangerously-skip-permissions` has no model flag in the specified launch command. How the model reaches the clone was undefined.

**Fix applied:** Added to Section 7:
```
Clone launch command in CloneRunner.run():
  claude --model ${task.model} --print --dangerously-skip-permissions -p "${prompt}"
Fallback if --model unsupported: set env["CLAUDE_MODEL"] = task.model.
Check via: claude --help | grep model
```

---

### 7 — Injection Variable Names Mismatch ✓ Fixed

**Issue:** TASK template used `{INJECT_SOUL_MD_HERE}`, `{INJECT_ALLOWED_PATH_HERE}`, `{INJECT_BRAIN_DELEGATED_TASK_HERE}`. `prompt_builder.ts` used different names. String replacements would silently fail.

**Fix applied:** Standardized 5 canonical injection variables in Section 5:
```
{INJECT_SOUL_HERE}              — wiki/Soul.md + state/user_agent/soul-private.md
{INJECT_ALLOWED_PATHS_HERE}     — filesystem scope for this clone
{INJECT_ALLOWED_ENDPOINTS_HERE} — network scope from scopes.yaml
{INJECT_WIKI_CONTEXT_HERE}      — relevant wiki pages (max ~500 tokens)
{INJECT_TASK_HERE}              — the mission objective
Templates MUST use these exact names.
```

---

### 8 — Fleet Routing Scope Undefined ✓ Fixed

**Issue:** Section 1 and 4 mentioned fleet routing and multi-machine execution but the dispatcher only runs locally. `state/fleet/` exists but no code touches it. Task JSON lacks `target_node` / `required_platform` fields.

**Fix applied:** Added to Section 5:
```
Fleet routing is Phase 5+ (post-MVP). All tasks execute locally for now.
target_node and required_platform fields are RESERVED but ignored.
Do not implement fleet routing in this build.
```

---

## BLIND SPOTS

### 9 — Dispatcher Has No Supervisor ✓ Fixed

**Issue:** If `dispatcher.py` crashes, nobody restarts it. No systemd unit for the dispatcher process — pipeline stops silently.

**Fix applied:** Added systemd unit spec to Section 8 (What runs today):
```
Three long-running processes required:
1. claude --effort $EFFORT --permission-mode auto --channels plugin:telegram@claude-plugins-official
2. python brain/dispatcher.py watch
3. (Future) Fleet node — not yet implemented
Dispatcher systemd unit added to Section 8 bootstrap instructions.
```

---

### 10 — Telegram Watchdog Command Buried ✓ Fixed

**Issue:** The exact watchdog launch command was in the Bridge segment description, not in the bootstrap docs. Opus might not realize it needs to run as a persistent process alongside the dispatcher.

**Fix applied:** Extracted to Section 8 as explicit "Three Runtime Processes" block with exact commands.

---

### 11 — Wiki Page Lookup Fails Silently ✓ Fixed

**Issue:** `loadWikiContext()` looked for `wiki/${pageName}.md` but wiki pages are in subdirectories (`wiki/segments/`, `wiki/concepts/`, etc.). A task specifying `wikiContext: ["segment-brain"]` would get no context injected — silently.

**Fix applied:** Added search order to Section 5:
```
loadWikiContext() must search:
  wiki/{name}.md → wiki/segments/{name}.md → wiki/concepts/{name}.md
  → wiki/tools/{name}.md → wiki/entities/{name}.md → wiki/decisions/{name}.md
First match wins. Missing = empty string (warn, don't crash).
```

---

## IMPROVEMENTS

### 12 — Definition of Done Security Tests ✓ Fixed

**Suggestion:** DoD was missing negative security assertions — verifying that credentials were actually revoked and no keys leaked into the worktree.

**Fix applied:** Added Step 5 to Section 11 DoD:
```
5. Verify security:
   ✓ ls state/worktrees/task-{id}/.env  → must NOT exist (revoked)
   ✓ grep -r "sk-ant" state/worktrees/  → must return nothing (no leaked keys)
```

---

### 13 — Scope Guard Added ✓ Fixed

**Suggestion:** Add a "Do NOT" section to prevent Opus from overbuilding into out-of-scope areas.

**Fix applied:** New Section 12 (Scope Guard) added with 7 explicit prohibitions:
- Fleet routing (Phase 5+)
- Forge implementation (stubs intentional)
- New npm dependencies without justification
- Modifying wiki/ pages
- Implementing MemPalace integration (mark TODO)
- Writing .env outside state/worktrees/
- Using console.log as primary output (use Bridge)

---

### 14 — Repomix Reference Updated ✓ Fixed

**Suggestion:** Brief pointed to 634KB full pack including 4000+ lines of review history. A focused pack would give Opus cleaner signal.

**Fix applied:** Section 10 updated to reference `raw/repomix-focused-context.txt` (7,976 lines — excludes raw/ review documents). Full pack still available as fallback.

---

## Net Impact on the Brief

v3 → v4: 14 findings applied across Sections 5, 7, 8, 10, 11. New Section 12 (Scope Guard) added. Section numbering updated (old 12 → new 13).

The brief is now ready to send to Opus.

*See also: [[plan-build-v1]], [[review-gemini-review8]], [[decision-model-governance]]*
