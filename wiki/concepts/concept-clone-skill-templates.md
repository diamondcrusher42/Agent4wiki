# Clone Skill Templates

> Per-skill instruction sets for disposable clone executors. Templates improve over time as the Forge accumulates performance data.

## What a Clone Skill Template Is

A clone skill template is a pre-written mission brief for a specific type of task. Rather than the Brain composing a prompt from scratch every time, it fills injection variables into a validated template.

Templates encode:
- The expected deliverable and quality bar
- File system scope (`{INJECT_ALLOWED_PATHS_HERE}`)
- Network scope (`{INJECT_ALLOWED_ENDPOINTS_HERE}`)
- Required handshake format (the Janitor audit target)
- Common failure modes to avoid

## Standard Injection Variables

All templates use exactly these variable names. `prompt_builder.ts` replaces them:

| Variable | Content |
|----------|---------|
| `{INJECT_SOUL_HERE}` | `wiki/Soul.md` + `state/user_agent/soul-private.md` |
| `{INJECT_ALLOWED_PATHS_HERE}` | Filesystem scope for this clone |
| `{INJECT_ALLOWED_ENDPOINTS_HERE}` | Network scope from `scopes.yaml` |
| `{INJECT_WIKI_CONTEXT_HERE}` | Relevant wiki pages (max ~500 tokens) |
| `{INJECT_TASK_HERE}` | The mission objective |

Templates MUST use these exact names. Non-standard variable names will silently fail (unreplaced string left in prompt).

## Current Templates

### `templates/code-clone-TASK.md` — Code Clone V1

The primary template for coding tasks. Structure:

1. **Identity** — Who you are (Soul injection)
2. **Scope** — What paths and endpoints you may touch
3. **Mission** — The specific task (`{INJECT_TASK_HERE}`)
4. **Context** — Relevant wiki knowledge (`{INJECT_WIKI_CONTEXT_HERE}`)
5. **Repomix trap** — Read repomix-focused-context.txt before touching any file
6. **Handshake** — Mandatory JSON output format for Janitor audit

### Handshake JSON (mandatory last line of stdout)

```json
{
  "status": "COMPLETED|FAILED|REQUIRE_HUMAN",
  "summary": "one-line description of what was done",
  "files_changed": ["path/to/file.ts"],
  "tests_passed": true,
  "confidence": 0.0-1.0
}
```

The clone MUST output this as the **final line of stdout**. Parser: reverse-iterate stdout lines, find last line starting with `{`, `JSON.parse()` it. If no valid JSON → `FAILED_REQUIRE_HUMAN`.

## How Templates Improve (Forge Loop)

The Forge records every task outcome in `forge/events.jsonl`. Over time:

1. Tasks with high Janitor confidence scores → template patterns extracted
2. Repeated failure modes → added to template as explicit "avoid" instructions
3. Better-performing prompt variants → A/B tested by Forge V0.1

Templates are versioned (`TASK-v1.md`, `TASK-v2.md`). The Brain's `PromptBuilder` selects the current version.

## Location

- `templates/` — all mission brief templates
- `core/brain/prompt_builder.ts` — injection logic
- `wiki/Soul.md` — the identity file injected into every template

*See also: [[segment-clones]], [[segment-brain]], [[segment-forge]], [[concept-mission-briefs]]*
