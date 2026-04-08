# The Bridge — The Output Layer

> Segment 7 of 7. Principle: If it's not on Telegram, it doesn't exist. Never go radio silent.

---

## Role

The Bridge is the only part of the system that users on the other side actually see. Everything the system does — plans, executes, audits, improves — is invisible until it reaches The Bridge. It receives output from all internal segments and relays it to the user via Telegram (or Slack, Discord, webhooks, and other channels).

The Bridge is not a passive relay. It is an active layer with its own reliability requirements, failure modes, and protocols. A system that works perfectly internally but fails to communicate is, from the user's perspective, broken.

---

## Why This Is a Segment, Not Just a Tool

The original six-segment design treated Telegram as an `entity` — a communication layer. That was wrong. The Bridge deserves segment status because:

1. **It has distinct failure modes** — radio silence, console-only output, seq drift, channel flag issues — independent from every other segment
2. **It has its own reliability contract** — stay present, acknowledge every message, ping on start/shutdown
3. **It evolves independently** — adding Slack or Discord doesn't touch Brain, Clones, or Janitor
4. **Output reliability = execution reliability** — a result that never reaches the user might as well not exist
5. **It is the first and last thing in every interaction** — session ping on start, shutdown ping on end

See [[decision-seven-segments]].

---

## Channels

| Channel | Status | Priority | Use Case |
|---------|--------|----------|----------|
| Telegram | ✅ Live | 1 — Primary | All output. Session pings. Task results. Approvals. |
| Email | ✅ Live | 2 — Fallback 1 | When Telegram fails (529, down). AgentMail → PERSONAL_EMAIL. |
| Discord | ✅ Live | 3 — Fallback 2 | Parallel with Telegram for BLOCK/security alerts. Webhook. |
| Slack | ✅ Live | 4 — Fallback 3 | Work-context notifications. Webhook. |
| SMS | ✅ Live | 5 — Last resort | Critical-only (costs money). Twilio. 160 char limit. |

## Bridge API (`brain/bridge.py`)

```python
from brain.bridge import get_bridge

bridge = get_bridge()

# Standard output — tries Telegram, falls back through chain on failure
bridge.send("Clone task-001 completed.")

# Broadcast to ALL channels simultaneously — use for BLOCK, security alerts
bridge.broadcast("SECURITY: credential leak in task-007")

# Telegram-only ping — session start/stop, does not cascade
bridge.ping("Session started. Queue: 3 msgs.")
```

### Fallback cascade

```
Telegram → Email (AgentMail) → Discord → Slack → SMS
```

- `send()`: tries each channel in order, stops at first success
- `broadcast()`: fires all channels in parallel, returns `{channel: "ok"|"failed"}` dict
- BLOCK directive always uses `broadcast()` — it fires Telegram + Email + Discord + Slack + SMS simultaneously

### Required env vars (`.env.example` for all)

```
TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID          # primary
AGENTMAIL_API_KEY, AGENTMAIL_INBOX_ID,
PERSONAL_EMAIL                                 # email fallback
DISCORD_WEBHOOK_URL                            # discord fallback
SLACK_WEBHOOK_URL                              # slack fallback
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
TWILIO_FROM_NUMBER, TWILIO_TO_NUMBER           # SMS last resort
```

Missing vars: channel is skipped gracefully (warning logged, no crash).

---

## Core Protocols (Hard Rules — Learned from Breakdowns)

### Rule 1 — ALL output goes via Telegram reply tool. No exceptions.

It does not matter if the message came from Telegram, terminal, CLI, or anywhere else. Every response, confirmation, question, status update, approval request, and task result goes via `mcp__plugin_telegram_telegram__reply` to `chat_id $TELEGRAM_CHAT_ID`.

**Why this rule exists:** Multiple sessions were lost because output was sent to console only. Console is invisible to the user. The session looked alive internally but was completely silent from the user's perspective.

---

### Rule 2 — Session ping is mandatory. Always. No exceptions.

Every session start (including after compact, reset, auto-compaction) sends a Telegram ping as the **first action after loading context**:

```
Session (re)started. [shutdown reason]. Unsolved: [list]. System: N pass / N fail. Queue: [N msgs].
```

**Why this rule exists:** The user cannot see the console. Without a session ping, a restarted session is indistinguishable from a crashed one.

---

### Rule 3 — Never go radio silent.

Any task expected to take >20 seconds sends a Telegram update before starting:
- "On it — [what I'm doing]"
- Ping at 30s: "Still working — [current step]"
- Ping at 60s, then every 120s if still running

Spawn subagents for long work so the main session stays responsive.

**Why this rule exists:** Jure cannot tell if the agent is working or crashed. Silence = crashed from the user's perspective.

---

### Rule 4 — Acknowledge every message with the specific task.

Format: `"Working on: [1-line description of what you're about to do]"`

Never: `"Working on it..."` — always name the specific task so the user knows each message was received and understood.

Multiple messages: acknowledge each individually in a single reply.

---

### Rule 5 — After long tasks, send a new reply (not an edit).

`edit_message` does NOT trigger push notifications on the user's device. Use `edit_message` for interim progress updates only. When a long task completes, always send a **new reply** so the device pings.

---

### Rule 6 — Always read_queue with after_seq. Never from 0 except on session start.

Pass `after_seq: N` (where N = last processed seq) to `read_queue`. Reading from 0 every time costs ~35k tokens of redundant history.

**Seq drift risk:** Saved seq must be the **highest seq seen across the full buffer**. If seq is saved too low, old messages re-appear next session as unread. At session end: call `read_queue` until empty, take the max seq returned, save that.

---

## The Watchdog — Always-On Bridge

The Bridge is the only segment that never sleeps. The watchdog process maintains the Telegram connection continuously:

**Exact launch command (never modify):**
```bash
claude --effort $EFFORT --permission-mode auto --channels plugin:telegram@claude-plugins-official
```

**Flags that are MANDATORY:**
- `--channels plugin:telegram@...` — Telegram dies without this. No channel, no plugin load, no "Listening" line.
- `--permission-mode auto` — Jure must not get confirmation prompts for routine tool calls.

**Flags that MUST NOT be added:**
- `--append-system-prompt-file` — silently breaks `--channels`. No error message. Plugin simply does not load. Confirmed broken twice. Root cause confirmed.

---

## Known Failure Modes (Documented Incidents)

| Failure | Symptom | Root Cause | Fix |
|---------|---------|-----------|-----|
| Silent session | Agent working, user sees nothing | Output sent to console not Telegram | Enforce Rule 1 on every response |
| Dead watchdog | No response to any Telegram message | watchdog crashed, PID file stale | Check `/tmp/claude_watchdog.pid`, restart watchdog |
| Plugin not loading | No "Listening" line in watchdog output | `--append-system-prompt-file` added to launch command | Remove that flag, restart |
| Old messages re-appearing | Stale messages show as new each session | Seq saved too low | Save max seq from full drain, not last processed |
| Telegram reply blocked | `chat $CHAT_ID not allowlisted` error | Chat ID not in access list | Run `/telegram:access` in terminal |
| Radio silence | User thinks agent crashed mid-task | No progress ping during long operation | Add pre-task ping + 30s/60s/120s heartbeat |

---

## Message Formatting Rules (Telegram-Specific)

- Code blocks: extra blank line between each code line for readability in Telegram
- MarkdownV2: escape special chars when using `format: "markdownv2"`
- Long outputs: split into multiple messages if > ~3000 chars
- File attachments: pass absolute paths in `files: ["/abs/path"]`
- Reactions: use `react` for quick acknowledgements (no push notification)
- Threading: use `reply_to: message_id` only when replying to a non-latest message

---

## Session Lifecycle

```
Session start:
  1. Load context (SESSION_STATE.md, OPERATIONS.md, USER.md)
  2. Run system_check.sh
  3. Drain Telegram queue (after_seq: 0 on fresh start)
  4. SEND SESSION PING ← Bridge responsibility
  5. Process queue messages in order

Mid-session:
  - Acknowledge every incoming message immediately
  - Send progress updates on tasks >20s
  - Drain queue after each response batch (after_seq: N)

Session end / before /new:
  - Run /export-brain → /pre-new
  - Drain queue until empty, save max seq
  - SEND SHUTDOWN PING ← Bridge responsibility
  - Run save_state.sh
```

---

## Notification Routing by Event Type

| Event | Channels | Rationale |
|-------|----------|-----------|
| Task NOTE (complete) | Telegram → cascade | Normal completion — one channel enough |
| Task SUGGEST (retry) | Telegram → cascade | Info only — Janitor re-queued automatically |
| Task BLOCK | ALL channels (broadcast) | Requires human action — must get through |
| Security alert (leak) | ALL channels (broadcast) | Critical — credentials may be compromised |
| Session start ping | Telegram only | Routine — no need to flood other channels |
| Dispatcher crash | Email + Discord | Telegram may be down if watchdog crashed |
| Clone completion | Telegram → cascade | User wants to know result on phone |
| Janitor weekly report | Email | Long-form — better suited for email |
| Forge promotion | Telegram | FYI — a new template version promoted |
| Kids bot alerts | Telegram (admin bot) | Separate chat_id, never mixes with main vault |

---

## Interfaces

- ← [[segment-user-agent]]: receives digests, responses, credential-gated outputs
- ← [[segment-brain]]: receives task completions, escalations, approval requests
- ← [[segment-janitor]]: receives health reports, alert digests
- ← [[concept-dispatcher]]: receives bridge-triggered session launch confirmations
- → User (Telegram/Slack/Discord): the only segment with a path to the outside world
- → [[segment-user-agent]]: forwards incoming messages as structured events
