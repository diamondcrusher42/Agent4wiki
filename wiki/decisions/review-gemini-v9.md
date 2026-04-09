# Gemini Review — agent4wiki v9

**Date:** 2026-04-09
**Reviewer:** Gemini (via Jure)
**Build:** v9 (plan-build-v9 complete, 211 tests passing)
**Purpose:** Pre-testing structured multi-perspective code review

---

## 1. Brain (Routing & Planning)

**Good:** ComplexityClassifier correctly implements two-pass system — hardcoded unambiguous patterns checked before LLM fallback.

**Bad:** `PromptBuilder` uses `.replaceAll()` for injecting variables like `{INJECT_TASK_HERE}`. Highly vulnerable to prompt injection if user input or task objective contains those exact template strings.

**Optimization:** Offload Haiku routing fallback to local LLM via Ollama — eliminates external network latency and API costs for basic classification.

---

## 2. User Agent (Interface & Memory)

**Good:** Conversation history auto-truncates at 50 messages to prevent token bloat. Context summarization is efficient.

**Bad:** State flushing tied to turn counts (every 10 turns). Rigid logic misses natural semantic boundaries.

**Untested:** MemPalaceAdapter relies on MCP client over stdio. Production testing with Qdrant at scale needed to ensure L2/L3 tier retrieval doesn't become a bottleneck under load.

---

## 3. Clone (Execution Sandbox)

**Good:** git worktree parallelization is fast and lightweight alternative to full VMs.

**Ugly:** CloneRunner launches Claude CLI subprocess and reverse-iterates stdout to parse JSON handshake. **Fragile** — any unexpected debug logs, warnings, or markdown will break the parser and hang the pipeline.

**Security:** Git worktrees don't provide true isolation. Docker containers would be strictly superior, especially when clones interface with external network scripts or pentesting tools.

---

## 4. Forge (Evaluation & A/B Testing)

**Good:** ForgeRatchet uses 5-win streak + SQLite ForgeMetricsDb to safely track metrics and promote templates.

**Untested/Unproven:** Auto-executing `git tag` and committing template promotions based purely on LLM-as-judge evaluations is unproven at scale. If Janitor fails to block a subtle regression, the main branch will be **automatically poisoned**.

---

## 5. Janitor (Audit & Maintenance)

**Good:** TOCTOU race condition fix in `scanForLeaks()` is production-grade — opens fd before symlink boundary check.

**Bad:** Structural mess detection relies on naive keyword matching (`warn_keywords` list with terms like "hacky", "slow").

**Low-hanging fruit:** WikiScythe runs `git log --format=%ct` subprocess per file individually. Batching into single git tree query would drastically optimize execution time.

---

## Cross-Cutting: Security & Usability

**Credential Handling:** AES-256-GCM vault is cryptographically solid. BUT: provisioning plaintext `.env` into worktree before execution leaves credentials exposed if process crashes before teardown runs.

**Network Topology:** Dispatcher routes to fleet nodes via raw SSH/SCP. Tailscale mesh VPN would provide significantly safer inter-node communication and prevent lateral movement across fleet.

---

## Extracted Action Items

| Priority | Issue | File/Area | Fix |
|---|---|---|---|
| CRIT | Prompt injection via `.replaceAll()` template vars | PromptBuilder | Use structured object injection, not string replace |
| HIGH | CloneRunner JSON parse from stdout fragile | core/clones/runner | Use structured exit code + file-based handshake |
| HIGH | `.env` in worktree before teardown = credential exposure | clone lifecycle | Write creds to tempfs / delete on first read |
| MED | State flush every 10 turns misses semantic boundaries | user_agent | Token-count or semantic trigger instead |
| MED | WikiScythe git log per file → batch | core/janitor | Single `git log --name-only` instead |
| MED | Forge auto-promotion unproven at scale | forge/ratchet | Add human-in-the-loop confirmation gate for first N promotions |
| LOW | Structural mess detection: naive keyword list | core/janitor | Regex + AST-level checks |
| LOW | Tailscale for fleet nodes | infra | Not blocking for testing |
| INFO | Ollama local routing fallback | brain | Nice optimization, not blocking |
| INFO | Docker isolation for clones | core/clones | Not blocking for initial testing |
