# Token Economics

> How tokens are budgeted across the six segments.

## Model Tiers

| Tier | Model | Used By |
|------|-------|---------|
| Cloud premium | Claude/Opus or Claude/Sonnet | [[segment-brain]], critical [[segment-clones]] |
| GPU local | Nemotron on RTX 3090 | Specialized clones, sensitive data |
| CPU local | [[tool-bitnet]] 2B | Routine clones, [[segment-user-agent]], [[segment-janitor]], [[segment-forge]] monitoring |

## Key Principle

Expensive models for judgment, free models for grunt work. Brain gets the best. Routine clones and monitoring run for free on BitNet. User Agent never resets because it runs on a tiny always-on local model consuming only summaries via [[concept-summary-pipeline]].

Wake-up cost for full world context: ~170 tokens via [[concept-aaak-compression]].
