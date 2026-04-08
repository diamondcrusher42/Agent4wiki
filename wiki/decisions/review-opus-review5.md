# Review: Opus Janitor Audit — Early State + Current Cross-Reference

> Source: raw/Opus-review5-janitor-audit.md | Reviewer: Claude Opus | Audit date: 2026-04-08
> NOTE: This review was written against an early repo state (6 commits, wiki-only, pre-engine code).
> Many findings have since been addressed. Status column reflects current repo state as of 2026-04-08.

System health score at time of audit: 14/25 (early state — engine code not yet present)

---

## 🔴 RED Findings

### R1. The repo is two things pretending to be one.

**Status: DECIDED — Monorepo chosen. Documented here.**

The audit argued for splitting agent4wiki (wiki-only) and agent4engine (executable code) into two repos, noting that wiki is a compiled knowledge artifact agents *read* while the engine is executable code agents *run*. The concern: a commit modifying core/ could corrupt wiki/ in the same commit; CI tests shouldn't trigger from wiki linting.

**Decision: Stay monorepo.** Rationale:
1. The engine code and wiki are tightly coupled by design — the Brain reads wiki context at runtime, the Janitor validates against wiki-documented contracts, and templates/ contains both wiki knowledge and runtime artifacts. Splitting creates a sync problem.
2. Engine code was already committed before this audit. Splitting 6+ months into development would require rewriting git history or creating a messy submodule dependency.
3. The tight coupling is intentional: wiki pages document the contracts that the code implements. When a contract changes, the wiki and code should update in the same commit — that's the point.
4. The Opus concern about Janitor lint triggering CI tests is a CI configuration problem, not a repo structure problem. Solution: separate GitHub Actions jobs with `paths:` filters — `wiki/**` triggers linting, `core/**` triggers TypeScript compilation.

**Mitigation in place:** `.gitignore` enforces the three-zone separation (core/ committed code, state/ gitignored runtime, wiki/ committed knowledge). The three zones don't mix at runtime even if they share a repo.

---

### R2. README claims "28 pages" but unverified.

**Status: FIXED.** README now tracks current page count (53 pages as of this log entry). wiki/log.md records every ingest operation. A wiki-lint.sh script has been created (`scripts/wiki-lint.sh`) to verify .md count vs index entries.

---

### R3. wiki/log.md has no entries since initial creation.

**Status: FIXED.** log.md now has 25+ entries recording every ingest, decision, implementation, and review. Logging is part of the standard ingest workflow.

---

## 🟡 YELLOW Findings

### Y1. Wiki pages reference concepts that don't have their own pages.

**Status: PARTIAL.**

- `[[concept-inter-agent-protocol]]` — **EXISTS.** Created during Opus review 1 ingest. Documents MCP-based JSON-lines event protocol.
- `[[concept-dispatcher]]` — **EXISTS.** Full implementation reference including dispatcher.py structure and CLI modes.
- `[[concept-routing-classifier]]` — **DOES NOT EXIST.** The routing classifier is documented in [[segment-user-agent]] and [[concept-mission-briefs]] but no dedicated page. The wikilink appears in [[concept-dispatcher]].
- `[[concept-clone-lifecycle]]` — **DOES NOT EXIST.** Clone lifecycle is documented in [[segment-clones]] and the Gemini review 6 notes (spawner/runner/teardown) but no dedicated concept page. The complete lifecycle is in [[review-gemini-review6]].

**Directive:** Either create dedicated pages for routing-classifier and clone-lifecycle, or remove the orphan wikilinks and point to the existing content. Recommend creating both — they're rich enough to warrant standalone pages.

---

### Y2. Architecture spec and individual wiki pages have content drift.

**Status: OPEN.** The original architecture spec (`raw/Architecture-session.md` or equivalent) is not actively maintained. Individual wiki pages are the source of truth. The pattern to resolve: wiki pages win. The spec pages (plan-implementation-v4.md, etc.) document a point-in-time plan, while segment and concept pages reflect current design.

**Decision recorded:** Wiki pages are authoritative. Review/plan/decision pages in `wiki/decisions/` are point-in-time snapshots with cross-references. No attempt is made to keep them in sync — that's the purpose of the log.

---

### Y3. Tool pages include stale stats (star counts, commit counts).

**Status: FIXED (pre-existing state).** The current tool-mempalace.md does not contain star or commit counts. The "6 commits, 11 stars" reference was in the early-state repo that the audit reviewed. Current tool pages document capability mapping and repo URLs only, not vanity metrics.

---

### Y4. CLAUDE.md schema doesn't reflect implementation files.

**Status: PARTIAL.** `wiki/CLAUDE.md` documents wiki operations (ingest/query/lint), page format, wikilink convention, and token budget. It does not yet include the implementation contract summaries (TASK template format, Keychain flow, Janitor handshake format, dispatcher behavior).

**Directive:** Add a section to `wiki/CLAUDE.md` listing: TASK template JSON format, Janitor handshake fields, Keychain JIT flow, dispatcher task types, and where to find each contract. This is high-value context for any new Claude session reading the wiki.

---

### Y5. No .env.example exists yet.

**Status: FIXED.** `.env.example` was created during the master_directory_proposal ingest. All required vars documented with placeholder values and comments.

---

## 🟢 GREEN Observations

**G1. Wiki link structure is sound.** — Confirmed still true at 53 pages.

**G2. Gitignore design is defense-in-depth correct.** — Upgraded since this audit: `state/**` pattern (not `state/*`) with nested directory un-ignoring via `!state/**/` sentinel. Python artifacts, events/*.jsonl, and vault backup patterns also added.

**G3. Three-zone separation is clean architecture.** — Confirmed. Still the organizing principle. State Vault boundary documented in wiki/decisions/review-opus-review4.md.

**G4. README navigation table is useful and accurate.** — Confirmed. README fully rewritten post-audit with honest current-state tables (real code vs stubs), known bugs, and phased launch checklist.

---

## Open Action Items (from this audit, not yet resolved)

| Item | Priority | Effort |
|------|----------|--------|
| Create [[concept-routing-classifier]] page or remove orphan links | Medium | 15 min |
| Create [[concept-clone-lifecycle]] page or remove orphan links | Medium | 15 min |
| Add implementation contracts section to wiki/CLAUDE.md | Medium | 20 min |
| Add CI `paths:` filter config to prevent wiki lint triggering TypeScript CI | Low | 10 min |

*See also: [[review-code-audit-1]], [[decision-directory-scaffold]], [[review-gemini-review7]]*
