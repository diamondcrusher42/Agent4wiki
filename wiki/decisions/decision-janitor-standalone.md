# Decision: Janitor as Standalone Product

> Date: 2026-04-09
> Source: review-janitor-audit3, real-world test run on claude-agent-template

## Why standalone?

The Janitor was built as a segment inside agent4wiki. After the Janitor self-audit (review-janitor-audit3), it became clear the value proposition extends beyond agent pipelines: the Janitor finds things other tools miss in ANY codebase.

Key insight from the audit: the value isn't just "find bugs" — it's "find confusion traps." A dead code block where someone could edit the wrong branch and not know why. A template variable mismatch that wastes tokens silently. A design contradiction between comment and code. These are the high-value signals.

## Repo

`diamondcrusher42/agent-janitor` (private)

Install: `npx agent-janitor audit <path>`

## Architecture

- TypeScript CLI (no runtime deps beyond yaml)
- Health score 0–100 with delta tracking via `.janitor-history.json`
- `.janitor.json` override in target repo
- `exclude_path_patterns` for path-based exclusions (not just dir names)
- Programmatic API (`runAudit`, `compareBranches`, `evaluate`)

## Learnings from first real scan (v1.0.1)

First scan of `claude-agent-template` exposed 4 false positive classes, all fixed:

1. **Python indentation not checked**: `elif`/`else` blocks at outer indent flagged as dead code. Fix: skip next lines with strictly lower indent than the `return`.

2. **`high_entropy_base64` at 40 chars**: Notion IDs, SHA hashes, base64 in docs all fire. Fix: raise to 60 chars.

3. **`generic_password_assignment` matches variable refs**: `PASSWORD="$TOKEN"` in shell scripts. Fix: require value not starting with `$`.

4. **Skill files contain example tokens**: `.claude/skills/*.md` always fires. Fix: `exclude_path_patterns` field, `.claude/skills` excluded by default.

Result: 61 SUGGEST + 47 NOTE → 13 SUGGEST + 8 NOTE. Remaining are legitimate.

## Credential sharing for private repos

The Janitor needs clone access for private repos. Pattern:
```bash
GH_TOKEN=$(gh auth token)
git clone "https://username:${GH_TOKEN}@github.com/owner/repo.git" /tmp/target
agent-janitor audit /tmp/target
```

No credentials stored in the repo. Token is process-local.

## What it finds that linters miss

| Signal | Linter | Janitor |
|---|---|---|
| Dead code confusion traps | Partial | ✓ With context |
| Design contradictions | ✗ | ✓ |
| Silent failure modes | ✗ | ✓ |
| Stale artifacts | ✗ | ✓ |
| Branch delta | ✗ | ✓ |
| Good patterns to preserve | ✗ | ✓ |
