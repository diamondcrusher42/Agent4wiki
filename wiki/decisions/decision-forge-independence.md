# Decision: Forge Independence

## The Rule
[[segment-forge]] never modifies production directly. It builds shadows, runs benchmarks, proposes changes, presents evidence. [[segment-brain]] decides whether to promote.

## Why
An improvement engine that can directly modify the system it's improving is dangerous. Untested changes destabilize working processes. The Forge's job is to prove a better approach exists, not to deploy it.

This is the same reason QA doesn't deploy to production. The same reason R&D proposes and the CEO signs off.

## The Ratchet
Because promotion requires proof (5+ consecutive [[concept-shadow-benchmarking|shadow]] wins), and because old production becomes the new benchmark target, the system can only move in one direction: better. The Forge creates a ratchet against regression.
