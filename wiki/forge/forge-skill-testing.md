# Forge Skill Testing Framework

> Source: Jure 2026-04-09, refined with Gemini
> Concept: Test and compare Claude Code skills the same way the Forge tests model × effort — git worktrees, structured prompts, scored outputs

## The idea

Skills are like models — different prompts produce different quality. The Forge already tests prompts against different effort levels and models. The same methodology applies to skills: take the same real-world task, run it through several skill variants in isolated worktrees, score the output, promote the winner.

Unlike model benchmarks (where the task is fixed), skill testing often means the task format changes too — you're testing whether the skill prompt produces the right cognitive framing in the agent, not just the right output.

## Methodology: Git Worktree per skill variant

```bash
# Establish base state with clean input data
git worktree add ../skill-test-variant-A
git worktree add ../skill-test-variant-B
git worktree add ../skill-test-control

# Each worktree gets:
# 1. The raw input (wiki data, JSON, markdown)
# 2. The skill under test (copy of SKILL.md into the session)
# 3. The standardized user prompt
# 4. Commit raw output before any manual edits
```

Key rule: commit the raw output before touching it. You want to grade what the AI produced, not what you fixed.

## Standardized prompt structure

```
PERSONA: [who the AI is playing]
TASK: [the concrete deliverable]
INPUT: [raw data — wiki pages, JSON, markdown]
CONSTRAINTS: [tech stack, file size, no new deps, etc.]
SUCCESS CRITERIA: [what passing looks like]
```

---

## First test case: Front-End Design Skill (website for agent-janitor)

**Target:** Transform `diamondcrusher42/agent-janitor` wiki data into a high-converting GitHub Pages site.

**Stack:** React, Tailwind CSS, Framer Motion

**Variants to test:**
- `skill-test-baseline` — current frontend-design skill, no changes
- `skill-test-aggressive-cta` — emphasize conversion, CTAs, urgency
- `skill-test-edu-focus` — emphasize education, documentation, trust

**Input data:**
- `docs/wiki/what-the-janitor-finds.md`
- `docs/wiki/sample-reports.md`
- `docs/wiki/upgrades.md`
- README.md (use cases, health score)

**Standardized prompt:**
```
You are a senior product designer and React engineer. Transform the provided wiki data into a stunning, high-converting landing page for agent-janitor.

Stack: React + Tailwind CSS + Framer Motion (no other dependencies)
Structure: Hero (value prop) → How it Works → Interactive sample report → Use cases → CTA

The page should make a developer immediately understand: (1) what the Janitor finds that ESLint doesn't, (2) why that matters, (3) how to install it in 30 seconds.
```

**Output location:** `docs/index.html` (or React build targeting `docs/`)

---

## Evaluation scorecard (Gemini-refined)

See `forge/skill-eval-scorecard.md` for the full scoring template.

### Quick scoring (1-5 per category):

| Category | Evaluation Criteria |
|---|---|
| Value Communication | Hero immediately clarifies what tool does. Language is benefit-driven, not feature-listing. |
| Conversion & CTAs | CTAs strategically placed, visible, logically integrated into user flow. |
| Visual Hierarchy | Typography H1→H2→Body clear. Whitespace prevents cognitive overload. |
| Interaction & Polish | Interactive elements give immediate visual feedback. Animations purposeful, not decorative. |
| Component Architecture | Code modular, DRY, well-structured. React hooks used appropriately. |
| Responsiveness | Layout breaks gracefully on mobile. Touch targets adequately sized. |
| **Total** | **/ 30** |

**Decision gate:** Variant scoring ≥ 24/30 → promote to `frontend-design` skill. Gap ≥ 4 between variants → the prompt framing matters significantly, run more variants.

---

## Broader skill testing queue

| Skill | Test type | Status |
|---|---|---|
| `frontend-design` | UI output quality + conversion score | Queued (first run) |
| `webapp-testing` | Playwright test coverage vs missed bugs | Planned |
| `code-review` | Finding overlap with Janitor + Opus reviews | Planned |
| `architect` | Plan quality scored against actual implementation | Planned |
| `janitor` (2-tier) | Model × effort quality matrix | Queued (Q1) |

---

## What makes skill testing different from model benchmarks

| Dimension | Model benchmark | Skill test |
|---|---|---|
| Variable | Model, effort level | Skill prompt framing |
| Fixed | Task, success criteria | Model, effort level |
| Output | Task correctness score | Output quality + score |
| Promotion | Routing rules in config | Skill SKILL.md rewrite |
| Ratchet | Model config updated | Skill file versioned |

Both feed back into the same Forge improvement loop — the outputs are different (model routing vs skill prompt) but the methodology is the same.
