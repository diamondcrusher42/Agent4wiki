# User Agent — The Virtual Clone

> Segment 2 of 6. Principle: Minimal tokens. Maximum awareness. Never resets. Guards the keys.

## Role

The user's digital representative. A privacy-first virtual clone that holds all credentials, represents the user's interests, and maintains awareness of everything without burning context. This is NOT a general-purpose assistant.

## Token Strategy

Receives SUMMARIES of interactions via [[concept-summary-pipeline]], never raw dumps. Maintains a compact state object (<500 tokens) always ready to inject. Updates incrementally. Runs on [[tool-bitnet]] 2B on CPU as an always-on daemon — near-zero energy cost.

## Core Responsibilities

### Credential Vault (via [[tool-keychain-agent]])
Single source of truth for ALL .env files, API keys, OAuth tokens. No agent gets credentials directly — scoped injection only. Monitors for credential exposure. Enforces data privacy.

### Service Health Monitor
Tracks all running services, ports, health status. [[entity-telegram-bots]] uptime and error rates. Claude Code sessions, Ollama instances, BitNet processes. Flags outages, maintains incident log.

### User Intent Tracker
Watches conversation logs passively. Tracks: what user asked → what was delivered → satisfaction signal. Maintains open task list with ownership. Learns user patterns (peak hours, preferred tools, frustrations). Provides alignment signal to [[segment-brain]].

### Summary Pipeline
Every interaction compressed into structured digest before reaching User Agent. Format: `{timestamp, intent, entities_mentioned, outcome, open_items, confidence}`. Raw conversation stays in [[segment-memory]]; User Agent only sees the digest. This keeps the context window lean. See [[concept-summary-pipeline]].

## Key Files

| File | Purpose |
|------|---------|
| `user/state.json` | Current intent, priorities, mood, energy |
| `user/tasks.json` | Open tasks with status and ownership |
| `user/credentials.env` | All API keys (encrypted, 600 permissions) |
| `user/services.json` | Running services, ports, health |
| `user/patterns.json` | Learned user behavior patterns |
| `user/profile.md` | Structured profile (from [[tool-ai-personal-os]] onboarding) |
| `user/soul.md` | Voice, communication style. See [[concept-soul-md]] |

## Interfaces

- → [[segment-memory]]: writes compressed observations
- → [[segment-brain]]: injects user context, alignment, credentials on request
- → [[segment-clones]]: provides credentials and service state (read-only, on-demand)
- ← [[segment-janitor]]: receives health check results
- ← [[segment-bridge]]: forwards incoming user messages as structured events
- ← [[entity-telegram-bots]]: receives bot status, user messages, error alerts
- ← [[segment-forge]]: receives improvement metrics, usage pattern insights
- → [[segment-bridge]]: sends outbound responses, digests, credential-gated outputs
