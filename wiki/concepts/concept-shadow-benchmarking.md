# Shadow Benchmarking

> Core mechanism of [[segment-forge]].

Every production process has an independent shadow that runs the same task with a different approach. Both get identical inputs, both produce outputs, both are graded. When the shadow wins 5+ consecutive rounds, the Forge proposes promotion to [[segment-brain]].

The old production process becomes the new benchmark target. New shadow tries to beat it. The ratchet only turns one direction: better.

The Forge never modifies production directly — see [[decision-forge-independence]]. Failed shadows are archived with learnings, not discarded.

Related: [[segment-forge]], [[concept-mission-briefs]], [[concept-clone-skill-templates]]
