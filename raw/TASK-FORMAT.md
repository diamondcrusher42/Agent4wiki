# Task File Format

Drop these JSON files into `brain/inbox/` and the dispatcher picks them up.

## Brain task (planning session)

```json
{
  "id": "task-001",
  "type": "brain",
  "objective": "Research Pokemon distribution licensing requirements for Slovenia and Western Balkans. Decompose into clone tasks for detailed research per country.",
  "source": "telegram",
  "priority": 2,
  "wiki_pages": ["segment-clones", "tool-last30days"],
  "constraints": ["Do not commit to any licensing agreements", "Research only, no outreach"]
}
```

## Clone task (code execution)

```json
{
  "id": "task-002",
  "type": "clone",
  "objective": "Write a Python script that monitors Telegram bot health by pinging each bot token and reporting uptime status to a JSON file.",
  "source": "brain",
  "priority": 3,
  "skill": "code",
  "required_keys": ["TELEGRAM_ADMIN_BOT", "TELEGRAM_KIDS_BOT"],
  "wiki_pages": ["entity-telegram-bots", "tool-keychain-agent"],
  "constraints": ["Do not send messages to any chat", "Read-only health check only"],
  "timeout_minutes": 15
}
```

## Clone task (research)

```json
{
  "id": "task-003",
  "type": "clone",
  "objective": "Use /last30days to research latest developments in glycine + NAC synergy for longevity. Compile findings into a wiki page.",
  "source": "brain",
  "priority": 4,
  "skill": "research",
  "required_keys": ["EXA_API_KEY", "SCRAPECREATORS_API_KEY"],
  "wiki_pages": ["tool-last30days"],
  "timeout_minutes": 20
}
```

## Janitor task (audit)

```json
{
  "id": "task-004",
  "type": "janitor",
  "objective": "Run full wiki lint: check for contradictions, orphan pages, stale claims older than 30 days, and missing cross-references. Output severity-scored findings.",
  "source": "cron:weekly",
  "priority": 4
}
```

## Forge task (improvement)

```json
{
  "id": "task-005",
  "type": "forge",
  "objective": "Analyze the last 10 completed clone tasks. Identify the 3 most common failure patterns. Propose mission brief template improvements to prevent them.",
  "source": "cron:weekly",
  "priority": 4,
  "wiki_pages": ["concept-shadow-benchmarking", "concept-clone-skill-templates"]
}
```

## Droid-triggered task (automated)

```json
{
  "id": "task-006",
  "type": "brain",
  "objective": "ALERT: Telegram admin bot is unresponsive (last heartbeat 15 minutes ago). Diagnose and create recovery clone task.",
  "source": "droid:telegram-heartbeat",
  "priority": 1
}
```
