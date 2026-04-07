# Mission Briefs

> How [[segment-brain]] instructs [[segment-clones]].

Precision-crafted instruction documents, NOT conversations. Contains: objective, context (wiki pages pre-loaded), constraints, output format, success criteria, credentials (via [[tool-keychain-agent]]), voice reference ([[concept-soul-md]]).

Delivered as TASK.md in the clone's [[concept-git-worktrees|git worktree]] alongside a CLAUDE.md from the relevant [[concept-clone-skill-templates|skill template]].

[[segment-forge]] A/B tests alternative brief structures via [[concept-shadow-benchmarking]]. Winners get promoted. Templates at `brain/templates/{skill}.md`.

## ⚠️ Required: Bootstrap Block

> Flagged by: [[review-gemini-review4]]

Every Mission Brief must include a `## Bootstrap` section specifying environment setup commands before the clone begins work:

```markdown
## Bootstrap (run before starting work)
- [ ] `npm install` / `pip install -r requirements.txt` / `go mod download`
- [ ] Verify env vars injected: `echo $REQUIRED_VAR`
- [ ] Confirm working dir is restricted: `pwd` → must show `state/worktrees/{clone-id}/`
```

The Brain selects the correct bootstrap block from `core/templates/` per skill type. Omitting this causes immediate clone failure on dependency errors.

**Mandatory for coding clones (from [[review-gemini-review5]]):**
```bash
repomix --output context.md --ignore node_modules,dist
```
Run before the clone reads any source files. Packs the repo into a single AI-friendly file (~70% token reduction). Never skip this step — clones without codebase context produce incorrect diffs.

## Sequential Thinking Pre-Pass (Brain)

> Source: [[review-gemini-review5]]

Before the Brain writes any Mission Brief, it must complete a Sequential Thinking pass (`@modelcontextprotocol/server-sequential-thinking`). The auditable reasoning chain (with `revisesThought`/`branchFromThought` state) is logged and becomes part of the delegation audit trail. Clones must never receive a brief that wasn't produced through structured decomposition.
