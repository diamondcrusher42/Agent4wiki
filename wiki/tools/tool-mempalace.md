# MemPalace

Local-first AI memory system. 96.6% LongMemEval raw score (highest published requiring no API). Palace structure: wings (per person/project), halls (memory types: facts, events, discoveries, preferences, advice), rooms (specific topics), closets ([[concept-aaak-compression|AAAK compressed]]), drawers (verbatim transcripts).

ChromaDB for semantic search. Temporal knowledge graph on SQLite — facts have validity windows, contradictions detected automatically. MCP server with 19 tools. Auto-save hooks for Claude Code (catches context before compaction). Specialist agents with diaries map to [[segment-clones]] with persistent skill memory.

`pip install mempalace`. Python 3.9+, chromadb, pyyaml. Zero API calls needed. github.com/milla-jovovich/mempalace. MIT license.

## MemoryStore Interface — Phase 1 Deliverable

> Code: `core/memory_store/interface.ts` + `core/memory_store/mempalace_adapter.ts`
> Status: V1 done — MemPalaceAdapter implements MemoryStore

Nothing outside `core/memory_store/` calls MemPalace directly. The Brain calls `await memory.readContext('L0_WAKE')` — it never knows what backend is running.

```typescript
interface MemoryStore {
  connect(): Promise<void>;
  write(content, metadata): Promise<string>;       // INGEST
  readContext(tier, query?): Promise<string>;      // RETRIEVE — L0/L1/L2/L3 tiers
  search(query, limit?): Promise<[...]>;           // SEARCH — semantic similarity
  delete(memoryId): Promise<boolean>;              // PRUNE — Janitor only
}
```

**Architecture wins:**
- Brain calls `readContext('L0_WAKE')` — always ≤170 tokens, AAAK logic is inside the adapter
- Swap MemPalace for Qdrant/ChromaDB/SQLite: one file changes, nothing else breaks
- `delete()` is the Janitor's scythe — sole writer for memory pruning in Phase 6

**Async-first design** (per [[review-gemini-review3]]): all methods return `Promise<>`. If MemPalace is ever swapped for a cloud vector DB, the Phase 3 RTT classifier accounts for retrieval latency automatically.

## Used By
[[segment-memory]]
