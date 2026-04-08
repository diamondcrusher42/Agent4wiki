# Gemini Review 88 — Phase 5-7 Code Review

> Source: raw/gemini-review88-phase57-code-review.md
> Date: 2026-04-08
> Scope: Full Agent V4 codebase after Phase 5-7 implementation (84 tests)

## 🟢 Validated (no action needed)

- **Brain never executes** — strict separation prevents orchestrator context corruption
- **Janitor 3-tier directives** (NOTE/SUGGEST/BLOCK) — robust quality gate before merge
- **JIT credential injection** — scoped .env in worktree, forcefully deleted via try/finally
- **Bridge fallback cascade** — Telegram→Email→Discord→Slack→SMS, output reliability = execution reliability

## 🔴 Structural Concerns

### R1: TS/Python filesystem-as-queue (brain/inbox/)
- Current: UserAgent writes JSON → dispatcher polls filesystem
- Risk: brittle integration, no delivery guarantees, no backpressure
- Better: native RPC or message broker
- **Decision**: accepted for MVP. filesystem-inbox is intentional (resilient to process crashes — JSON persists). Add file locking (see Blind Spot B2 below) to reduce race risk. Revisit for fleet scale.

### R2: Regex complexity routing
- Current: ComplexityClassifier routes on hardcoded keywords ("build", "explain")
- Risk: over/under-classification on edge cases
- **Decision**: accepted for Phase 1. Add a "fallback to BRAIN_ONLY" rule for unmatched patterns (currently defaults to DIRECT). Phase 2: replace with a fast Haiku call for ambiguous inputs.

## 👹 Critical Fixes Required

### C1: LLM stdout JSON parsing is fragile
- Current: dispatcher scans claude CLI stdout with regex `r'\{[^{}]*"status"[^{}]*\}'`
- Risk: breaks if LLM nests JSON, adds conversational text, or Anthropic changes CLI output format
- **Fix**: enforce structured output — pass `--output-format json` flag to `claude` CLI, or require clone to write handshake to a dedicated file (`state/handshake/<task_id>.json`) rather than stdout. Dispatcher reads the file, not stdout.
- Priority: HIGH — this is the most likely production failure point

### C2: Git as distributed task queue (fleet routing)
- Current: proposed fleet nodes run `git pull` every 2s
- Risk: merge conflicts, rate limiting, collisions at scale
- **Fix**: fleet nodes should poll via SSH `scp` (already implemented in dispatch_remote) — not git pull. Brain writes task to remote inbox via SSH, not git. Remove any git-pull polling from fleet design.
- Priority: MEDIUM — only matters when fleet >1 node

## 🙈 Blind Spots (fix before production)

### B1: No OS-level network isolation
- Current: clones run as subprocess on host OS — nothing stops network exfiltration
- Fix: wrap clone execution in Docker with `--network=none` or a whitelist network. Add `DOCKER_SANDBOX=true` flag to CloneRunner — if set, exec inside `docker run --rm --network=none`
- Priority: HIGH for any task involving external credentials

### B2: Filesystem race conditions
- Current: UserAgent, Brain, dispatcher all read/write state.json and registry.json async with no locking
- Fix: add advisory file locks (`lockfile` npm package for TS, `filelock` for Python). Wrap all state.json reads/writes in `withLock()` helper.
- Priority: MEDIUM — only manifests under parallel clone load

### B3: Uncaught process deaths (OOM/SIGKILL)
- Current: try/finally in CloneWorker won't trigger on hard kill — orphaned worktree with .env on disk
- Fix: add a watchdog cron (`*/5 * * * *`) that scans `state/worktrees/registry.json` for worktrees older than MAX_CLONE_DURATION (default 30min) and runs `CloneTeardown` on them. Separate process — survives Brain death.
- Priority: HIGH — credential leak vector if OOM occurs mid-clone

## 🍏 Low-Hanging Fruits (implement now)

### L1: Replace polling with file watcher in dispatcher.py
```python
# Replace: time.sleep(POLL_INTERVAL) loop
# With: watchdog library
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
```
Reduces I/O overhead from constant polling to event-driven. `pip install watchdog`.

### L2: Write handshake to file, not stdout
Clone writes JSON to `state/handshake/<task_id>.json`. Dispatcher reads file. Eliminates the fragile stdout regex (fixes C1).

### L3: AST security scanning
Replace grep/regex in `scanForLeaks` with Semgrep (for TS) and Bandit (for Python clones). Catches runtime exfiltration patterns (`os.environ['KEY']`) that string search misses.

## 🔮 Future Watchlist

- **Upstream CLI breakage**: JSON regex parser breaks if Anthropic changes output format → L2 (file-based handshake) fully eliminates this risk
- **InteractionDigest bloat**: add `MAX_DIGEST_TOKENS = 4000` sliding window to UserAgent (already noted in plan-build-v2 edge cases)

## Priority Action Order

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | C1: stdout JSON → file-based handshake | 1h | Eliminates #1 production failure vector |
| 2 | B3: orphaned worktree watchdog cron | 1h | Closes credential leak on process death |
| 3 | B1: Docker sandbox flag for CloneRunner | 2h | OS-level network isolation |
| 4 | B2: file locking on state.json/registry.json | 1h | Prevents race conditions at scale |
| 5 | L1: watchdog file watcher in dispatcher | 30min | I/O efficiency |
| 6 | L3: Semgrep/Bandit SAST | 2h | Deeper secret scanning |
| 7 | R2: Haiku fallback for ambiguous classifier | 1h | Better routing quality |
