# Summary Pipeline

> How interactions get compressed before reaching [[segment-user-agent]].

Every prompt and interaction is compressed into a structured digest (example):

```json
{
  "timestamp": "2026-04-07T14:23:00Z",
  "intent": "research pokemon licensing balkans",
  "entities_mentioned": ["Planet Zabave", "Pokemon", "Slovenia"],
  "outcome": "research dispatched to clone-research-12",
  "open_items": ["awaiting clone results"],
  "confidence": 0.85
}
```

Raw conversation stays in [[segment-memory]]. User Agent only sees the digest. This keeps the context window small and prevents resets. The User Agent tracks patterns across digests without needing full transcripts.
