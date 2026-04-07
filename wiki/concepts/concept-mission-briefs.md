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
