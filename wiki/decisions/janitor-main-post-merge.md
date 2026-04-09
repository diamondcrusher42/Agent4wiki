# Janitor Audit — agent4wiki main (post-merge, 2026-04-09)

> Model: Haiku + extended thinking
> Target: main branch, commit 4f92c91
> Tool: agent-janitor v1.0.1
> Date: 2026-04-09

## Verdict: SUGGEST — CLEAN MERGE

**BLOCK findings: 0**
**Adjusted health score: ~64/100** (raw 0 is a scoring artifact from 45 SUGGESTs flooring the formula)

## Findings by Category

| Severity | Raw | Real | False Positive |
|----------|-----|------|----------------|
| BLOCK | 0 | 0 | 0 |
| SUGGEST | 45 | ~29 | ~16 |
| NOTE | 24 | ~7 | ~17 |

## Real SUGGEST Items

### High value
1. **bin/agent4.ts:15,23,29** — all 3 CLI commands (start/status/audit) are unimplemented stubs. Main binary entrypoint is hollow.
2. **brain/dispatcher.py** + **core/clones/lifecycle/** — no dedicated test coverage for core orchestration and clone lifecycle.

### Medium value
3. **wiki/decisions/plan-build-v1.md:662** — `sk-ant-api03-my-real-key` in test code example. Not a real key, but should be changed to `sk-ant-EXAMPLE-key` to avoid future scanner hits.
4. **core/janitor/auditor.ts:131**, **core/memory_store/mempalace_adapter.ts:3**, **core/user_agent/agent.ts:291**, **tools/benchmark_score.py:182** — implementation placeholders.
5. **Broken wikilinks**: `decision-directory-scaffold.md` → `[[raw/master_directory_proposal.md]]` (raw/ excluded); `review-opus-review1.md` → `[[references]]` (not found).

## False Positives (confirmed)
- 3 TEMP hits: match `TEMPLATES` path constant, not temp code
- 5+ `[[ -f file ]]` bash conditionals parsed as wikilinks
- 17 dead-code NOTEs: multi-line dict literals and except/else branches misread as unreachable

## NOTE Items
- **Orphan pages (7)**: CLAUDE.md + Soul.md (intentional standalone); 5 new merge docs not yet linked in index
- **Dead code (17)**: all false positives (see above)

## Top Action Items (not blocking)
1. Wire `bin/agent4.ts` CLI commands — three stubs need real implementation
2. Link 5 new decision docs to wiki/index.md
3. Redact example key in plan-build-v1.md:662
4. Add tests for brain/dispatcher.py and core/clones/lifecycle/
