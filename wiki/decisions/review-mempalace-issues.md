# Review — MemPalace Issues Impact Assessment

> Date: 2026-04-08
> Source: `raw/mempalace-issues-impact.md`
> Researchers: lhl (code review), gizmax (independent benchmark reproduction)
> Severity for V4: 🟡 MODERATE — architecture insulated, wiki claims corrected

## Summary

Independent researchers found 7 README claims that don't match the MemPalace code. A second researcher independently reproduced the benchmarks, confirming the numbers while exposing the same structural concerns. Both sets of findings are credible, thorough, and reproducible.

## Claim vs Reality

| Claim | Reality |
|-------|---------|
| "Contradiction detection" | Does not exist. KG only blocks identical triples. Conflicting facts accumulate silently. |
| "30x compression, zero information loss" | AAAK is lossy. LongMemEval drops 96.6% → 84.2% (12.4pp loss). |
| 96.6% LongMemEval R@5 | Real number — but it's ChromaDB's score in raw mode, not palace structure. |
| "+34% from palace structure" | Standard metadata filtering. Narrowing scope improves precision in any vector DB. |
| "100% with Haiku rerank" | Not in benchmark scripts. Unverifiable. |
| Halls structurally enforced | Just metadata strings. Not used in retrieval ranking. |
| Wake-up ~170 tokens | Actually ~600-900 tokens. Confirmed by gizmax running `mempalace wake-up`. |

Benchmark summary: AAAK mode 84.2%, rooms mode 89.4%, raw mode 96.6%. Both palace-specific modes regress from raw.

## V4 Architecture Impact

**Protected by MemoryStore interface.** The single most important architectural decision is the `MemoryStore` abstraction. The Brain calls `await memory.readContext('L0_WAKE')` and doesn't know what's underneath. Swapping MemPalace is one file change. These issues require wiki corrections and strategy adjustments — not an architecture redesign.

### Affected areas

**1. Token budget (AAAK wake-up cost)**
- Was: ~170 tokens. Actual: ~600-900 tokens.
- Impact: Budget revision only — still cheap, well within any context window.
- Fix: Updated [[concept-token-economics]], [[concept-aaak-compression]], [[segment-memory]], [[tool-mempalace]].

**2. Contradiction detection**
- Was: assumed MemPalace KG handles it. Actual: KG only blocks exact duplicate triples.
- Impact: [[segment-janitor]] WikiScythe must implement contradiction detection via semantic similarity (LLM call), not by delegating to MemPalace.
- Fix: Updated [[segment-janitor]] with explicit V4-implemented note.

**3. 96.6% benchmark attribution**
- Was: attributed to MemPalace. Actual: it's ChromaDB's `all-MiniLM-L6-v2` in raw pass-through mode.
- Impact: Low — raw ChromaDB retrieval being strong is good news. Palace structure is still useful for organization.
- Fix: Updated [[tool-mempalace]] to clarify benchmark basis.

**4. Palace structure = metadata filtering**
- Was: implied as novel retrieval breakthrough. Actual: standard metadata filtering that works in any vector DB.
- Impact: Minimal. Organization + scoped search are still useful regardless of novelty.
- Fix: Updated [[tool-mempalace]] to be honest about what the structure provides.

**5. Knowledge graph fragility**
- Naive entity resolution (slugified exact matching). No contradiction detection. Hardcoded column indices.
- Impact: Cannot rely on KG for multi-entity fact tracking. "Planet Zabave d.o.o." and "PZ d.o.o." are unrelated in the KG.
- Fix: Use wiki pages + explicit wikilinks for entity relationships. KG is OK for simple temporal triples only.

## Revised Memory Strategy

### Keep
- MemPalace as storage backend (ChromaDB is genuinely strong — 96.6% R@5)
- MCP server (20 tools, all functional, no stubs)
- Wing/room organizational structure (useful for scoped search even if not novel)
- Verbatim storage in drawers (raw mode is strongest — don't compress quality-critical content)

### Change
- **AAAK use**: speed-only (droids, quick context injection). Never for Brain planning or Clone context assembly.
- **Contradiction detection**: implement at V4 layer (WikiScythe semantic comparison), not delegated to MemPalace.
- **KG entity resolution**: don't use for complex entity management. Use wiki + wikilinks.
- **Token budgets**: 170 → 600-900 tokens for wake-up across all pages.

### Consider (future)
- Alternative backends: Qdrant, plain SQLite+FTS5, pgvector — MemoryStore interface makes this a one-file swap.
- Hybrid search (vector + BM25/FTS) for improved exact-match queries.

## Findings vs Verdict

| Finding | Impact | Action |
|---------|--------|--------|
| AAAK lossy | Budget revision | ✅ Fixed — all 170-token references updated |
| No contradiction detection | WikiScythe self-implement | ✅ Fixed — segment-janitor updated |
| 96.6% = ChromaDB, not palace | Wiki claim correction | ✅ Fixed — tool-mempalace updated |
| Palace = metadata filtering | Framing correction | ✅ Fixed — tool-mempalace updated |
| KG entity resolution fragile | No KG for entity mgmt | ✅ Fixed — tool-mempalace updated |
| Wake-up 600-900 tokens | Budget revision | ✅ Fixed — 4 pages updated |
| Architecture still sound | No redesign needed | ✅ Confirmed |

## Pages Updated

| Page | Change |
|------|--------|
| [[concept-aaak-compression]] | "lossless" → lossy, add benchmark numbers, 170 → 600-900 tokens |
| [[concept-token-economics]] | 170 → 600-900 for wake-up |
| [[segment-memory]] | Compression claim, token budget, contradiction detection attribution |
| [[segment-janitor]] | WikiScythe contradiction detection must be V4-implemented |
| [[tool-mempalace]] | Benchmark clarification, KG limitations, "highest-scoring" removed |
