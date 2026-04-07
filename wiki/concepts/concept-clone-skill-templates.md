# Clone Skill Templates

> Per-skill instruction sets for [[segment-clones]] that improve over time.

Each skill type (code, docs, research, devops, qa, health, accounting, telegram,...) has a template at `templates/{skill}-TASK.md`. Templates follow the shared preamble + specialization pattern from [[tool-hstack]]: common base (rules, voice via [[concept-soul-md]], protocols) plus skill-specific instructions.

Templates are versioned. [[segment-forge]] A/B tests alternatives via [[concept-shadow-benchmarking]]. When a new template version consistently produces better clone outputs, it gets promoted. Old versions archived with performance scores in `forge/briefs/history/`.

Templates include credential requirements that [[tool-keychain-agent]] fulfills via scoped injection.

---

## Code Clone Template — `templates/code-clone-TASK.md`

> Created: 2026-04-08 | Source: `raw/TASK_template.md` (Gemini-authored)
> Status: V1 — ready to use

### Injection Variables

| Variable | Injected by | Content |
|----------|------------|---------|
| `{INJECT_SOUL_MD_HERE}` | Brain routing script | Full `soul.md` content |
| `{INJECT_ALLOWED_PATH_HERE}` | Brain routing script | Worktree path e.g. `~/state/worktrees/clone-abc123/` |
| `{INJECT_BRAIN_DELEGATED_TASK_HERE}` | Brain | Mission objective from planning pass |

### Execution Lifecycle — The Janitor Handshake

```
[INTAKE]    → Acknowledge mission + security boundaries
[DISCOVER]  → Run repomix, read output — mandatory before any code
[DECOMPOSE] → Break task into granular steps from DISCOVER findings
[EXECUTE]   → Write code, follow conventions found in DISCOVER, run/write tests
[AUDIT]     → Self-review: objective met? regressions? stayed in allowed path?
```

### Output Contract (Janitor-parseable JSON)

```json
{
  "status": "COMPLETED | FAILED_REQUIRE_HUMAN | FAILED_RETRY",
  "files_modified": ["list", "of", "files"],
  "tests_passed": true/false,
  "janitor_notes": "Architectural choices or weak spots for Janitor review."
}
```

### Design Decisions

- **Repomix trap in [DISCOVER]:** Forces the clone to read the actual repo state before planning. Prevents hallucinated plans based on pre-training knowledge.
- **JSON handshake:** Janitor parses only the final JSON — no need to read the full reasoning trace. Clean BLOCK/SUGGEST/NOTE decision from structured output.
- **Security boundary explicit:** Allowed path is stated twice (Section 2 + [AUDIT] self-check). Violation = hard kill, fatal log.
- **Tests required:** If tests exist, run them. If not, write and run basic unit tests. No exceptions.

### Templates Still Needed (Phase 4)

| Skill | Status |
|-------|--------|
| code | ✅ V1 done — `templates/code-clone-TASK.md` |
| docs | ⬜ Pending |
| research | ⬜ Pending |
| devops | ⬜ Pending |
| qa | ⬜ Pending |
| health | ⬜ Pending |
| accounting | ⬜ Pending |
| telegram | ⬜ Pending |
