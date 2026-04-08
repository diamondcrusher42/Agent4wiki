# AI Front-End Skill Evaluation Forge

## Objective
Systematically test and compare AI skill prompt variants transforming raw GitHub wiki data into a high-converting, user-friendly front-end interface.

**Target Stack:** React, Tailwind CSS, Framer Motion

---

## Testing Methodology (Git Worktree Setup)

Use Git worktrees for isolated, controlled testing per skill variant.

1. **Establish Base State:** Main branch contains clean raw wiki data (JSON/Markdown).
2. **Initialize Worktrees:**
   ```bash
   git worktree add ../ui-test-claude-baseline
   git worktree add ../ui-test-claude-aggressive-cta
   git worktree add ../ui-test-claude-edu-focus
   ```
3. **Standardize the Prompt:** Define persona, tech stack constraints, feed raw data.
4. **Execute and Commit:** Run generated code in specific worktree. **Commit raw output before any manual edits.**

---

## AI Execution Checklist
*Include directly in system prompt to force AI self-verification before outputting code.*

- [ ] **Data Ingestion:** Successfully parse provided wiki data without losing technical accuracy.
- [ ] **Architecture Setup:** Logically separate UI components from business logic and data parsing.
- [ ] **Wireframing the Flow:** Structure page logically: Hero (Value Prop) → How it Works → Interactive Tool → Social Proof / Wiki Details → Final CTA.
- [ ] **State Management:** Implement robust React state handling for interactive elements (calculators, filters, dynamic forms).
- [ ] **Design System Adherence:** Strictly apply Tailwind utility classes for consistent typography, spacing, and brand colors.
- [ ] **Micro-interactions:** Add purposeful Framer Motion animations that enhance (not distract from) the user experience.

---

## Evaluation Scorecard

Grade each worktree iteration out of 5 points per category.

| Category | Evaluation Criteria | Score (1-5) | Notes |
|:---|:---|:---|:---|
| Value Communication | Does Hero immediately clarify what tool does? Is language benefit-driven? | | |
| Conversion & CTAs | Are CTAs strategically placed, highly visible, logically integrated into user flow? | | |
| Visual Hierarchy | Is typography (H1→H2→Body) clear? Sufficient whitespace to prevent cognitive overload? | | |
| Interaction & Polish | Do interactive elements give immediate visual feedback? Are animations smooth and purposeful? | | |
| Component Architecture | Is code modular, DRY, well-structured? Are React hooks used appropriately? | | |
| Responsiveness | Does layout break gracefully on mobile viewports? Are touch targets adequately sized? | | |

**Total Score: ___ / 30**

### Decision gate
- ≥ 24/30 → promote skill variant
- Gap ≥ 4 between variants → prompt framing matters significantly, run more variants
- Gap < 2 → skill prompt has low impact on this metric, focus on other variables

### Reviewer Notes
*Document: manual interventions required, hallucinated dependencies, brilliant independent design choices.*

```
Variant: ________________
Run date: ________________
Model × effort: ________________

Manual interventions:
-
-

Hallucinated deps:
-

Standout independent choices:
-
```

---

## Scoring history

| Date | Variant | Score | Promoted? | Notes |
|---|---|---|---|---|
| — | — | — | — | First run pending |
