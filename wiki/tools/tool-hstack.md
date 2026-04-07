# hstack (Health Specialists)

Four Claude Code health skills: prepare-for-visit (patient advocate), understand-results (lab interpreter), summarize-research (R&D scout), discuss-case (ER doc triage). By Ben Kamens (ex-Khan Academy).

Key patterns stolen: shared preamble + specialist SKILL.md → maps to [[concept-clone-skill-templates]]. Subagent separation (clinical truth in separate context, then human delivery wraps it) → raw analysis clone + shaped delivery clone. Red/yellow/green severity framework → [[segment-janitor]] audit severity. LLM eval tests ($0.10/run) → [[segment-forge]] quality benchmarking.

github.com/kamens/hstack. MIT license.

## Used By
[[segment-clones]] (health skill), [[segment-janitor]] (severity pattern)
