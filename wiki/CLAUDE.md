# Wiki Schema & Rules

This file defines the conventions for the Agent4 wiki directory.
The Brain reads this file before any wiki operation.

## Directory Map

| Directory | Purpose |
|-----------|---------|
| `segments/` | One file per system segment (segment-brain.md, etc.) |
| `concepts/` | Cross-cutting ideas and patterns (concept-git-worktrees.md, etc.) |
| `tools/` | External tools and services the system integrates (tool-mempalace.md, etc.) |
| `entities/` | Named external actors, services, APIs |
| `decisions/` | Architecture decisions + review records |
| `raw/` | Immutable source documents — never edit, only append |

## Page Format

Every wiki page must have:
- `# Title` — H1 at top
- A one-line description of what this page covers
- Cross-references using `[[page-name]]` syntax (wikilink style)

## Wikilink Convention

Use `[[page-name]]` without the `.md` extension.
Tool links: `[[tool-mempalace]]`
Concept links: `[[concept-git-worktrees]]`
Segment links: `[[segment-brain]]`
Decision links: `[[decision-typescript-python]]`

## Index Rules

`index.md` is the master catalog. Every page must appear there.
Format: `[[page-name]] — one-line description`
Sections: Segments | Concepts | Tools | Entities | Decisions | Reviews

## Log Rules

`log.md` is append-only. Never edit existing entries.
Format: `## [YYYY-MM-DD] <operation> | <title>`
Operations: `init`, `ingest`, `query`, `implement`, `patch`, `lint`

## Tiering

Pages age into cold storage after 90 days of no edits.
Hot tier: indexed and context-injected automatically.
Warm tier: on-demand retrieval.
Cold tier: archived, not in index. See [[concept-wiki-tiering]].

## Token Budget

The wiki context injected into a Brain session is capped at 500 tokens.
The index.md must stay under this limit. Prefer one-line entries.
