# Agent4wiki

**Agent V4 Architecture — Living Knowledge Base**

A Karpathy-pattern wiki mapping the full architecture of the next agent build. Six segments, ten concepts, seven tools, two entities, three decisions — all interlinked.

> This is a compiled artifact, not a document dump. Knowledge is ingested once, structured, and compounds over time.

---

## Architecture in one line

> Six specialized segments. One brain that never executes. Unlimited parallel clones. A forge that makes everything better.

```
Memory (The Vault)          — persists everything, zero runtime tokens
User Agent (Virtual Clone)  — always-on, guards credentials, minimal tokens
Brain (The Architect)       — plans, delegates, never executes
Clones (Special Ops)        — one mission, full context, disposable
Janitor (The Muscle)        — doubts everything, prunes, audits
Forge (Improvement Engine)  — shadows every process, ratchets quality upward
```

---

## Structure

```
Agent4wiki/
├── CLAUDE.md          ← wiki schema, conventions, operations
├── README.md          ← this file
├── raw/               ← immutable source documents (add new sources here)
└── wiki/
    ├── index.md       ← master catalog of all pages
    ├── log.md         ← append-only operation record
    ├── segments/      ← one page per architecture segment (6 total)
    ├── concepts/      ← cross-cutting ideas (10 pages)
    ├── tools/         ← external tools and repos (7 pages)
    ├── entities/      ← hardware, bots, infrastructure (2 pages)
    └── decisions/     ← architectural decisions with rationale (3 pages)
```

---

## Quick Navigation

| Type | Pages |
|------|-------|
| Segments | [Memory](wiki/segments/segment-memory.md) · [User Agent](wiki/segments/segment-user-agent.md) · [Brain](wiki/segments/segment-brain.md) · [Clones](wiki/segments/segment-clones.md) · [Janitor](wiki/segments/segment-janitor.md) · [Forge](wiki/segments/segment-forge.md) |
| Concepts | [Token Economics](wiki/concepts/concept-token-economics.md) · [Mission Briefs](wiki/concepts/concept-mission-briefs.md) · [Shadow Benchmarking](wiki/concepts/concept-shadow-benchmarking.md) · [AAAK Compression](wiki/concepts/concept-aaak-compression.md) · [Git Worktrees](wiki/concepts/concept-git-worktrees.md) · [Soul.md](wiki/concepts/concept-soul-md.md) · [Wiki Pattern](wiki/concepts/concept-wiki-pattern.md) · [Clone Skill Templates](wiki/concepts/concept-clone-skill-templates.md) · [Fallback Chains](wiki/concepts/concept-fallback-chains.md) · [Summary Pipeline](wiki/concepts/concept-summary-pipeline.md) |
| Tools | [MemPalace](wiki/tools/tool-mempalace.md) · [LLM Wiki](wiki/tools/tool-llm-wiki.md) · [BitNet](wiki/tools/tool-bitnet.md) · [Keychain Agent](wiki/tools/tool-keychain-agent.md) · [last30days](wiki/tools/tool-last30days.md) · [hstack](wiki/tools/tool-hstack.md) · [AI Personal OS](wiki/tools/tool-ai-personal-os.md) |
| Entities | [Hardware](wiki/entities/entity-hardware.md) · [Telegram Bots](wiki/entities/entity-telegram-bots.md) |
| Decisions | [Six Segments](wiki/decisions/decision-six-segments.md) · [Brain Never Executes](wiki/decisions/decision-brain-never-executes.md) · [Forge Independence](wiki/decisions/decision-forge-independence.md) |

---

## How to use this wiki

**Ingest a new source:**
Add the raw document to `raw/`, then create or update pages in `wiki/`, add to `wiki/index.md`, and append to `wiki/log.md`.

**Query:**
Read `wiki/index.md` → follow wikilinks to relevant pages → synthesize. Good answers can be filed back as new pages.

**Lint:**
Check for contradictions, stale claims, orphan pages, missing cross-references. The Janitor segment owns this.

See `CLAUDE.md` for full schema and conventions.

---

*28 pages · last updated 2026-04-07 · sources: 7 repos + 1 architecture session*
