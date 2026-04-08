# Opus Build Brief — Review

## Overall Assessment

This is a well-structured build brief. The progression from "why" → "what" → "how" → "build order" → "definition of done" → "output protocol" is the right sequence for handing to an AI builder. The staged generation protocol (Section 12) is smart — it prevents the half-written-file problem that kills most long builds. The repomix context at 634KB / 14K lines gives Opus the actual codebase state.

The brief has evolved significantly from the original architecture. It now has 7 segments (Bridge added), working bridge.py and classifier.ts, a concrete build plan with 8 compile errors cataloged, and test commands for every phase. This is buildable.

Below: everything that needs fixing, clarifying, or adding before you hand this to Opus.

---

## CRITICAL ISSUES (fix before sending)

### 1. The dispatcher language boundary is contradictory

Section 5 says: "TS writes, Python reads. Never the reverse."

But the actual flow requires the reverse:
- `brain/dispatcher.py` (Python) picks up a task, runs the clone, gets the handshake
- The handshake needs to reach the Janitor (`core/janitor/auditor.ts` — TypeScript)
- After the Janitor decides, the result needs to reach `brain/bridge.py` (Python)

The flow is actually: **TS writes task → Python dispatcher reads → Python calls clone → ??? → TS Janitor evaluates → ??? → Python Bridge sends**

The ??? is where the language boundary breaks. The brief doesn't specify HOW the Python dispatcher calls the TypeScript Janitor. Options:
- **Option A:** Port the Janitor's `evaluateMission()` to Python inside dispatcher.py (simplest, but duplicates logic)
- **Option B:** The dispatcher shells out to a TS script: `npx ts-node -e "import { Janitor }..."` (works but slow — 2-3s Node startup per task)
- **Option C:** The Janitor evaluation runs inside `clone_worker.ts` (which is already TypeScript), and the Python dispatcher calls the whole TS lifecycle as a single subprocess

Looking at `clone_worker.ts`, it already imports and calls the Janitor. So the actual intended flow seems to be:

```
Python dispatcher.py → calls TS clone_worker via subprocess → 
  clone_worker handles: spawn → run → janitor evaluate → teardown → 
  returns result to Python → Python calls bridge.py
```

**But this is never stated explicitly.** The brief should add a clear section: "How the Python dispatcher invokes the TypeScript lifecycle." Otherwise Opus will implement one path and you'll get a runtime error at the language boundary.

**Recommendation:** Add to Section 5:
```
Integration contract: dispatcher.py spawns clone_worker.ts via:
  npx ts-node core/clones/clone_worker.ts --task <task-json-path>
clone_worker.ts reads the task JSON, runs the full TS lifecycle 
(spawn → keychain → run → janitor → teardown), outputs a 
CloneResult JSON to stdout. dispatcher.py parses this JSON and 
calls bridge.py to deliver the result.
```

### 2. `clone_worker.ts` has a Keychain API mismatch

In the repomix, `clone_worker.ts` line ~78 calls:
```typescript
await this.keychain.provisionEnvironment(handle.path, decision.requiredKeys);
```
and
```typescript
await this.keychain.revokeEnvironment(handle.path);
```

But `KeychainManager` also has `executeCloneMission()` which wraps the ENTIRE lifecycle including provision/revoke in its own try/finally.

So there are **two competing lifecycle patterns**:
- `KeychainManager.executeCloneMission()` — owns the full lifecycle including credential management
- `CloneWorker.execute()` — also owns the full lifecycle, calls provision/revoke separately

Opus will be confused about which one is authoritative. The brief Section 8 lists `provisionEnvironment()` and `revokeEnvironment()` as missing methods that need to be added (from the build plan), so the intent seems to be that `CloneWorker` owns the lifecycle and calls Keychain methods. But `executeCloneMission()` still exists in manager.ts.

**Recommendation:** Add to Section 8 or a note in Section 5:
```
KeychainManager.executeCloneMission() is DEPRECATED — it was the V1 
lifecycle. CloneWorker.execute() is the V2 lifecycle. Remove 
executeCloneMission() in Phase 0. The Keychain provides provisionEnvironment() 
and revokeEnvironment() as primitives; the CloneWorker orchestrates them.
```

### 3. The `runner.ts` and `clone_worker.ts` duplicate the clone launch logic

`CloneRunner.launchClause()` spawns the claude process with a prompt.
`KeychainManager.launchClone()` ALSO spawns the claude process with scoped env.

These need to be unified. The runner should handle the process spawning; the Keychain should only handle credential provisioning/revocation. Currently Opus will see two places that spawn the claude process and not know which to implement.

**Recommendation:** Add a note:
```
CloneRunner.run() is the ONLY place that spawns a claude process. 
KeychainManager.launchClone() is DEPRECATED (V1 pattern). Remove it.
The runner receives credentials via provisionEnvironment() writing .env, 
or via process.env injection from CloneWorker.
```

### 4. Missing: how `setup.sh` gets created

The brief says `runner.ts must execute setup.sh before the LLM mission`. The spawner creates worktrees. But nowhere is it specified what `setup.sh` contains or how it's generated. The build plan (plan-build-v1.md) mentions writing it in the spawner, but the brief doesn't say what goes in it.

**Recommendation:** Add:
```
setup.sh is written by spawner.ts during worktree creation. Contents:
  #!/bin/bash
  cd "$(dirname "$0")"
  [[ -f package.json ]] && npm install --silent
  [[ -f requirements.txt ]] && pip install -r requirements.txt --quiet
  echo "Setup complete."
If the task template specifies additional setup commands, append them.
```

---

## AMBIGUITIES (decisions needed)

### 5. Who parses the handshake JSON from clone stdout?

Three candidates all parse JSON from stdout:
- `KeychainManager.launchClone()` — regex: `/\{[\s\S]*"status"[\s\S]*\}/`
- `CloneRunner.launchClause()` — "TODO: parse last JSON block from stdout"
- `brain/dispatcher.py` — "extracts handshake from clone stdout"

The regex in manager.ts is greedy and will match the FIRST JSON object in stdout, which might be a repomix log or a debug output, not the handshake. The correct pattern is to find the LAST JSON block, or to use a delimiter (e.g., clone prints `---HANDSHAKE---` before the JSON).

**Recommendation:** Standardize: the clone prints the handshake as the LAST line of stdout. The parser reads stdout, splits by newlines, and parses the last line that starts with `{`. Add this to Section 4 (Clones):
```
The clone MUST output its JSON handshake as the final line of stdout.
Parser: split stdout by \n, reverse-iterate to find last line starting 
with {, JSON.parse that line. If no valid JSON found → FAILED_REQUIRE_HUMAN.
```

### 6. The `model` field in task JSON

Section 7 says add a `model` field defaulting to `claude-sonnet-4-6`. But the clone launch command uses `claude --print --dangerously-skip-permissions` which doesn't have a model flag — it uses whatever model is configured for the Claude Code session.

How does the task's `model` field actually get passed to the clone? Is it via `claude --model claude-sonnet-4-6`? Is it via an environment variable? The `claude` CLI's model selection mechanism needs to be specified.

**Recommendation:** Clarify in Section 7 or Section 4:
```
Clone launch command: claude --model ${task.model} --print 
  --dangerously-skip-permissions -p "${prompt}"
If --model is not supported by the claude CLI version, set 
CLAUDE_MODEL=${task.model} as an environment variable.
```

### 7. Where does the TASK template injection variable naming live?

The original TASK template uses `{INJECT_SOUL_MD_HERE}`, `{INJECT_ALLOWED_PATH_HERE}`, `{INJECT_BRAIN_DELEGATED_TASK_HERE}`.

The `prompt_builder.ts` uses `{INJECT_SOUL_HERE}`, `{INJECT_ALLOWED_PATHS_HERE}`, `{INJECT_ALLOWED_ENDPOINTS_HERE}`, `{INJECT_WIKI_CONTEXT_HERE}`, `{INJECT_TASK_HERE}`.

These don't match. The template file has one set of variable names, the builder replaces a different set. If Opus builds from the brief, the string replacements will silently produce a template with unreplaced variables.

**Recommendation:** Pick one naming convention and list ALL injection variables in one place in the brief:
```
Standard injection variables (used in ALL templates):
  {INJECT_SOUL_HERE}              — wiki/Soul.md + state/user_agent/soul-private.md
  {INJECT_ALLOWED_PATHS_HERE}     — filesystem scope for this clone
  {INJECT_ALLOWED_ENDPOINTS_HERE} — network scope from scopes.yaml
  {INJECT_WIKI_CONTEXT_HERE}      — relevant wiki pages (max ~500 tokens)
  {INJECT_TASK_HERE}              — the mission objective
prompt_builder.ts replaces these. Templates MUST use these exact names.
```

### 8. Fleet model mentioned but not specified

Section 1 says "any machine with git + Python + claude CLI is a node." Section 4 says "Clones run on any machine in the fleet. The dispatcher routes by `target_node` and `required_platform` fields in the task JSON."

But the dispatcher.py only runs locally. There's no fleet routing. The `state/fleet/` directory exists in the repo structure but no code touches it. The task JSON format doesn't include `target_node` or `required_platform` fields.

This is fine for MVP — but the brief should be explicit:
```
Fleet routing is Phase 5+ (post-MVP). For now, all tasks execute locally. 
The target_node and required_platform fields are reserved but ignored 
by the current dispatcher. Do not implement fleet routing in this build.
```

---

## BLIND SPOTS

### 9. No error recovery for the dispatcher itself

If `dispatcher.py` crashes, nobody restarts it. No systemd unit, no process supervisor, no watchdog. The droids concept includes a `telegram-heartbeat` but there's no `dispatcher-heartbeat`. If the dispatcher dies, the entire pipeline stops silently.

**Recommendation:** Add to scripts/bootstrap-linux.sh:
```
# Systemd unit for dispatcher
[Unit]
Description=Agent V4 Dispatcher
After=network.target

[Service]
ExecStart=/usr/bin/python3 /path/to/brain/dispatcher.py watch
Restart=always
RestartSec=5
```

### 10. Telegram watchdog launch command

Section 3 (Bridge) includes this exact command:
```bash
claude --effort $EFFORT --permission-mode auto --channels plugin:telegram@claude-plugins-official
```

This is a very specific Claude Code command. If this is the command that keeps the Telegram bot alive, it should be in the bootstrap scripts, not buried in the Bridge segment description. Opus might not realize this needs to be running as a persistent process alongside the dispatcher.

**Recommendation:** Add to Section 8 (Current State) under "What runs today" or create a new "Runtime Processes" section:
```
Three long-running processes (all must be running for the system to work):
1. Telegram watchdog:  claude --effort $EFFORT --permission-mode auto --channels plugin:telegram@claude-plugins-official
2. Python dispatcher:  python brain/dispatcher.py watch
3. (Future) Fleet node: not yet implemented
```

### 11. Wiki page lookup paths in prompt_builder.ts

`loadWikiContext()` looks for pages at `wiki/${pageName}.md`. But wiki pages are in subdirectories: `wiki/segments/segment-brain.md`, `wiki/concepts/concept-mission-briefs.md`, etc. If a task specifies `wikiContext: ["segment-brain"]`, the builder looks for `wiki/segment-brain.md` which doesn't exist.

The dispatcher.py I built handles this by searching subdirectories. The prompt_builder.ts doesn't. Opus will implement it as-is and wiki context injection will silently fail.

**Recommendation:** Note in Section 5 or in the prompt_builder section:
```
Wiki pages are in subdirectories (segments/, concepts/, tools/, etc.).
loadWikiContext() must search: wiki/{name}.md, then 
wiki/segments/{name}.md, wiki/concepts/{name}.md, wiki/tools/{name}.md, 
wiki/entities/{name}.md, wiki/decisions/{name}.md.
```

---

## IMPROVEMENTS

### 12. The Definition of Done (Section 11) is excellent

The step-by-step verification with specific commands and expected outcomes is exactly what Opus needs. No ambiguity about what "done" means.

**One addition:** Add a negative test case:
```
5. Verify security:
   ✓ ls state/worktrees/task-{id}/.env  (must NOT exist — revoked)
   ✓ grep -r "sk-ant" state/worktrees/  (must return nothing — no leaked keys)
```

### 13. Add a "Do NOT" section

Opus tends to be thorough, which means it sometimes builds things the brief doesn't ask for. Add:
```
## Do NOT (Scope Guard)
- Do not implement fleet routing (Phase 5+)
- Do not implement the Forge (Phase 7 — all stubs are intentional)
- Do not add new npm dependencies without explicit justification
- Do not modify wiki/ pages (the wiki is content, not code)
- Do not implement MemPalace MCP integration (mark TODO)
- Do not write .env files anywhere except state/worktrees/
- Do not add console.log as the primary output — use Bridge
```

### 14. Section ordering could be improved

The brief goes: Why → What → Segments → Repo → Principles → Decisions → Models → Current State → Build Order → Context → DoD → Output Protocol.

Sections 5 (Principles) and 6 (Decisions) interrupt the flow between "here's the structure" and "here's what to build." Consider reordering:
```
1. Why → 2. What → 3. Segments → 4. Principles (non-negotiable rules) 
→ 5. Repo Structure → 6. Current State (what works, what's broken) 
→ 7. Build Order → 8. Model Governance → 9. Decisions (reference) 
→ 10. DoD → 11. Output Protocol → 12. Full Context
```

This puts the "rules" right after the "what" (so Opus internalizes them before seeing code), then flows naturally into "here's the code, here's what's broken, here's how to fix it."

---

## REPOMIX CONTEXT ASSESSMENT

The 634KB repomix file contains the full codebase: 97 files across core/, brain/, wiki/, raw/, scripts/, templates/. Key observations:

**Strengths:**
- Every TypeScript file has clear phase annotations ("Phase 5 deliverable")
- Stubs throw descriptive errors ("not yet implemented — Phase 5 in progress")
- The wiki has grown to 57 pages with 22 decision/review documents — extensive context
- 7 Gemini reviews + 5 Opus reviews already ingested as raw sources
- Bridge.py is complete and tested — the output layer works

**Concerns:**
- The repomix includes ALL raw review documents (Gemini-review1 through 7, Opus-review1 through 5). That's ~4000 lines of review history. Opus doesn't need this to build Phase 0-4 — it adds noise. Consider excluding `raw/` from the repomix or creating a slimmer pack with only `core/`, `brain/`, `wiki/segments/`, `wiki/concepts/`, and `wiki/decisions/plan-build-v1.md`.
- The wiki pages in repomix still reference "six segments" in some places and "seven segments" in others (Bridge was added later). Minor inconsistency but could confuse Opus.

---

## SUMMARY: TOP 5 ACTIONS BEFORE SENDING

1. **Clarify the TS↔Python boundary** — specify exactly how dispatcher.py calls clone_worker.ts (Issue #1)
2. **Remove deprecated lifecycle methods** — mark `executeCloneMission()` and `launchClone()` in KeychainManager for deletion in Phase 0 (Issues #2, #3)
3. **Standardize injection variable names** between templates and prompt_builder.ts (Issue #7)
4. **Fix wiki page lookup paths** in prompt_builder.ts or note it for Opus (Issue #11)
5. **Add a "Do NOT" scope guard** to prevent Opus from overbuilding (Suggestion #13)
