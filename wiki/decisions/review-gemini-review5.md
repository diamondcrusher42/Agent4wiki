# Review — Gemini Review 5: On the Skills Research

> Source: `raw/Gemini-review5-On-the-skills-research.md` | Created: 2026-04-08
> Reviewer: Gemini
> Subject: Synthesis of [[review-pdf-agentic-ecosystem]] findings → Phase 4 + 5 action mapping

---

## Overall Signal

**"We have enough research. Start building."** The MCP ecosystem PDF provides exact blueprints for Phase 4 (Brain + Clone Infrastructure) and Phase 5 (Clones). No more general research needed. Target list is locked.

---

## Skill → Architecture Mappings (Actionable Now)

### 1. Sequential Thinking → Brain Pre-Delegation Engine

The `@modelcontextprotocol/server-sequential-thinking` is exactly what the Brain needs before dispatching clones. Parameters `revisesThought` and `branchFromThought` force an auditable reasoning chain before any delegation happens.

**Rule:** Brain must complete a Sequential Thinking pass before writing any Mission Brief. The reasoning chain is logged and becomes part of the audit trail. Clones should never receive a brief that wasn't produced through structured decomposition.

**Action:** Add Sequential Thinking MCP server invocation as Step 1 of Brain's delegation sequence in Phase 4 templates.

---

### 2. Repomix → Mandatory Coding Clone Bootstrap Step

Clones editing code need full repository understanding. Repomix (Tree-sitter smart compression, ~70% token reduction) should be baked into the setup phase of every coding clone — not optional, not left to the clone to figure out.

**Rule:** Every coding Mission Brief bootstrap block must include: `repomix --output context.md --ignore node_modules,dist` before the clone reads any source files.

**Action:** Add to `core/templates/code.md` as mandatory pre-work step. See [[concept-mission-briefs]].

---

### 3. Absolute-Human board.md → Janitor Audit Log Format

The Absolute-Human workflow maintains task state on a persistent `board.md` using the INTAKE→DECOMPOSE→DISCOVER→PLAN→EXECUTE→VERIFY→CONVERGE cycle. This maps directly to how the Janitor should structure its audit logs — not free-form text, but a structured board that tracks what was found, what was flagged, and what was resolved.

**Rule:** Janitor audit logs adopt the Absolute-Human board syntax: each audit cycle as a structured state machine entry. Status transitions are explicit. Nothing is lost between audit runs.

**Action:** Define `janitor/audit-board.md` format using Absolute-Human syntax. See [[segment-janitor]].

---

## Confirmed / Reinforced (No Action Needed)

| Finding | Source | Status |
|---------|--------|--------|
| Credential scraping via root dir execution | [[review-gemini-review1]], [[review-pdf-agentic-ecosystem]] | Confirmed — allowedPaths + E2B required |
| Sandbox (E2B / Docker sbx + deny-by-default networking) | [[review-pdf-agentic-ecosystem]] | Already patched into concept-git-worktrees |
| Code Mode 98.7% token reduction | [[review-pdf-agentic-ecosystem]] | Already patched into concept-token-economics |
| Git worktrees must be inside bounded execution box | [[review-gemini-review1]], [[review-gemini-review4]] | Already in plan |

---

## Next Action (from reviewer)

Phase 4 requires 8 manual Mission Brief templates (code, docs, research, devops, qa, health, accounting, telegram). The skills research is now complete. Begin drafting template prompts, starting with the coding template — it has the most concrete requirements (Repomix bootstrap, Sequential Thinking pre-pass, allowedPaths, E2B isolation tier).

---

*See also: [[plan-implementation-v4]], [[review-pdf-agentic-ecosystem]], [[concept-mission-briefs]], [[segment-janitor]], [[tool-mcp-protocol]]*
