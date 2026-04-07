# Wiki Tiering

> Flagged as needed by: [[review-opus-review1]]

## The Problem

The wiki grows indefinitely. Every clone output gets atomized into pages. After 6 months: 500+ pages. `index.md` becomes too large for the Brain's token budget. Semantic search slows. Startup fails budget constraints.

**Index hard cap: 500 tokens.** This constrains total indexed pages to ~80-100 at 5 words per entry.

## Tier Structure

| Tier | Age | Index Status | Access Method |
|------|-----|-------------|---------------|
| **Hot** | Last 30 days | Always in `index.md` | Loaded on Brain startup |
| **Warm** | 31-90 days | Not in index | Searched on demand via MemPalace |
| **Cold** | 90+ days | Archive only | MemPalace retrieval only |

## Rules

- Each `index.md` entry: **5-word description maximum** — not a sentence
- Past ~100 hot pages: restructure to two-tier index — category summaries always loaded, per-category detail pages loaded on demand
- MemPalace hot/warm/cold wings map directly to wiki page tiers

## Janitor Responsibility

The Janitor's lint pass includes a **"compress and archive" operation**:
1. Identify pages not accessed in 30+ days
2. If warm → cold: move to `wiki/archive/`, remove from search index, push to MemPalace cold storage
3. If hot → warm: remove from `index.md`, flag as on-demand only
4. Update cross-references to archived pages to note archive status

## Index Two-Tier Structure (when needed)

```
index.md (always loaded — category summaries only)
├── segments/ — 6 pages [Memory, User Agent, Brain, Clones, Janitor, Forge]
├── concepts/ — N hot pages [...]
├── tools/ — N hot pages [...]
└── decisions/ — N hot pages [...]

wiki/index-concepts.md (loaded on demand)
wiki/index-tools.md (loaded on demand)
wiki/index-decisions.md (loaded on demand)
```

## Implementation Phase

Phase 6 (Janitor) — the archive/compress operation is a Janitor responsibility. But the tier structure and file layout should be designed in Phase 1 so pages are organized correctly from the start.

*See also: [[concept-wiki-pattern]], [[segment-janitor]], [[segment-memory]], [[segment-brain]]*
