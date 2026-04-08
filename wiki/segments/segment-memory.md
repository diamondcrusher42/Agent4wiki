# Memory — The Vault

> Segment 1 of 6. Principle: Everything persists. Nothing is lost. Knowledge compounds.

## Role

Persistent external store that indexes, retrieves, and versions all context across all agents. No agent holds state in conversation — all state lives here.

## Implementation

Two systems combined:

**[[tool-mempalace]]** handles storage and retrieval. Palace structure organizes knowledge into wings (per entity/project), halls (memory types: facts, events, discoveries, preferences, advice), and rooms (specific topics). [[concept-aaak-compression]] provides ~30x compression (lossy — 12.4% retrieval quality drop; use raw mode for quality-critical queries). ChromaDB powers semantic search. Temporal knowledge graph (SQLite) tracks facts with validity windows. ⚠️ Contradiction detection is **V4-implemented** (WikiScythe semantic comparison), not provided by MemPalace — the KG only blocks exact duplicate triples.

**[[tool-llm-wiki]]** (Karpathy pattern) handles knowledge compilation. Raw sources stay immutable. A wiki of interlinked markdown pages is maintained by the system, compounding with every interaction. See [[concept-wiki-pattern]].

## Three Layers

| Layer | Path | Purpose | Who Writes |
|-------|------|---------|-----------|
| Raw sources | `memory/raw/` | Immutable originals | Ingest only |
| Wiki | `memory/wiki/` | Compiled, interlinked knowledge | Brain, designated clones |
| Palace | `memory/palace/` | Structured store with AAAK compression | All agents (attributed) |

## Token Budget

- L0: Identity (~50 tokens) — always loaded
- L1: Critical facts (~120 tokens, AAAK) — always loaded
- L2: Room recall — on demand when topic surfaces
- L3: Deep search — semantic query across all closets

Total wake-up cost: ~600-900 tokens for full world context (confirmed by independent benchmark — see [[review-mempalace-issues]]). See [[concept-token-economics]].

## Operations

- **Ingest**: source → read → extract → update wiki pages → update index → log. Single source may touch 10-15 pages.
- **Query**: read index → find relevant pages → synthesize. Good answers filed back as new pages.
- **Lint**: [[segment-janitor]] runs periodic health checks — contradictions, stale claims, orphans, missing cross-references.
- **Atomize**: clone outputs broken into atomic Zettelkasten notes, rewritten in user voice (via [[concept-soul-md]]), interlinked, filed.

## Local-First

[[tool-bitnet]] 2B model on CPU powers embedding and retrieval without API costs. Full memory system runs offline.

## Interfaces

- ← [[segment-brain]]: requests context before planning
- ← [[segment-user-agent]]: writes observation logs
- ← [[segment-clones]]: read-only mission context
- ← [[segment-janitor]]: prune commands, integrity audits
- ← [[segment-forge]]: reads all data for pattern analysis, writes improvement findings
