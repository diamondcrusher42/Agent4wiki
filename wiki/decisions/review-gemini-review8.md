# Review: Gemini Review 8 — Opus Build Brief Audit

> Source: raw/Gemini-review8-brief-audit.md | Reviewer: Gemini | Date: 2026-04-08
> Scope: raw/opus-build-brief.md (v2) — pre-send review, all findings applied to v3

6 findings. All applied to the brief before sending to Opus.

---

## Finding 1 — MemPalace Dependency Blind Spot (Critical) ✓ Fixed

**Issue:** Brief told Opus to build `MemPalaceAdapter` but `repomix-full-context.txt` has no MemPalace API docs, MCP tool definitions, or AAAK schema. Opus would guess and likely produce an adapter that fails against the real server.

**Fix applied:** Added to Section 5 (Key Design Principles):
- Assumed MCP tool names: `create_room`, `add_memory`, `search_vault`, `get_aaak_summary`, `delete_memory`, `list_rooms`
- Mandatory `// TODO: Map to exact MemPalace MCP schema` comments where API surface is unknown
- No silent guessing — unknowns must be made explicit

---

## Finding 2 — TypeScript vs Python Language Ambiguity (High) ✓ Fixed

**Issue:** Repomix context is Python-heavy (AI tooling ecosystem). Opus might write `core/` in Python or assume User Agent is a Flask app.

**Fix applied:** Hard language mandate added to Section 5:
> "The entire Core Engine (`core/` and `bin/`) MUST be written in strict TypeScript (Node.js). If you find yourself writing Python in `core/`, stop and reconsider."

---

## Finding 3 — state.json Update Trigger Undefined (Medium) ✓ Fixed

**Issue:** Phase 3 builds the UserAgent and Summary Pipeline but the trigger for when `state.json` updates was never defined. Wrong guess = token burn per turn or stale state.

**Fix applied:** Added to Section 5:
- Trigger: FULL_PIPELINE routing OR every 5 DIRECT interactions
- Implementation: lightweight `flushState()` method called from exactly these two points
- Explicit prohibition: do NOT update on every prompt

---

## Finding 4 — Path Traversal Vulnerability (High) ✓ Fixed

**Issue:** Brief mentioned `allowedPaths` enforcement but gave no implementation guidance. A check like `path.includes(allowedPath)` is vulnerable to `../../../` directory traversal — a clone could escape its worktree sandbox.

**Fix applied:** Added to Section 5 with exact required pattern:
```typescript
const resolved = path.resolve(requestedPath);
if (!resolved.startsWith(path.resolve(worktreePath))) {
  throw new Error(`Path traversal attempt: ${requestedPath}`);
}
```
`path.resolve()` is mandatory. `includes()` is explicitly called out as insufficient.

---

## Finding 5 — setup.sh Execution Hook Missing (Medium) ✓ Fixed

**Issue:** `runner.ts` spec didn't mention executing `setup.sh`. Without it, a clone starts with no npm/pip dependencies installed and immediately fails the Janitor audit.

**Fix applied:** Added to Section 5:
> "`runner.ts` must execute `setup.sh` before launching the claude session. If setup.sh is missing, proceed with warning — optional, not mandatory."

(Note: setup.sh was documented in `plan-build-v1.md` Phase 3 but was absent from the Opus brief's explicit requirements.)

---

## Finding 6 — Token Cutoff Risk / No Circuit Breaker (Medium) ✓ Fixed

**Issue:** Asking Opus to write 6 complex phases in one response guarantees a mid-file token cutoff. A half-written `KeychainManager` is worse than no implementation.

**Fix applied:** Added as Section 12 — Output Protocol:
- Staged 5-step generation: Phase 0 → stop → Phase 1 → stop → ... → Phase 4
- Each step: complete, compilable files — no placeholders
- Explicit rule: if uncertain whether to proceed, stop and ask

---

## Net Impact on the Brief

v2 → v3: 6 additions to Section 5 (Key Design Principles) + new Section 12 (Output Protocol). All findings were gaps in implementation guidance that would have caused Opus to produce either wrong code, insecure code, or incomplete output.

*See also: [[plan-build-v1]], [[review-opus-review5]], [[decision-model-governance]]*
