# Build State 2026-04-09 — Merged to Main

> Branch: `main`
> Merge commit: `3f73f10`
> Merged from: `opus-build` (v9.1)
> Date: 2026-04-09
> Tests: 160 Jest + 51 pytest = 211 total (all passing)
> Version: 0.9.0

## Merge Summary

opus-build → main merged after passing all gate checks:
- Gemini review: multi-perspective, 10 action items logged
- Opus review: 7/10 overall, 2 mandatory security fixes identified and applied
- Janitor pre-merge gate: SUGGEST, 0 BLOCKs (Haiku + extended thinking)
- Conflict: README.md only — resolved by taking opus-build version

## What's on Main (v9.1)

### Security (all shell injection surfaces closed)
| File | Fix | Version |
|------|-----|---------|
| runner.ts (runSetup) | execAsync → execFileAsync | v8 |
| runner.ts (runRepomix) | execAsync → execFileAsync | v9 |
| teardown.ts (mergeWorktree, removeWorktree, pruneBranch) | execSync → execFileSync × 6 | v9.1 |
| ratchet.ts (promote, revert) | execSync → execFileSync × 2, tag validation added | v9.1 |
| dispatcher.py | bare `except:` → `except Exception as e:` with log.warning | v9.1 |

### Architecture (7 segments, all implemented)
| Segment | Status |
|---------|--------|
| User Agent | ComplexityClassifier, 2-pass routing, soul.md cache |
| Brain / Dispatcher | Atomic task claim (os.rename), fleet routing, JIT credentials |
| Clones | git worktree isolation, Keychain AES-256-GCM, try/finally revoke |
| Janitor | Circuit breaker, heuristics.json, WikiScythe, ForgeRecord |
| Forge | ShadowRunner, ForgeEvaluator, ForgeRatchet (5-win + Janitor veto) |
| Keychain | AES-256-GCM vault, scrypt KDF, exactMatchSecrets |
| Bridge | Telegram + Email + Discord + Slack + SMS fallback chain |

### Test Coverage
- 160 Jest tests (6 suites): clone lifecycle, forge, keychain, mempalace, scythe, phase4
- 51 pytest tests: dispatcher, brain routing
- TSC: clean

## Pending (non-blocking, post-merge)

| # | Fix | Effort |
|---|-----|--------|
| 1 | Handshake JSON schema validation | ~30 min |
| 2 | Context size guard in assemble_context() | ~20 min |
| 3 | Conversation history persistence | ~45 min |

## Operational Readiness

- Single-user / single-machine: **Ready for testing**
- Multi-user / multi-machine: Not ready (fleet routing untested)
- Production: Not ready (no CLI, no observability, no integration tests)
