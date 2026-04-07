# Wiki Pattern (Karpathy)

> Source: [[tool-llm-wiki]]

Instead of RAG (re-derive on every query), the LLM incrementally builds a persistent wiki. Knowledge compiled once, kept current, compounds over time. Three layers: raw sources (immutable), wiki (LLM-maintained markdown), schema (conventions in CLAUDE.md).

Operations: Ingest (source → extract → integrate → update index → log), Query (read index → find pages → synthesize, good answers filed back), Lint ([[segment-janitor]] health-checks for contradictions and staleness).

[[segment-brain]] starts fresh every session but never loses context because the wiki is pre-compiled and richer than last time. The wiki is the Brain's external cortex.

⚠️ **Wiki growth risk:** Without tiers, the index grows past the Brain's token budget. See [[concept-wiki-tiering]] for the hot/warm/cold archival strategy and the 500-token index cap.
