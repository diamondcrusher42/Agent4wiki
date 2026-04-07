# Fallback Chains

> Graceful degradation when services or credentials fail.

Defined in `config/fallback.yaml` within [[tool-keychain-agent]]. Each service has a priority-ordered provider list. If provider 1 fails, try provider 2, etc.

Example chain for LLM inference: Anthropic API → Nemotron on GPU → [[tool-bitnet]] on CPU → queue and notify. For Telegram: API → queue messages for retry. For web search: Exa → Brave → cached wiki data.

Every fallback event is logged and flagged for [[segment-janitor]] review. [[segment-forge]] monitors fallback patterns and optimizes chain ordering based on historical reliability data.
