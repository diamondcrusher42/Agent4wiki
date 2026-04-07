# Review — Opus Review 1: Deep Dive

> Source: `raw/Opus-review1-deep-dive-review.md` | Created: 2026-04-07
> Reviewer: Claude Opus
> Scope: Full architecture — blind spots, conflicts, repo structure, productization, autonomy, upgrades, quick wins

---

## 🔴 Blind Spots — Not Previously Flagged

### 1. Inter-Agent Communication Protocol Undefined

The architecture describes what each segment does but never specifies HOW they talk to each other. When the Brain dispatches a clone, what's the message format? When the Janitor flags an issue, how does the Brain receive it? When a droid detects a leak, how does it alert the User Agent?

**The gap:** No message bus, no event system, no queue. The implicit assumption is "files on disk" — which means polling, race conditions, and no guaranteed delivery.

**Fix:** Define a lightweight event protocol. Options by complexity:
- JSON-lines event log per channel (simplest, start here): `brain-to-clones.jsonl`, `janitor-alerts.jsonl`, etc.
- SQLite-backed message queue (more robust)
- Redis pub/sub (most complex — Docker setup supports it, but overkill for MVP)

See [[concept-inter-agent-protocol]]

---

### 2. Concurrency and Locking

Multiple clones running in parallel worktrees will write to the same wiki, the same MemPalace, the same audit logs. Git handles code merges, but `memory/wiki/index.md` updated by two clones simultaneously, or `user/tasks.json` read by User Agent while Brain writes to it, will corrupt state silently.

**Fix:** Single-writer rule per critical file:
- Only the Brain writes to `wiki/index.md`
- Only the User Agent writes to `user/state.json`
- Clones write ONLY to `clones/results/{clone-id}/` — their own isolated space
- Brain merges results into wiki in a single-threaded post-processing step
- File-level advisory locks (fcntl/flock) for anything requiring true concurrent access

See [[concept-git-worktrees]]

---

### 3. The "Start from /new" Problem — Missing Dispatcher

The Brain starts fresh every session. But who starts the Brain? Manual (Telegram from user) is fine for now. But: if a droid detects a problem and needs the Brain to respond, who translates the droid alert into a Brain session? This gap is a dead-end in the current architecture.

**Fix:** Define a dispatcher — a lightweight Python script (not a full agent) that watches the event queue and launches Brain sessions with appropriate context. It's the missing glue between always-on components (User Agent, droids) and session-based components (Brain, clones). ~50 lines of Python watching a directory for `.json` task files, then running `claude code` with the task as input.

See [[concept-dispatcher]]

---

### 4. Wiki Growth Without Bounds

The wiki will grow forever. Every clone output gets atomized into pages. After 6 months: 500+ pages. `index.md` becomes too large. Semantic search slows. The Brain's startup sequence (read index → find relevant pages) consumes increasing tokens until startup fails the budget.

**Fix:** Wiki tiering:
- **Hot** (last 30 days) — always indexed, in `index.md`
- **Warm** (31-90 days) — searchable but not in index, loaded on demand
- **Cold** (90+ days) — archive, MemPalace only
- Janitor lint pass includes "compress and archive" — moves stale pages, updates index
- Index hard cap: 500 tokens. If exceeded, restructure to two-tier: category summaries always loaded + per-category detail on demand

See [[concept-wiki-tiering]]

---

### 5. No Rollback Mechanism for Forge Promotions

The Forge proposes improvements and the Brain promotes them. If a promoted change is subtly worse in ways that take a week to notice, there's no revert path.

**Fix:** Git provides this for free — every promotion is a merge commit. The Forge should:
- Tag every promotion: `forge/promoted/{date}-{process}`
- Rollback = `git revert`
- Enforce a **probation period**: first 10 uses post-promotion are monitored more closely
- Auto-revert if error rate exceeds threshold during probation

---

## 🟡 Conflicts to Watch

### Janitor vs. Forge Territory Overlap

Both audit clone quality. Both propose improvements. If they disagree about what "better" means, there's no tiebreaker.

**Resolution:** Hard rule — **Janitor is reactive, Forge is proactive. They never modify the same thing in the same cycle.**
- Janitor runs first — finds problems in what exists
- Forge runs after — builds alternatives
- **Janitor can veto a Forge promotion** if it introduces a quality regression

See [[segment-janitor]], [[segment-forge]]

---

### Brain Context Budget vs. Wiki Richness

The richer the wiki gets, the more context the Brain needs on startup. Token budget is fixed. At some point, reading the index alone exceeds the budget.

**Resolution:**
- Index hard cap: 500 tokens / under 100 entries before restructuring
- Each entry: 5-word description maximum (not a sentence)
- Past 100 pages: two-tier index (category summaries always loaded, per-category detail on demand)

---

### Clone Isolation vs. Collaboration

Some tasks require clone collaboration (research clone feeds code clone). Isolation makes direct cross-worktree reading impossible.

**Resolution:** Collaboration happens through Memory, not directly.
1. Research clone writes to `clones/results/{clone-id}/findings.md`
2. Brain reads it, creates new mission brief for code clone with findings included
3. This is sequential — collaboration cost is latency, not correctness
4. For true parallelism: both clones work independently, Brain merges results afterward

---

## GitHub Repo Structure (Proposed)

```
agent-v4/
├── .github/
│   ├── workflows/
│   │   └── credential-scan.yml     # gitleaks/trufflehog on every PR
│   └── CODEOWNERS
├── wiki/                           # Agent4wiki content
├── keychain/                       # Vault, injector, scanner, droids
├── brain/
│   ├── templates/                  # Clone skill templates
│   ├── dispatcher.py               # Watches event queue, launches Brain sessions
│   └── planner.py
├── user-agent/
│   ├── state/                      # state.json, tasks.json, services.json
│   ├── profile/                    # profile.md, soul.md
│   └── summary-pipeline.py
├── forge/                          # briefs/, errors/, tools/, capabilities/, diagnostics/
├── bots/                           # admin/, company/, kids-coding/
├── scripts/
│   ├── setup.sh
│   ├── worktree-create.sh
│   ├── worktree-cleanup.sh
│   └── daily-maintenance.sh
├── config/
│   ├── scopes.yaml                 # Agent-to-credential mapping (no secrets)
│   ├── fallback.yaml
│   ├── patterns.yaml
│   └── rotation.yaml
├── memory/
│   ├── raw/
│   ├── palace/
│   └── schemas/                    # JSON schemas for all state files
├── CLAUDE.md
├── README.md
└── requirements.txt
```

**Credential protection stack:**
- `.gitignore`: `*.vault`, `*.env`, `credentials/`, `secrets/`, `audit/*.json`
- GitHub Actions: `trufflehog`/`gitleaks` on every PR
- Pre-commit hook: `keychain scan --staged` blocks commits with credential patterns
- Vault data lives in `~/.keychain-agent/` — outside the repo, never committed

---

## Productization

### Free Tier (Open Source — MIT)
- Wiki pattern + structure (Agent4wiki)
- Keychain Agent (vault, injector, scanner)
- Brain templates and mission brief format
- Clone skill template system
- Janitor audit rules
- Forge shadow benchmarking framework
- All droids
- Documentation and setup guides

### Premium Tier
- Hosted Keychain vault with team credential sharing + audit dashboards
- Pre-built clone skill packs: accounting, legal, health, real estate, e-commerce
- Forge-as-a-Service: hosted shadow benchmarking, A/B management, trend reports
- Team features: shared wiki with role-based access, multi-user Brain, team Telegram management
- Enterprise: SSO, compliance exports, custom droids, SLA
- Managed hosting: full cloud deployment with monitoring

### Individual Target
Single `setup.sh` → wiki initialized, user profile created, Keychain active, droids running, Telegram admin bot configured. Add API keys → running in 30 minutes.

*Value prop: "Your AI remembers everything, works in parallel, and never leaks your secrets."*

### Business Target
Docker Compose stack: shared wiki, team Keychain vault, per-role Telegram bots, admin dashboard.

*Value prop: "Institutional memory that doesn't leave when people do."*

---

## Autonomy Levels

| Level | Tasks |
|-------|-------|
| **High** (unattended) | Research briefings, wiki maintenance, credential rotation reminders, service health + restart, code linting, backup verification |
| **Medium** (approval at key points) | Code generation (human reviews before merge), document drafts, accounting reconciliation proposals, email drafting |
| **Low** (human-in-loop) | Business decisions, public-facing content, financial transactions, legal signing, hiring |

---

## Current Limitations Acknowledged

- **MemPalace**: 6 commits, 11 stars — unproven at scale. AAAK compression untested with production data types.
- **Clones**: API rate limits cap simultaneous sessions. Git worktrees duplicate working files — 20 simultaneous worktrees on a 256GB SSD will eat disk.
- **Droids**: scripts, not agents — can detect but can't fix. Dispatcher gap means droid alerts don't reach Brain automatically.
- **Forge**: shadow benchmarking doubles compute cost (80/20 budget split needs active management).
- **BitNet 2B**: too small for complex reasoning. Tier misclassification = wasted API budget or bad outputs.

---

## Obvious Upgrades (Not Yet Considered)

| Upgrade | Value |
|---------|-------|
| MCP Server for Keychain | Credentials as tool calls instead of env injection — cleaner for any MCP-compatible tool |
| Obsidian as wiki viewer | Graph view + backlinks + local search for free; Claude writes, Obsidian reads |
| Voice interface via Whisper | Telegram voice → Whisper on RTX 3090 → Brain task. Matches natural preference. |
| Pre-commit hook as Keychain droid | Block commits with credentials before they're ever committed |
| Wiki diff reports | Weekly Telegram digest: new/updated/archived pages. Bird's-eye on knowledge evolution. |
| Cost tracking droid | Real-time API spend per segment, cost per clone mission, budget alerts |

---

## Low-Hanging Fruit (Do Now)

1. `.github/workflows/credential-scan.yml` — 5 minutes, prevents secret leaks permanently
2. `scripts/worktree-create.sh` — standardize clone launch, enforce naming convention
3. Pre-commit hook for Agent4wiki: validate wikilinks (no broken `[[references]]`)
4. Write `brain/dispatcher.py` — 50 lines Python, watches directory, launches Claude Code with task context
5. Daily Telegram digest — one message per day: tasks completed, errors, wiki changes
6. Move vault data path to `~/.keychain-agent/` (outside any repo) and document it

---

## Delta vs Prior Reviews

| Finding | Source | Status |
|---------|--------|--------|
| Ping-Pong Deadlock | [[review-gemini-review1]] | Already addressed in plan |
| RTT latency | [[review-gemini-review1]] | Already addressed |
| Filesystem scope attack | [[review-gemini-review1]] | Already addressed |
| MemoryStore async latency | [[review-gemini-review3]] | Already patched |
| Worktree teardown | [[review-gemini-review3]] | Already patched |
| Inter-agent protocol | **New — this review** | Not previously flagged |
| Concurrency + locking | **New — this review** | Not previously flagged |
| Dispatcher (Brain launcher) | **New — this review** | Not previously flagged |
| Wiki growth / tiering | **New — this review** | Not previously flagged |
| Forge rollback mechanism | **New — this review** | Not previously flagged |
| Janitor/Forge territory | **New — this review** | Conflict resolution defined |
| Cross-platform (WSL2/Win/Mac) | **New — this review** | Documented |

---

*See also: [[plan-implementation-v4]], [[review-architecture-audit]], [[review-gemini-review1]], [[review-gemini-review3]], [[concept-inter-agent-protocol]], [[concept-dispatcher]], [[concept-wiki-tiering]], [[segment-janitor]], [[segment-forge]]*
