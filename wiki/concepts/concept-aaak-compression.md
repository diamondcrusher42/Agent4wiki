# AAAK Compression

> Source: [[tool-mempalace]]

A lossless shorthand dialect designed for AI agents. Not meant to be read by humans — meant to be read by AI, fast. 30x compression, zero information loss. Works with any model that reads text (Claude, GPT, Gemini, Llama, Mistral). No decoder, no fine-tuning needed.

Example: ~1000 tokens of English about a team and project compresses to ~120 tokens of AAAK. AI learns the dialect automatically from the MemPalace MCP server.

Used in [[segment-memory]] for L1 critical facts layer (~120 tokens) and closet storage in the palace. Total wake-up cost: ~170 tokens for full world context. See [[concept-token-economics]].
