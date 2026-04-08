# Multi-Channel Bridge — Design + Implementation

Source: original implementation session 2026-04-08
Author: Agent V4 (Claude Sonnet 4.6)
Status: Implemented — brain/bridge.py committed

---

## Problem

The Bridge (Segment 7) had a single point of failure: Telegram. When Telegram returns 529 (server overload), the system goes radio silent. The user has no way to know if tasks completed, if clones are blocked, or if security alerts fired. From the user's perspective, silence = crashed.

## Solution

A 5-channel fallback cascade. The Bridge tries channels in priority order, stopping at the first success. For critical events (BLOCK, security), it fires all channels simultaneously.

## Channel Priority

| Priority | Channel | Transport | Status | Cost |
|----------|---------|-----------|--------|------|
| 1 | Telegram | Bot API | Live | Free |
| 2 | Email | AgentMail SDK | Live | Free (SES backend) |
| 3 | Discord | Incoming Webhook | Live | Free |
| 4 | Slack | Incoming Webhook | Live | Free |
| 5 | SMS | Twilio REST API | Live | ~$0.01/msg |

## API

```python
from brain.bridge import get_bridge

bridge = get_bridge()

# Standard — Telegram first, cascade on failure
bridge.send("Clone task-001 completed.")

# Critical — ALL channels simultaneously
bridge.broadcast("SECURITY: credential leak in task-007")

# Telegram only — session pings, acks
bridge.ping("Session started.")
```

## Dispatcher Integration

dispatcher.py notify_human() routes by directive:

```
NOTE     → bridge.send()      (one channel enough for completions)
SUGGEST  → bridge.send()      (info only — Janitor re-queued automatically)
BLOCK    → bridge.broadcast() (requires human action — must get through)
SECURITY → bridge.broadcast() (credentials may be compromised)
```

## Env Vars Required

```
# Primary (required)
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

# Email fallback (already configured on KEVIN)
AGENTMAIL_API_KEY       # agentmail.to API key
AGENTMAIL_INBOX_ID      # happyself332@agentmail.to
PERSONAL_EMAIL          # destination (cerar_jure@yahoo.com)

# Discord (webhook — create in channel settings)
DISCORD_WEBHOOK_URL

# Slack (incoming webhook — create via api.slack.com/apps)
SLACK_WEBHOOK_URL

# SMS — Twilio (last resort, critical only)
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
TWILIO_TO_NUMBER
```

Missing vars are skipped gracefully — the bridge logs a warning and tries the next channel.

## Implementation Notes

- AgentMail SDK (`agentmail` PyPI) already installed in venv on KEVIN. Tested and verified working (SES backend).
- Discord + Slack use plain HTTP webhooks — zero dependencies, stdlib urllib only.
- Twilio uses Basic Auth over HTTPS — no SDK needed, also stdlib urllib.
- SMS is truncated to 160 chars for single-segment delivery.
- bridge.py is a module-level singleton (`get_bridge()`) — dispatcher and any other consumer share one instance.
- `broadcast()` returns `{channel: "ok"|"failed"}` dict — dispatcher logs which channels delivered BLOCK alerts.

## Files Changed

- `brain/bridge.py` — new module (5-channel cascade)
- `brain/dispatcher.py` — added bridge import, fixed all broken paths, added notify_human()
- `.env.example` — all 4 new channel var groups documented with setup instructions
- `wiki/segments/segment-bridge.md` — channels table expanded, Bridge API documented, notification routing table added
