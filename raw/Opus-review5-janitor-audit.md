# Opus Janitor Audit — Agent4wiki

Audit date: 2026-04-08
Scope: Full repo (6 commits — early state review)
System health score: 14/25

NOTE: This review was written against an early repo state (6 commits, wiki-only).
Many findings have since been addressed. Cross-references to current fixes noted in wiki/decisions/review-opus-review5.md.

---

## 🔴 RED — Act Now (3 findings)

**R1. The repo is two things pretending to be one.**

Agent4wiki started as the wiki (knowledge base). But the master directory proposal shows it becoming the full engine (core/, state/, bin/, config/). These are two different repos with two different purposes. The wiki is a compiled knowledge artifact that agents *read*. The engine is executable code that agents *run*. Mixing them means a clone modifying core/keychain/manager.ts could accidentally corrupt wiki/index.md in the same commit. And a Janitor lint pass on the wiki shouldn't trigger CI tests on the engine code.

DIRECTIVE: SPLIT. Two repos: agent4wiki (wiki only — stays as is) and agent4engine (the core/, state/, bin/, config/ structure from the directory proposal). The engine repo imports the wiki as a git submodule or reads it from a configured path. They share git history through worktrees, not through being the same repo.

**R2. README claims "28 pages" but this is unverified.**

The footer says "28 pages" but there's no automated check. If someone adds a wiki page and forgets to update index.md, or deletes a page without removing the index entry, the count drifts and wikilinks break silently. Right now nobody would know.

DIRECTIVE: ADD CHECK. A 10-line script that counts .md files in wiki/, compares to entries in index.md, and flags mismatches. Run it as a pre-commit hook or GitHub Action.

**R3. wiki/log.md has no entries since initial creation.**

The log is supposed to be append-only and record every operation. Seven design documents have been produced since the wiki was created. None were logged. The log is already stale on day one.

DIRECTIVE: UPDATE. Every document reviewed in this session should have a log entry. If logging feels like a chore, that's a signal the ingest workflow isn't automated yet.

---

## 🟡 YELLOW — Plan to Fix (5 findings)

**Y1. Wiki pages reference concepts that don't have their own pages.**

Several wikilinks point to pages that don't exist: [[concept-routing-classifier]], [[concept-clone-lifecycle]], [[concept-inter-agent-protocol]]. Orphan links are worse than missing pages — they promise context that doesn't exist.

DIRECTIVE: CREATE pages for routing-classifier, clone-lifecycle, and inter-agent-protocol. Or decide they don't warrant pages and remove the references.

**Y2. Architecture spec and individual wiki pages have content drift.**

The architecture spec was written as a monolith. Then individual segment/concept pages were created from it. Then the spec was updated (Forge added, phases updated, rules expanded). But individual wiki pages weren't updated to match. The spec has 5 phases, but no wiki page reflects the Phase 5 (Forge) addition.

DIRECTIVE: RECONCILE. Either the spec is source of truth (update pages to match), or wiki pages are source of truth (mark spec as "point-in-time, see wiki for current"). Don't maintain both as authoritative — they'll diverge further.

**Y3. Tool pages are already aging.**

tool-mempalace.md references "6 commits, 11 stars." That was accurate when ingested but is probably stale now. Tool pages that include stats will rot fastest.

DIRECTIVE: SIMPLIFY. Remove star counts and commit counts from tool pages. Keep only: what it does, how it maps to the architecture, and the repo URL. Stats are vanity; capability mapping is value.

**Y4. CLAUDE.md schema doesn't reflect the implementation files.**

The CLAUDE.md describes wiki operations (ingest, query, lint) but says nothing about the core/ engine, the TypeScript contracts, the dispatcher, or the Janitor's handshake format. If CLAUDE.md doesn't mention that the Janitor parses JSON handshakes or that the Keychain uses JIT injection, any Claude Code session has incomplete context.

DIRECTIVE: UPDATE CLAUDE.md to include a section on implementation contracts — brief descriptions of the TASK template format, the Keychain flow, the Janitor directives, and the dispatcher. Not the full code, just the contracts and where to find them.

**Y5. No .env.example exists yet.**

The directory proposal calls for one. It's referenced but doesn't exist. Anyone cloning the repo has no idea what credentials are needed.

DIRECTIVE: CREATE .env.example listing every key from scopes.yaml with placeholder values and comments.

---

## 🟢 GREEN — Clean (4 observations)

**G1. Wiki link structure is sound.** Every segment page links to relevant concepts and tools. Concepts link back to segments. The graph is well-connected.

**G2. Gitignore design is defense-in-depth correct.** The state/* exclusion with .gitkeep preservation, plus redundant .env and *.pem blocks, is the right pattern.

**G3. The three-zone separation (core/state/wiki) is clean architecture.** Committed code, gitignored runtime data, committed knowledge. Each zone has a clear owner and clear purpose.

**G4. README navigation table is useful and accurate.** Every link resolves to an existing file in the repo.

---

## RECOMMENDED ACTIONS (Priority ordered)

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| 1 | Decide: split into two repos or keep as one? | Decision | Prevents structural debt |
| 2 | Update wiki/log.md with all operations since creation | 15 min | Stops log rot on day one |
| 3 | Add wiki page count verification script | 20 min | Catches broken wikilinks |
| 4 | Reconcile spec vs wiki pages (pick one source of truth) | 30 min | Prevents content drift |
| 5 | Remove star/commit counts from tool pages | 10 min | Reduces maintenance burden |
| 6 | Create missing concept pages or remove orphan links | 20 min | No broken promises |
| 7 | Update CLAUDE.md with implementation contract summaries | 15 min | Better session context |
| 8 | Create .env.example | 5 min | Onboarding complete |

**ONE highest-leverage action:** Decide whether to split the repo. Everything else is maintenance. This is structural. If you split now (before any TypeScript is committed), it's free. If you split after 50 files of engine code are interleaved with wiki pages, it's expensive. Decide now.
