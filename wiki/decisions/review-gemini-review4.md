# Review — Gemini Review 4: Can It Work?

> Source: `raw/Gemini-review4-Can-it-work.md` | Created: 2026-04-07
> Reviewer: Gemini
> Subject: First-principles feasibility check — architecture, security, cross-OS, productization, limits

---

## Overall Verdict

The 7-phase plan is disciplined and sequential. Elevating Keychain Agent MVP to Phase 2 and locking down `allowedPaths` correctly attacks the most critical vulnerability first.

---

## New Findings

### 1. Engine vs. State Repo Separation

> **Finding:** The repo structure must physically separate the Engine (immutable logic) from the State (data, credentials, worktrees).

Current structure mixes everything. Recommended separation:

```
Agent4wiki/
├── core/                    ← The Engine (committed to git, immutable)
│   ├── memory_store/        ← MemPalace interface abstraction (Phase 1)
│   ├── routing/             ← Complexity classifier (Phase 3)
│   ├── templates/           ← Mission brief templates (Phase 4)
│   └── forge/               ← Benchmarking logic (Phase 7)
├── state/                   ← The Vault (heavily gitignored — never committed)
│   ├── keychain/            ← Encrypted credential store
│   ├── memory/              ← MemPalace / vector DB local data
│   └── worktrees/           ← Where clones actually execute
└── wiki/                    ← The Brain's OS (committed to git)
```

**Gitignore rule:** The entire `state/` directory (except `.gitkeep` placeholder files) must be blocked. No exceptions.

This complements the [[review-opus-review1]] repo structure — the key addition is the explicit `state/` vs `core/` split and placing `worktrees/` inside `state/`.

---

### 2. Docker Container Sandboxing for Clones

> **Finding:** `allowedPaths` is good but not absolute. For true isolation, clones should run inside Docker containers.

`allowedPaths` relies on Claude Code's internal enforcement — it's a configuration boundary, not a kernel boundary. A Docker container gives the clone absolutely no path back to the host machine's root user directory. If a clone is building a React frontend, it builds inside a container with no access to the host.

**Fix:** For high-sensitivity clones (financial, security, external API access), run in Docker. `allowedPaths` remains the default for lightweight tasks; containers are the escalation path.

**Patches:** [[concept-git-worktrees]]

---

### 3. Clone Environment Bootstrapping

> **Finding:** Before a clone starts its mission, the worktree must be bootstrapped with the correct runtime environment.

The Brain can't just create a git worktree and say "go" to a Node.js frontend clone. Running `npm install` or `pip install` must happen first, or the clone fails immediately. This is currently unspecified in the mission brief format.

**Fix:** Inject a standard `bootstrap` step into every Mission Brief template:

```markdown
## Bootstrap (run before starting work)
- [ ] `npm install` / `pip install -r requirements.txt` / `go mod download`
- [ ] Verify env vars are injected: `echo $REQUIRED_VAR`
- [ ] Confirm working dir is restricted: `pwd` should show `state/worktrees/{clone-id}/`
```

The Brain selects the correct bootstrap block per skill type (Node, Python, Go, etc.) from `core/templates/`.

**Patches:** [[concept-mission-briefs]], [[plan-implementation-v4]] Phase 4

---

### 4. Irreversible Actions — Mandatory Human Circuit Breaker

> **Finding:** The Phase 6 BLOCK/SUGGEST/NOTE tiers address Janitor rejection loops but not actions with external side effects.

Destructive or externally visible actions (dropping production databases, sending mass emails, processing payroll, public posts) cannot rely solely on the 3-retry circuit breaker — they need a hard gate before execution, not after failure.

**Fix:** Classify all clone actions into two groups:
- **Reversible**: code changes, draft documents, local file edits → BLOCK/SUGGEST/NOTE tiers apply
- **Irreversible / external reputation**: any action involving money, mass sends, public posts, production data destruction → **mandatory "Escalate to Human" gate before execution, not retried on failure**

The Janitor must tag these in mission briefs at dispatch time. The clone cannot proceed past the gate without explicit human approval via Telegram.

**Patches:** [[segment-janitor]]

---

## Confirmed / Reinforced (Not New)

| Finding | Prior source | Status |
|---------|-------------|--------|
| allowedPaths per worktree | [[review-gemini-review1]] | Already in plan Phase 2 |
| Worktree cleanup | [[review-gemini-review3]] | Already in plan Phase 4 |
| Wiki growth / memory decay | [[review-opus-review1]] | wiki-tiering concept created |
| Ping-pong / hallucination loop | [[review-gemini-review1]] | Circuit breaker in Phase 6 |
| Productization tiers | [[review-opus-review1]] | Already captured |

---

## Upgrades Noted (Not Yet Actioned)

- **Central command dashboard**: Local web UI (React + Framer Motion) showing `state.json`, active clone worktrees, Janitor logs. The human equivalent of `brain/dispatcher.py` output made visual.
- **Network mesh (Tailscale)**: Distribute the architecture across devices — Brain + Memory on a home server/Pi, compute-heavy clones on the main desktop with GPU access. Extends the local-first model to multi-machine.

---

## Cross-OS Summary

| Platform | Status | Key notes |
|----------|--------|-----------|
| WSL2 | ✅ Optimal | Native bash, clean paths, Docker works, best for BitNet |
| Linux | ✅ Native | Everything as designed, systemd for daemons |
| macOS | ✅ Good | launchd instead of cron, ARM kernels for BitNet |
| Windows native | ⚠️ High friction | Path conflicts, execution policy issues, use WSL2 |

**Recommendation from reviewer:** Write all automation scripts in Python (not bash) for portability. Use `pathlib` for paths. Keep repo inside WSL2 filesystem (`~/agent-v4/`), not on `/mnt/c/` (filesystem bridge is slow).

---

## Productization Additions (vs. Opus Review)

**RBAC Keychain (B2B):** CEO holds master keys. Marketing clone can post to social media but cannot see billing API keys. Role-Based Access Control baked into the Keychain vault per agent scope.

**SOC2 Compliance:** Janitor audit logs exported as immutable audit trails. Enables enterprise compliance reporting without additional tooling.

**B2B sell:** "Your company's operating system, automated." Institutional memory that persists beyond individual employees.

---

*See also: [[review-opus-review1]], [[review-gemini-review1]], [[concept-git-worktrees]], [[concept-mission-briefs]], [[segment-janitor]], [[plan-implementation-v4]]*
