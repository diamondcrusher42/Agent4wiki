# Skill Budget

> Source: [[review-skills-playbook]]
> Hard constraint: Claude Code silently drops skills beyond ~28 **per project context** with no error feedback.
> This is NOT a global repository limit — you can maintain a library of 50+ skills and rotate them per project.

## The 28-Skill Ceiling

Claude Code has a hard runtime limit of ~28 active skills **per project context** (skills loaded from `.claude/skills/` for that project + user-level `~/.claude/skills/`). Skills beyond this cap are silently dropped — no warning, no log entry, no indication of which skill was lost. A single new addition can break an unrelated skill elsewhere.

**This is a per-project constraint, not a global one.** The right architecture:
- **Skill library** — unlimited. Store all skills here, version-controlled and audited.
- **Clone worktrees** — each clone gets 1 primary skill + 1-3 complementary skills for its specific mission. Code clone: code + review. Browser clone: browser + scraping. No ceiling issues.
- **Handoff = skill set swap** — when a task crosses domains, hand off to the next agent with a different skill set rather than loading all skills into one agent.

**Design principle: one agent, one mission, one skill set.** The 28-skill ceiling is irrelevant at the clone level — you'll never approach it with 1-5 focused skills per clone. The constraint only matters if you try to make a single agent do everything, which is the wrong pattern anyway.

**Safe operating range per project:** 25 active skills + 3-4 buffer slots. Never exceed 25 without auditing what's already installed.

**Janitor responsibility:** Monthly inventory audit of `.claude/skills/` vs the budget tracker. The Janitor flags any approach to the 25-skill ceiling and recommends removals before additions.

## The 4-Gate Filter

Every skill candidate must pass all four gates in sequence. Failure at any gate = rejection.

| Gate | Check | Failure Condition |
|------|-------|-------------------|
| 1. Source | Origin and authorship | No verifiable author, no repo, no history |
| 2. Review | Full SKILL.md read | Broad Bash(*)/Write(*) permissions, network calls, obfuscation |
| 3. Performance | Test harness run | Fails >1 of 6 scoring dimensions |
| 4. Security scan | Cisco scanner + LLM-on-LLM | YARA hit OR Nemotron flags goal hijacking |

## Segment-to-Skill Mapping

Skill slots are budgeted per segment — prevents sprawl by anchoring every installation to an architectural role.

| Segment | Skill needs | Budget |
|---------|-------------|--------|
| Brain | Sequential Thinking MCP, planning patterns | 2 |
| Clones | Domain-specific execution (code, browser, data) | 8-10 |
| Janitor | Audit checklists, security scanning | 2-3 |
| Forge | Benchmark protocols, shadow runner helpers | 2-3 |
| Memory | MemPalace MCP, wiki tooling | 2 |
| User Agent | Classifier helpers, state management | 1-2 |
| Cross-segment | Best practices, CLAUDE.md helper | 2-3 |
| **Buffer** | Reserved — never fill | 3-4 |

## Graduation Pipeline

No skill enters production directly. Three stages:

### Stage 1: Quarantine (Sandboxed)
- Skill runs inside ephemeral Docker container: read-only worktree mount, `--network=none`, no access to `~/.ssh`, `~/.aws`, `~/.keychain-agent/`
- All 6 test dimensions must pass (see [[review-skills-playbook]])
- Minimum 5 successful executions required
- Duration: 1-2 weeks

### Stage 2: Probation (Monitored)
- Skill runs natively but with enhanced Forge logging
- Janitor audits every execution result
- Any regression triggers rollback to Quarantine
- Duration: 2-4 weeks

### Stage 3: Production (Trusted)
- Native execution, standard logging
- Forge continues weekly shadow benchmarks
- Version-locked in repo
- **Any update resets to Quarantine**

> The Forge owns this pipeline. The Janitor verifies. The Brain decides what ships. See [[review-skills-playbook]] for implementation detail.

## Security Threat Model

Skills are untrusted code from external sources. Research found ~20% contamination rate in one public registry audit. Five defense layers:

| Layer | Tool/Method | When |
|-------|------------|------|
| 1 — Manual review | Human reads full SKILL.md | Before any install |
| 2 — Static scan | Cisco `skill-scanner` (YARA + AST) + `aliksir/claude-code-skill-security-check` | Pre-commit hook + CI |
| 3 — Docker sandbox | Ephemeral container, `--network=none` | First 5 executions |
| 4 — LLM-on-LLM | Nemotron on RTX 3090 scans for goal hijacking, alignment manipulation | Weekly Forge audit |
| 5 — Keychain scoping | Per-skill credential mapping in `scopes.yaml` | Permanent |

**Key threat vectors for V4:**
- Credential harvesting (Brain/Memory have broadest access)
- Goal hijacking via embedded instructions in SKILL.md
- Supply chain malware in pinned dependency versions
- Indirect prompt injection via skill output that re-enters context

## Custom vs Public Skills

**Rule: Custom skills preferred.** Public skills only when custom authoring would take >2 hours.

Custom skills have zero supply chain risk, are perfectly tailored to V4 architecture, and are under full version control. The `skill-creator` meta-skill makes authoring fast.

## CLAUDE.md Architecture

Three-layer approach to prevent skill sprawl and context bloat:

1. **CLAUDE.md (<150 lines)** — Push-based enforcer. Identity, hard rules, pointers to skill library. Only file every session loads.
2. **Best-practices skill** — Pull-based reference. Coding standards, testing patterns, documentation templates. Loaded on-demand.
3. **Per-segment skills** — Each V4 segment gets its own skill with `disable-model-invocation: true` for destructive operations.

## Skill Description Optimization (ASO)

Agent Search Optimization determines whether skills fire automatically from natural prompts:

- Active voice, specific trigger phrases: "Analyze Django views for IDOR vulnerabilities" not "Django security analysis"
- Include negative boundaries: "Do NOT use for frontend components" prevents false triggers
- Test implicit invocation before committing: if skill only works via `/skill-name` but not from natural prompts, rewrite the description
- Keep under 1024 characters (schema enforces this, but shorter is better for semantic matching)
