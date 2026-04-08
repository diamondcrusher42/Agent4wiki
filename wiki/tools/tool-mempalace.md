# MemPalace

Local-first AI memory system. Palace structure: wings (per person/project), halls (memory types: facts, events, discoveries, preferences, advice), rooms (specific topics), closets ([[concept-aaak-compression|AAAK compressed]]), drawers (verbatim transcripts).

ChromaDB for semantic search (96.6% LongMemEval R@5 in raw mode — this is ChromaDB's `all-MiniLM-L6-v2` score, not a palace-structure score). AAAK mode: 84.2% (−12.4pp), rooms mode: 89.4% (−7.2pp). Both palace-specific modes **regress from raw**. MCP server with 20 tools. Auto-save hooks for Claude Code (catches context before compaction). Specialist agents with diaries map to [[segment-clones]] with persistent skill memory.

> ⚠️ **Benchmark clarification:** The 96.6% figure measures ChromaDB embeddings in raw pass-through mode. Palace structural features (wings, rooms, halls) are metadata filtering — they narrow search scope but don't improve the underlying embedding quality.

> ⚠️ **KG limitations:** The SQLite knowledge graph uses slugified names with no entity resolution beyond exact matching. "Planet Zabave d.o.o." and "PZ d.o.o." are unrelated entities in the KG. Contradiction detection is not implemented — conflicting facts accumulate silently. For entity relationships, use wiki pages + explicit wikilinks instead.

> Source: [[review-mempalace-issues]] (independent code review by lhl, independently reproduced by gizmax)

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
- Brain calls `readContext('L0_WAKE')` — budget ~600-900 tokens (independently benchmarked wake-up cost), AAAK logic is inside the adapter
- Swap MemPalace for Qdrant/ChromaDB/SQLite: one file changes, nothing else breaks
- `delete()` is the Janitor's scythe — sole writer for memory pruning in Phase 6

**Async-first design** (per [[review-gemini-review3]]): all methods return `Promise<>`. If MemPalace is ever swapped for a cloud vector DB, the Phase 3 RTT classifier accounts for retrieval latency automatically.

## Used By
[[segment-memory]]
