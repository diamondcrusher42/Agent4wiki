# Clone Skill Templates

> Per-skill instruction sets for [[segment-clones]] that improve over time.

Each skill type (code, docs, research, devops, qa, health, accounting, telegram,...) has a template at `brain/templates/{skill}.md`. Templates follow the shared preamble + specialization pattern from [[tool-hstack]]: common base (rules, voice via [[concept-soul-md]], protocols) plus skill-specific instructions.

Templates are versioned. [[segment-forge]] A/B tests alternatives via [[concept-shadow-benchmarking]]. When a new template version consistently produces better clone outputs, it gets promoted. Old versions archived with performance scores in `forge/briefs/history/`.

Templates include credential requirements that [[tool-keychain-agent]] fulfills via scoped injection.
