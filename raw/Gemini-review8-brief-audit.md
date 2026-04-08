# Gemini Review 8 — Opus Build Brief Audit

Source: Telegram messages seq=110+111 | Reviewer: Gemini | Date: 2026-04-08
Scope: raw/opus-build-brief.md (v2) — pre-send review before handing to Opus

---

## Finding 1 — MemPalace Dependency Blind Spot (Critical)

**Problem:** The brief instructs Opus to build the MemoryStore interface and MemPalaceAdapter, but `repomix-full-context.txt` does not contain the actual MemPalace documentation, API schema, or MCP tool definitions. Opus doesn't know what 19 tools the MemPalace MCP server exposes, doesn't know AAAK compression parameters, and will guess the API from the interface we drafted — which may fail when connecting to a real MemPalace server.

**Fix:** Add a MemPalace MCP guidance section to the brief:
> "Opus, you must assume the MemPalace MCP server provides tools for `create_room`, `add_memory`, `search_vault`, and `get_aaak_summary`. If you need specific parameter structures, generate the TypeScript interface assuming standard MCP JSON-RPC protocol, but leave clear `// TODO: Map to exact MemPalace MCP schema` comments where the API surface is unknown."

---

## Finding 2 — TypeScript vs Python Conflict (Ambiguity)

**Problem:** The brief implies TypeScript for core, but Opus may get confused by heavy Python references in the Repomix context (AI tooling is heavily Python-based). If Opus writes `runner.ts` using native Python subprocess assumptions or treats the User Agent as a Flask app, the architecture breaks.

**Fix:** Add an absolute language mandate:
> "Strict Language Mandate: The entire Core Engine (`core/` and `bin/`) MUST be written in strict TypeScript (Node.js). Clones may execute Python scripts within their worktrees, but the orchestrator managing them is 100% Node.js."

---

## Finding 3 — state.json Updating Mechanism (Unresolved Decision)

**Problem:** Phase 3 asks Opus to build the UserAgent and Summary Pipeline, but the trigger for `state.json` updates is undefined. Does it update after every prompt? After 5 prompts? After a clone finishes? Wrong guess = burning tokens on every turn or wildly outdated state.

**Fix:** Define the trigger explicitly:
> "The `state.json` should be updated asynchronously only when the ComplexityClassifier routes a task to `FULL_PIPELINE` or after every 5 `DIRECT` interactions. Build a lightweight `flushState()` method to handle this."

---

## Finding 4 — allowedPaths Security Boundary (Missing Precision)

**Problem:** Phase 2 (Keychain MVP) mentions enforcing `allowedPaths` but Opus needs to know exactly how paths are validated. A weak check like `path.includes(allowedPath)` is vulnerable to directory traversal attacks (`../../../`).

**Fix:** Enforce absolute path resolution:
> "When building `KeychainManager` and the clone execution environment, all paths MUST be resolved to absolute paths using Node's `path.resolve()`, and you must verify that the requested execution path strictly starts with the generated worktree path to prevent `../` traversal attacks."

---

## Finding 5 — Missing setup.sh Execution Hook

**Problem:** Phase 3 (Clones) asks for `spawner.ts` and `runner.ts` but has no mention of the `setup.sh` script needed to initialise the clone's environment (npm install, pip install, etc.). Without this, the clone tries to run code with missing dependencies and fails the Janitor audit immediately.

**Fix:**
> "Phase 5 Execution Hook: `runner.ts` must look for and execute a `setup.sh` file within the clone's worktree before triggering the LLM mission, ensuring all environmental dependencies are installed."

(Note: setup.sh execution was described in plan-build-v1.md Phase 3 but was missing from the Opus brief's explicit requirements.)

---

## Finding 6 — Missing Circuit Breaker for Generation (Output Cutoff Risk)

**Problem:** Opus has a large but not infinite output window. Asking it to write complete TypeScript files for 6 complex phases in one shot guarantees it will hit a token limit and cut off halfway through a critical file.

**Fix:** Add a staged output protocol at the end of the brief:
> "Output Protocol: Do NOT attempt to write the entire codebase in one response.
> Start by outputting the complete code for Phase 0 (compile fixes) and Phase 1 (dispatcher fixes).
> STOP generating. Wait for 'Proceed to Phase 2' before continuing."

---

## Summary of Changes

| # | Category | Severity | Fix |
|---|----------|----------|-----|
| 1 | MemPalace API unknown | Critical | Add assumed MCP tool names + `// TODO` mandate |
| 2 | Language ambiguity | High | Hard-lock TypeScript for `core/` + `bin/` |
| 3 | state.json trigger undefined | Medium | Define: FULL_PIPELINE or every 5 DIRECT interactions |
| 4 | Path traversal vulnerability | High | Enforce `path.resolve()` + `startsWith` check |
| 5 | setup.sh hook missing | Medium | `runner.ts` must execute setup.sh before LLM launch |
| 6 | Token cutoff risk | Medium | Staged output protocol — phase by phase, wait for approval |
