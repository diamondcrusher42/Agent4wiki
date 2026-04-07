# LLM Wiki (Karpathy)

Pattern for persistent compounding knowledge bases. See [[concept-wiki-pattern]]. Three layers: raw sources (immutable), wiki (LLM-maintained), schema (CLAUDE.md). Ingest/query/lint operations. index.md + log.md navigation. Wiki is markdown in git — free version history. Obsidian as optional viewer. 5000+ stars on gist.

Key insight: knowledge compiled once and kept current beats re-deriving on every query. Cross-references already exist. Contradictions already flagged. Synthesis reflects everything ingested.

gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

## Used By
[[segment-memory]], [[segment-janitor]]
