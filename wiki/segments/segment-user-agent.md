# User Agent — The Virtual Clone

> Segment 2 of 6. Principle: Minimal tokens. Maximum awareness. Never resets. Guards the keys.

## Role

The user's digital representative. A privacy-first virtual clone that holds all credentials, represents the user's interests, and maintains awareness of everything without burning context. This is NOT a general-purpose assistant.

## Phase 3 Deliverables — Implementation

> Code: `core/routing/classifier.ts` + `core/user_agent/agent.ts` + `state/user_agent/state.json`

### ComplexityClassifier — Regex Router (No LLM)

```typescript
classify(prompt) → DIRECT | BRAIN_ONLY | FULL_PIPELINE
```

MVP: keyword heuristics, NOT an LLM — no API call before the system starts working.

| Route | Trigger | Latency | Cost |
|-------|---------|---------|------|
| DIRECT | Conversational, no keyword match | <1s | Zero (BitNet 2B local) |
| BRAIN_ONLY | plan / explain / summarize / research / compare | 2-5s | Sonnet API |
| FULL_PIPELINE | build / deploy / scrape / run / execute / commit | 10-60s+ | Full stack |

### UserAgent — Top-Level Orchestrator

Receives every user message. Classifies → dispatches to the right path. Compresses conversation history every 10 turns via Summary Pipeline (BitNet 2B local, zero API cost). Writes to `state/user_agent/state.json` (≤500 tokens total).

### state.json — The Compact State Object

```json
{
  "last_updated": "ISO timestamp",
  "current_intent": "What user is working on now",
  "active_worktrees": ["clone-xyz"],
  "open_items": ["unresolved task 1"],
  "recent_context_summary": "Compressed from last N turns",
  "confidence_score": 0.95
}
```

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
