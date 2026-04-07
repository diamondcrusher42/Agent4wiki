# Agent Architecture Wiki — Schema

## Structure

This is an LLM-maintained wiki following the Karpathy pattern.

### Directories
- `raw/` — immutable source documents. Never modify.
- `wiki/` — LLM-maintained compiled knowledge. The compiled artifact.
  - `wiki/segments/` — one page per architecture segment (6 total)
  - `wiki/concepts/` — cross-cutting ideas referenced by multiple segments
  - `wiki/tools/` — external tools and repos used in the architecture
  - `wiki/entities/` — specific things (hardware, bots, etc.)
  - `wiki/decisions/` — architectural decisions with rationale
  - `wiki/index.md` — master catalog of all pages
  - `wiki/log.md` — chronological append-only operation record

### Conventions
- Filenames: `{type}-{name}.md` (e.g., `segment-brain.md`, `concept-soul-md.md`)
- Wikilinks: `[[page-name]]` or `[[page-name|display text]]`
- Every page starts with `# Title` and a blockquote summary
- New pages must be added to `wiki/index.md`
- Every operation must be logged in `wiki/log.md`
- Pages should cross-reference related pages liberally

### Operations
- **Ingest**: new source → read → extract key info → create/update wiki pages → update index → append to log
- **Query**: read index → find relevant pages → synthesize answer → optionally file good answers as new pages
- **Lint**: check for contradictions, stale claims, orphan pages, missing cross-references, pages mentioned but not created

### Rules
- Raw sources are immutable — never edit files in `raw/`
- Wiki pages are the compiled artifact — keep them current
- Attribute every change in log.md
- Prefer updating existing pages over creating new ones
- One idea per concept page
- Link generously — cross-references are the wiki's value
