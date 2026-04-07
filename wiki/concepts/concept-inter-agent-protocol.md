# Inter-Agent Communication Protocol

> Flagged as undefined by: [[review-opus-review1]]

## The Gap

The architecture specifies what each segment does but not how they communicate. When the Brain dispatches a clone, when the Janitor flags an issue, when a droid detects a leak — the current architecture has no defined message format, delivery guarantee, or event system. The implicit assumption is "files on disk," which means polling, race conditions, and no guaranteed delivery.

## Protocol Options (by complexity)

| Option | Complexity | When to use |
|--------|-----------|-------------|
| JSON-lines event log per channel | Low | MVP — start here |
| SQLite-backed message queue | Medium | When ordering + durability matters |
| Redis pub/sub | High | Real-time requirements only — overkill for MVP |

## MVP: JSON-Lines Event Log

One append-only `.jsonl` file per communication channel:

```
events/
├── brain-to-clones.jsonl       # Brain → clone dispatches
├── janitor-alerts.jsonl        # Janitor → Brain findings
├── droid-alerts.jsonl          # Droids → User Agent / Brain
├── forge-promotions.jsonl      # Forge → Brain promotion requests
└── clone-completions.jsonl     # Clone → Brain result signals
```

**Message schema (minimum):**
```json
{
  "ts": "2026-04-07T21:00:00Z",
  "from": "janitor",
  "to": "brain",
  "type": "BLOCK",
  "mission_id": "task/code-auth-refactor",
  "payload": { "reason": "...", "fix_required": "..." }
}
```

Each agent appends to its outbound channel. Each agent polls its inbound channel on a defined interval (User Agent: ~5s, Brain: on session start, Janitor: hourly).

## Concurrency Rule

Each channel has exactly one writer. Multiple readers are safe (JSON-lines is append-only). If two agents must write to the same channel, funnel through a designated aggregator.

## Relationship to Dispatcher

The [[concept-dispatcher]] watches `droid-alerts.jsonl` and `brain-to-clones.jsonl` to decide when to launch a new Brain or Clone session. The event log is the substrate; the dispatcher is the consumer.

## Implementation Phase

Phase 4 (Brain + Clone Infrastructure) — must exist before clones can signal completions back to Brain.

*See also: [[concept-dispatcher]], [[segment-brain]], [[segment-janitor]], [[segment-clones]]*
