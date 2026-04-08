# AAAK Compression

> Source: [[tool-mempalace]]

A lossy shorthand dialect designed for AI agents. Not meant to be read by humans — meant to be read by AI, fast. ~30x compression but **not lossless**: independent benchmarks show a 12.4 percentage-point retrieval quality drop (LongMemEval: raw 96.6% → AAAK 84.2%). Works with any model that reads text (Claude, GPT, Gemini, Llama, Mistral). No decoder, no fine-tuning needed.

Example: ~1000 tokens of English about a team and project compresses to ~120 tokens of AAAK. AI learns the dialect automatically from the MemPalace MCP server.

> ⚠️ **AAAK is not zero-loss.** Use raw mode for quality-critical retrieval (Brain planning, Clone context assembly). Use AAAK only where speed matters and 84% recall is acceptable (e.g., quick context injection for droids).

> Source: [[review-mempalace-issues]] (independent benchmark by lhl + gizmax, confirmed reproducible)

Used in [[segment-memory]] for L1 critical facts layer (~120 tokens) and closet storage in the palace. Total wake-up cost: **~600-900 tokens** for full world context (MemPalace `wake-up` command confirmed by independent benchmark — not the originally claimed 170). See [[concept-token-economics]].
