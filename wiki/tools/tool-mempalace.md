# MemPalace

Local-first AI memory system. 96.6% LongMemEval raw score (highest published requiring no API). Palace structure: wings (per person/project), halls (memory types: facts, events, discoveries, preferences, advice), rooms (specific topics), closets ([[concept-aaak-compression|AAAK compressed]]), drawers (verbatim transcripts).

ChromaDB for semantic search. Temporal knowledge graph on SQLite — facts have validity windows, contradictions detected automatically. MCP server with 19 tools. Auto-save hooks for Claude Code (catches context before compaction). Specialist agents with diaries map to [[segment-clones]] with persistent skill memory.

`pip install mempalace`. Python 3.9+, chromadb, pyyaml. Zero API calls needed. github.com/milla-jovovich/mempalace. MIT license.

## Used By
[[segment-memory]]
