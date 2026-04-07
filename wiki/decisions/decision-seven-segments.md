# Decision: Seven Segments

> Supersedes: [[decision-six-segments]]
> Date: 2026-04-08

---

## Why Seven (Not Six)

The original six-segment design was correct but incomplete. It treated Telegram as an `entity` — listed alongside hardware. That classification was wrong. Telegram is not just a tool the system uses; it is the **only interface the user ever sees**. That makes it a segment.

The addition of **[[segment-bridge]]** (Segment 7) brings the architecture to its final form:

| # | Segment | Relationship with context | Role |
|---|---------|--------------------------|------|
| 1 | [[segment-memory]] | Persists across everything, zero runtime tokens | The Vault |
| 2 | [[segment-user-agent]] | Always-on, minimal tokens, never resets | The Virtual Clone |
| 3 | [[segment-brain]] | Full tokens per session, starts fresh, plans only | The Architect |
| 4 | [[segment-clones]] | Full tokens per mission, stateless, disposable | Special Ops |
| 5 | [[segment-janitor]] | Periodic, adversarial, doubts everything | The Muscle |
| 6 | [[segment-forge]] | Independent, builds better versions, never touches production | Perpetual Improvement |
| 7 | [[segment-bridge]] | Always-on, no LLM tokens, pure relay | The Output Layer |

---

## Why The Bridge Earns Segment Status

### 1. Distinct failure modes, independent of all other segments

The Bridge can fail while all other segments work perfectly:
- Radio silence (console-only output)
- Watchdog crash (PID stale)
- `--channels` flag missing (plugin silently doesn't load)
- Seq drift (old messages re-appearing)
- Plugin blocked by access list

None of these failures touch Memory, Brain, Clones, Janitor, or Forge. They are The Bridge's own failure domain.

### 2. Its own reliability contract

The Bridge has hard rules that other segments do not:
- Session ping on every start — no exceptions
- Acknowledge every message with the specific task name
- Never go radio silent on tasks >20 seconds
- New reply (not edit) when a long task completes

These are not workflow preferences. They are requirements that determine whether the user can trust the system at all.

### 3. Independent evolution

Adding Slack or Discord does not touch the Brain, Clones, or Janitor. Multi-channel routing is entirely a Bridge concern. The six-segment design had no clean place for this evolution — it would have leaked into User Agent or Brain.

### 4. Output reliability = execution reliability

A system that executes perfectly but delivers nothing is, from the user's perspective, broken. Output is not a side effect of the architecture — it is the purpose of the architecture. It deserves a dedicated segment.

### 5. The Watchdog lives here

The always-on process that maintains the Telegram connection is a segment-level responsibility, not a utility script. It has its own launch command (exact, never modify), its own failure modes, and its own recovery procedures.

---

## Why Not Eight (Or More)

Adding more segments beyond seven would create coordination overhead without clear separation of concerns. The Bridge covers the full output surface:
- Multi-channel routing (Telegram, Slack, Discord, webhooks)
- Session lifecycle (ping on start/shutdown)
- Message formatting per channel
- Delivery acknowledgement and retry

This is coherent as a single segment. Splitting it further (e.g., separate segments per channel) would fragment a single concern.

---

## What Changed from Six Segments

- **[[entity-telegram-bots]]** remains an entity (the bot instances themselves — admin, company, kids coding)
- **[[segment-bridge]]** is now the segment that manages what those bots relay and when
- The Bridge is not a Telegram segment — it is the output layer that happens to use Telegram as its primary channel today

---

*See also: [[segment-bridge]], [[decision-six-segments]], [[decision-brain-never-executes]], [[decision-forge-independence]]*
