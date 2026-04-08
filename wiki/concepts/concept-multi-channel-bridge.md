# Multi-Channel Bridge

The Bridge's fallback system ensuring output reaches the user regardless of which channel is down. Telegram is primary; four other channels form a cascade that activates automatically on failure.

## The Core Problem

A single-channel Bridge has a critical failure mode: if Telegram returns 529 (overload) or goes down, the system goes radio silent. Every clone completion, BLOCK directive, and security alert disappears into the void. From the user's perspective, silence = crashed.

The multi-channel Bridge solves this: the system always reaches you, through whatever channel is available.

## Channel Cascade

```
Telegram
    ↓ (on failure)
Email (AgentMail → PERSONAL_EMAIL)
    ↓ (on failure)
Discord (incoming webhook)
    ↓ (on failure)
Slack (incoming webhook)
    ↓ (on failure)
SMS (Twilio — 160 chars, critical only)
```

`send()` stops at the first success. `broadcast()` fires all simultaneously.

## Two Delivery Modes

**`bridge.send(text)`** — standard delivery
- Tries Telegram first
- Falls back through the chain on any 4xx/5xx/timeout
- Stops at first successful delivery
- Use for: task completions, SUGGEST re-queues, general notifications

**`bridge.broadcast(text)`** — critical delivery
- Fires ALL configured channels at the same time
- Returns `{channel: "ok"|"failed"}` dict for each
- Use for: BLOCK directives, security alerts (credential leak), system crashes
- Rationale: when something goes wrong badly enough to BLOCK, the user must know — deliver via every channel they have

**`bridge.ping(text)`** — session-only
- Telegram only, no cascade
- Use for: session start/stop pings, message acknowledgements

## Why SMS is Last Resort

SMS costs ~$0.01/message (Twilio). For normal task notifications, the cost would add up with no benefit over free channels. SMS is reserved for events where every other channel has failed — at that point, a few cents per message is irrelevant.

## Dispatcher Integration

`brain/dispatcher.py` calls `notify_human()` after every Janitor evaluation:

| Janitor Directive | Bridge Mode | Rationale |
|------------------|-------------|-----------|
| NOTE (complete) | `send()` | Normal completion — one channel sufficient |
| SUGGEST (retry) | `send()` | FYI — system handled it automatically |
| BLOCK | `broadcast()` | Human must act — must get through |
| SECURITY | `broadcast()` | Credentials may be compromised — maximum urgency |

## Setup

Each channel requires env vars in `.env`:

```
# Email (already configured)
AGENTMAIL_API_KEY, AGENTMAIL_INBOX_ID, PERSONAL_EMAIL

# Discord — create webhook in channel settings → Integrations
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Slack — create at api.slack.com/apps → Incoming Webhooks
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# SMS — Twilio account (free trial = ~15 messages)
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_TO_NUMBER
```

Missing vars: channel is silently skipped, no crash. Partial config is valid.

## Smoke Test

```bash
# Test fallback cascade (send → uses configured channels in order)
python brain/bridge.py send "Bridge smoke test"

# Test broadcast (fires all channels)
python brain/bridge.py broadcast "Broadcast test — all channels"

# Test email specifically
python brain/bridge.py email "Email channel test"

# Test Discord specifically
python brain/bridge.py discord "Discord channel test"
```

## Code Location

`brain/bridge.py` — module-level singleton (`get_bridge()`). Dispatcher and other consumers share one instance. Zero external dependencies beyond the optional `agentmail` SDK (lazily imported).

*See also: [[segment-bridge]], [[concept-dispatcher]], [[concept-fallback-chains]]*
