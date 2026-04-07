# Decision: Six Segments

## Why Six

Each segment has a fundamentally different relationship with context, tokens, and time:

1. **[[segment-memory]]** — persists across everything, zero runtime tokens
2. **[[segment-user-agent]]** — always-on, minimal tokens, never resets
3. **[[segment-brain]]** — full tokens per session, starts fresh, plans only
4. **[[segment-clones]]** — full tokens per mission, stateless, disposable
5. **[[segment-janitor]]** — periodic, adversarial, doubts everything
6. **[[segment-forge]]** — independent, builds better versions, never touches production

Fewer segments would conflate responsibilities (e.g., Brain + execution = bottleneck). More segments would add coordination overhead without clear benefit. Six is the minimum to keep every concern cleanly separated.
