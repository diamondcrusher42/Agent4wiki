# MemPalace Issues — Impact Assessment for Agent V4

> Date: 2026-04-08
> Sources: Issue #27 (lhl — claims vs code), Issue #39 (gizmax — independent benchmark), Issue #29 (benchmark methodology), Issue #11 (KG conflict resolution), full analysis at github.com/lhl/agentic-memory
> Severity for V4: 🟡 MODERATE — architecture is insulated, but wiki claims need correction and memory strategy needs adjustment

---

## What the Issues Reveal

An independent researcher (lhl) did a deep code review of MemPalace and found that **seven README claims don't match the code**. A second researcher (gizmax) independently reproduced the benchmarks and confirmed the numbers while exposing the same structural concerns. The findings are credible, thorough, and reproducible. Here's the summary:

| Claim | Reality | Verified By |
|-------|---------|-------------|
| "Contradiction detection" | **Does not exist in code.** KG only blocks identical triples. Conflicting facts accumulate silently. | lhl (code review) |
| "30x compression, zero information loss" | **AAAK is lossy.** LongMemEval drops from 96.6% → 84.2% (12.4pp loss) when using AAAK mode. decode() is string splitting, not reconstruction. | lhl + gizmax (benchmark) |
| 96.6% LongMemEval R@5 | **Real number, but it's ChromaDB's score, not MemPalace's.** Raw mode uses plain ChromaDB embeddings with no palace structure involved. | gizmax (reproduced exactly) |
| "+34% from palace structure" | **Standard metadata filtering.** Narrowing search scope in any vector DB improves precision. Not novel. | lhl (code review) |
| "100% with Haiku rerank" | **Not in benchmark scripts.** Unverifiable. | lhl |
| Halls structurally enforced | **Just metadata strings.** Not used in retrieval ranking. | lhl (code review) |
| Wake-up ~170 tokens | **Actually ~600-900 tokens.** Confirmed by gizmax running `mempalace wake-up`. | gizmax |

Additional findings from gizmax: AAAK mode scores 84.2%, rooms mode scores 89.4% — **both regress from raw (96.6%)**. The palace's unique features (AAAK compression, room structure) actively hurt retrieval quality compared to just storing raw text in ChromaDB.

---

## Impact on Agent V4 Architecture

### What's protected (the MemoryStore interface saves us)

The single most important architectural decision we made was the `MemoryStore` interface abstraction. Our `MemPalaceAdapter` implements a generic interface. The Brain calls `await memory.readContext('L0_WAKE')` and doesn't care what's underneath. Swapping MemPalace for any other backend is one file change.

**This means the MemPalace issues do NOT require an architecture redesign.** They require updating the adapter and adjusting our expectations about what MemPalace actually provides.

### What's directly affected

**1. AAAK compression is not lossless — our token budget assumptions are wrong.**

We built the entire token economics around AAAK's claimed 30x lossless compression. The L0+L1 wake-up budget was 170 tokens. The reality is 600-900 tokens for wake-up, and AAAK compression loses 12.4% retrieval quality.

**V4 impact:** The User Agent's "< 500 token state object" assumption still holds (that's our own state.json, not MemPalace). But the Brain's startup context budget needs revision. Instead of 170 tokens for world context, plan for 600-900. This is still very cheap — well within any context window — but the "170 tokens" claim repeated across our wiki, architecture spec, and Opus brief is wrong and needs correcting.

**Action:** Update all references to "~170 tokens" → "~600-900 tokens" in wiki pages. Remove "zero information loss" and "30x lossless" claims. Note that AAAK is lossy and should be used for speed, not quality.

**2. Contradiction detection doesn't exist — our Janitor can't rely on it.**

The WikiScythe (`core/janitor/scythe.ts`) calls `this.memory.audit()` expecting a structured report with contradictions. We assumed MemPalace's knowledge graph would detect these. It doesn't. The KG only blocks exact duplicate triples.

**V4 impact:** The Janitor's contradiction detection needs to be implemented at our layer, not delegated to MemPalace. This means either: (a) the WikiScythe does its own semantic comparison across wiki pages (LLM call, more expensive), or (b) we build contradiction detection into the MemoryStore interface and implement it ourselves in the adapter.

**Action:** Mark `contradictions` in the AuditReport as "V4-implemented, not MemPalace-provided." Add a TODO to WikiScythe: implement contradiction detection using semantic similarity between wiki pages, not KG triples.

**3. The 96.6% benchmark is ChromaDB, not MemPalace — our tool-mempalace wiki page overclaims.**

We attributed the benchmark score to MemPalace. It's actually ChromaDB's default embedding model (`all-MiniLM-L6-v2`). The palace structure (wings, rooms, halls) doesn't participate in the raw mode benchmark.

**V4 impact:** Low. We use MemPalace through MCP for storage and retrieval. The raw ChromaDB retrieval being strong is actually good news for us — it means simple vector search works well. But our wiki page claims are misleading.

**Action:** Update `wiki/tools/tool-mempalace.md` to note that the benchmark measures ChromaDB embeddings, not palace structure. Add the AAAK (84.2%) and rooms (89.4%) scores alongside the raw (96.6%) score. Remove "highest-scoring AI memory system" framing.

**4. Palace structure (wings/rooms/halls) is metadata filtering, not novel retrieval.**

We designed our Memory segment with wings per entity/project, halls for memory types, rooms for topics. The analysis confirms this is standard metadata filtering on a vector DB — it works, but it's not unique to MemPalace.

**V4 impact:** Minimal. The organizational metaphor is still useful for human comprehension and for scoping searches. Whether it's "novel" or "standard" doesn't matter for our use case. We're not selling MemPalace — we're using it.

**Action:** No architecture change needed. Update wiki to be more honest about what the structure provides (organization + scoped search, not a breakthrough in retrieval).

**5. Knowledge graph is fragile — naive entity resolution, no contradiction detection, hardcoded column indices.**

The KG uses slugified names (`alice_obrien`) with no entity resolution beyond exact matching. Conflicting facts accumulate silently. Row parsing uses hardcoded column indices.

**V4 impact:** We planned to use the KG for temporal fact tracking across your entities (each d.o.o., društvo, etc.). With naive entity resolution, "Planet Zabave d.o.o." and "PZ d.o.o." would be two separate entities with no connection. This undermines the multi-entity accounting use case.

**Action:** For MVP, don't rely on MemPalace's KG for entity resolution. Use the wiki pattern instead (each entity gets a wiki page, cross-references are explicit wikilinks). Consider implementing our own entity resolution layer if KG use becomes critical.

---

## What Still Works (Worth Keeping)

Despite the issues, MemPalace provides real value for V4:

**ChromaDB vector search is genuinely strong.** 96.6% R@5 on raw text is excellent. This is our actual retrieval backend and it works.

**The MCP server with 20 tools is functional.** All tools are implemented (no stubs). The PALACE_PROTOCOL prompt engineering in the status tool is a good pattern for grounded retrieval.

**Zero-LLM write path is a real advantage.** All extraction and classification is deterministic — offline, zero API cost. For our BitNet-on-CPU cost model, this matters.

**The spatial metaphor is useful for human comprehension.** Wings per project/entity, rooms per topic — this maps naturally to your multi-entity world. The fact that it's "just metadata filtering" doesn't make the organization less useful.

**The agent diary system maps to our Clone specializations.** Each agent/clone gets its own wing and diary entries.

---

## Revised Memory Strategy for V4

Given these findings, here's the adjusted approach:

### Keep
- MemPalace as the storage backend (ChromaDB is strong)
- MCP server for tool access (20 tools, all functional)
- Wing/room organizational structure (useful even if not novel)
- Verbatim storage in drawers (raw mode is strongest)

### Change
- **Don't use AAAK for quality-critical retrieval.** Use it only for quick summaries where 84% recall is acceptable (e.g., quick context injection for droids). Use raw mode for Brain planning and Clone context assembly.
- **Implement contradiction detection at our layer** (WikiScythe or a dedicated Janitor droid), not relying on MemPalace's non-existent implementation.
- **Don't rely on MemPalace's KG for entity resolution.** Use wiki pages + explicit wikilinks for entity relationships. The KG is useful for simple temporal triples but not for complex entity management.
- **Update all token budget references** from 170 to 600-900 tokens for wake-up.

### Consider (future)
- **Alternative backends.** The MemoryStore interface means we can test alternatives: Qdrant (better metadata filtering, production-grade), plain SQLite + FTS5 (simpler, no vector DB), or pgvector (if we ever need multi-machine). The interface abstraction makes this a one-file swap.
- **Hybrid search.** MemPalace has no BM25/FTS fallback. Adding hybrid search (vector + keyword) would improve retrieval for exact-match queries. The `qmd` tool mentioned in Karpathy's wiki pattern does this.

---

## Wiki Pages to Update

| Page | Change |
|------|--------|
| `wiki/tools/tool-mempalace.md` | Remove "highest-scoring" claim. Add AAAK/rooms regression scores. Note benchmark measures ChromaDB not palace. Flag KG limitations. |
| `wiki/concepts/concept-aaak-compression.md` | Change "30x lossless" → "30x lossy (12.4% retrieval quality drop)". Remove "zero information loss". |
| `wiki/concepts/concept-token-economics.md` | Change "~170 tokens" → "~600-900 tokens" for wake-up. |
| `wiki/segments/segment-memory.md` | Update L0+L1 token budget. Note contradiction detection is V4-implemented, not MemPalace-provided. |
| `wiki/index.md` | Update tool-mempalace entry description. |
| `wiki/segments/segment-janitor.md` | Note WikiScythe contradiction detection must be self-implemented. |
| Opus build brief | Update any MemPalace references. Note MCP tool names may differ from assumed names. |

---

## Bottom Line

The MemPalace issues are a credibility problem for MemPalace, not an architecture problem for V4. Our MemoryStore interface was designed specifically to insulate us from backend fragility — and it works exactly as intended. The adjustments are: correct our wiki claims, adjust token budgets, implement contradiction detection ourselves, and don't use AAAK for quality-critical retrieval. ChromaDB underneath is genuinely strong, the MCP server works, and the organizational metaphor is still useful. The foundation holds.
