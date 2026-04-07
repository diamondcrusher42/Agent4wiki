# Decision: Brain Never Executes

## The Rule
If [[segment-brain]] is writing code, editing files, or running commands, the architecture is broken.

## Why
The Brain's context window is the most expensive resource in the system (Cloud API, premium model). Every token spent on execution is a token not spent on planning. Planning quality directly determines [[segment-clones|clone]] output quality. A Brain that executes becomes a bottleneck — it can only do one thing at a time. A Brain that delegates can dispatch 10 clones in parallel.

## The Pattern
Brain creates [[concept-mission-briefs]]. [[segment-clones]] execute. Brain reviews results. This separation scales. Execution doesn't.
