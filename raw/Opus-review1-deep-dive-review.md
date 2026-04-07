# Agent V4 Architecture — Deep Dive Review

## Status of Decision Files

The three decision files on GitHub are unchanged from the original versions we created. No comments or reviews have been added to them yet. The repo has 6 commits, clean structure, README with navigation table. Good foundation.

---

## BLIND SPOTS

### 1. Inter-agent communication protocol is undefined
The architecture describes what each segment does but never specifies HOW they talk to each other. When the Brain dispatches a clone, what's the message format? When the Janitor flags an issue, how does the Brain receive it? When a droid detects a leak, how does it alert the User Agent?

**The gap:** No message bus, no event system, no queue. Right now the implicit assumption is "files on disk" — but that means polling, race conditions, and no guaranteed delivery.

**Fix:** Define a lightweight event protocol. Options: a simple JSON-lines event log that every agent appends to and watches (simplest), a SQLite-backed message queue (more robust), or Redis pub/sub if you want real-time (most complex but your Docker setup supports it). Start with the JSON-lines approach — a file per channel (brain-to-clones.jsonl, janitor-alerts.jsonl, etc.).

### 2. Concurrency and locking
Multiple clones running in parallel worktrees will write to the same wiki, the same Memory palace, the same audit logs. Git handles code merges, but what about `memory/wiki/index.md` being updated by two clones simultaneously? What about `user/tasks.json` being read by the User Agent while the Brain writes to it?

**Fix:** Designate a single writer per critical file. Only the Brain writes to `wiki/index.md`. Only the User Agent writes to `user/state.json`. Clones write to `clones/results/{clone-id}/` — their own isolated space — and the Brain merges results into the wiki in a single-threaded post-processing step. Use file-level advisory locks (fcntl/flock) for anything that truly needs concurrent access.

### 3. The "start from /new" problem
The Brain starts fresh every session. But who starts the Brain? If it's you via Telegram, that's manual. If it's a cron job, the Brain needs to know WHY it was started. If a droid detects a problem and needs the Brain to respond, who translates the droid alert into a Brain session?

**Fix:** Define a dispatcher — a lightweight script (not a full agent) that watches the event queue and launches Brain sessions with appropriate context. The dispatcher is the missing glue between always-on components (User Agent, droids) and session-based components (Brain, clones). It could be as simple as a Python script watching a directory for .json task files and running `claude code` with the task as input.

### 4. Wiki growth without boundaries
The wiki will grow forever. Every clone output gets atomized into wiki pages. Every research pass adds pages. Every conversation gets ingested. After 6 months you could have 500+ pages. The index.md becomes too large. Semantic search becomes slow. The Brain's startup sequence (read index → find relevant pages) consumes increasing tokens.

**Fix:** Implement wiki tiers: hot (last 30 days, always indexed), warm (31-90 days, searchable but not in index), cold (90+ days, archive). The Janitor's lint pass should include a "compress and archive" operation that moves stale pages to cold storage and updates the index. MemPalace's hot/warm/cold tiers should map directly to wiki page tiers.

### 5. No rollback mechanism
The Forge proposes improvements and the Brain promotes them. But what if a promoted change is subtly worse in ways that take a week to notice? There's no mechanism to revert a promotion.

**Fix:** Git gives you this for free — every promotion is a merge commit. The Forge should tag every promotion with a `forge/promoted/{date}-{process}` git tag. Rollback is `git revert`. The Forge should also track a "probation period" — the first 10 uses after promotion are monitored more closely, and automatic revert triggers if error rate exceeds a threshold.

---

## CONFLICTS TO WATCH

### Janitor vs. Forge territory overlap
Both audit clone quality. Both propose improvements. The Janitor says "this is broken, simplify it." The Forge says "I built a better version, promote it." If they disagree about what "better" means, who wins?

**Resolution:** The Janitor is reactive (finds problems in what exists). The Forge is proactive (builds alternatives). They should never modify the same thing in the same cycle. Rule: Janitor runs first, Forge runs after. Janitor can veto a Forge promotion if it introduces a quality regression.

### Brain context budget vs. wiki richness
The richer the wiki gets, the more context the Brain needs to reconstruct on startup. But the Brain's token budget is fixed. At some point, reading the index alone exceeds the budget.

**Resolution:** The index must stay under 500 tokens. This means aggressive summarization — each entry gets a 5-word description, not a sentence. If the wiki grows past 100 pages, the index becomes a two-tier structure: category summaries (always loaded) + per-category detail pages (loaded on demand).

### Clone isolation vs. collaboration
Clones run in isolated worktrees. But some tasks require clone collaboration (research clone feeds code clone). The isolation model makes direct collaboration impossible — they can't read each other's worktrees.

**Resolution:** Collaboration happens through Memory, not directly. Research clone writes findings to `clones/results/{clone-id}/findings.md`. Brain reads it, creates a new mission brief for the code clone that includes the findings. This is sequential, not parallel — the collaboration cost is latency (one clone waits for another to finish). For true parallelism, both clones must work independently and the Brain merges results afterward.

---

## GITHUB REPO STRUCTURE

```
agent-v4/
├── .github/
│   ├── workflows/
│   │   └── credential-scan.yml     # GitHub Actions: scan every PR for leaked secrets
│   └── CODEOWNERS                  # Who approves what
├── wiki/                           # The Karpathy wiki (Agent4wiki content)
│   ├── index.md
│   ├── log.md
│   ├── segments/
│   ├── concepts/
│   ├── tools/
│   ├── entities/
│   └── decisions/
├── keychain/                       # Keychain Agent (credential vault)
│   ├── src/
│   ├── droids/
│   ├── config/
│   └── templates/
├── brain/
│   ├── templates/                  # Clone skill templates
│   ├── dispatcher.py               # Watches event queue, launches Brain sessions
│   └── planner.py                  # Plan decomposition logic
├── user-agent/
│   ├── state/                      # state.json, tasks.json, services.json
│   ├── profile/                    # profile.md, soul.md
│   └── summary-pipeline.py         # Interaction → digest compression
├── forge/
│   ├── briefs/
│   ├── errors/
│   ├── tools/
│   ├── replacements/
│   ├── capabilities/
│   ├── diagnostics/
│   └── meta/
├── bots/
│   ├── admin/                      # Telegram admin bot
│   ├── company/                    # Per-entity company bots
│   └── kids-coding/                # Public kids coding bot (sandboxed)
├── scripts/
│   ├── setup.sh                    # First-time system setup
│   ├── worktree-create.sh          # Create clone worktree with mission brief
│   ├── worktree-cleanup.sh         # Remove merged worktrees
│   └── daily-maintenance.sh        # Janitor + Forge daily cycle
├── config/
│   ├── scopes.yaml                 # Agent-to-credential mapping
│   ├── fallback.yaml               # Degradation chains
│   ├── patterns.yaml               # Credential + PII patterns
│   └── rotation.yaml               # Key rotation schedules
├── memory/
│   ├── raw/                        # Immutable sources
│   ├── palace/                     # MemPalace data
│   └── schemas/                    # JSON schemas for all state files
├── .gitignore                      # Vault files, .env, credentials, audit logs
├── CLAUDE.md                       # For Claude Code sessions
├── README.md
├── LICENSE
└── requirements.txt
```

**Credential protection:**
- `.gitignore` blocks: `*.vault`, `*.env`, `credentials/`, `secrets/`, `audit/*.json`
- GitHub Actions workflow runs `trufflehog` or `gitleaks` on every PR
- Pre-commit hook runs the Keychain scanner locally before any commit
- `config/` contains YAML configs (no secrets) — scopes, patterns, schedules
- Actual vault data lives in `~/.keychain-agent/` (outside the repo, never committed)
- The repo contains the code and config, never the data

---

## CROSS-PLATFORM COMPATIBILITY

### Windows PowerShell
- Git worktrees: native git, works fine
- Python scripts: works (Python 3.9+)
- File permissions (chmod 600): Windows doesn't support Unix permissions natively. Use NTFS ACLs instead or rely on Windows Credential Manager integration
- Cron jobs → Windows Task Scheduler (schtasks)
- Shell scripts (.sh) → need WSL2 or Git Bash. Write critical scripts in Python for portability.

### WSL2 (your primary environment)
- Everything works. Linux environment inside Windows
- Gotcha: file system bridge between Windows and WSL2 is slow. Keep the repo inside WSL2 filesystem (`~/agent-v4/`), not on `/mnt/c/`
- Docker: runs natively in WSL2
- BitNet: builds with cmake/clang in WSL2

### Linux
- Native environment. Everything works as designed
- Cron for scheduling, systemd for daemons
- Best performance for BitNet CPU inference

### macOS
- Git worktrees: native
- Python: works (homebrew or system)
- Cron → launchd (different syntax, same function)
- BitNet: ARM kernels optimized for Apple Silicon
- Keychain: could integrate with macOS Keychain.app for additional security layer

**Recommendation:** Write all automation in Python (not bash) for cross-platform compatibility. Use `pathlib` for paths, `subprocess` for shell commands, `platform` module for OS detection. The cos-review pattern from AI Personal OS already handles OS detection (LaunchAgents vs schtasks vs cron).

---

## PRODUCTIZATION

### Free Tier (Open Source — MIT)
- Wiki pattern + structure (Agent4wiki)
- Keychain Agent (vault, injector, scanner)
- Brain templates and mission brief format
- Clone skill template system
- Janitor audit rules
- Forge shadow benchmarking framework
- All droids
- Documentation and setup guides

### Premium Tier (Paid)
- **Hosted Keychain vault** with team credential sharing, audit dashboards, rotation automation
- **Pre-built clone skill packs**: accounting (multi-entity reconciliation), legal (contract review), health (supplement optimization), real estate, e-commerce
- **Forge-as-a-Service**: hosted shadow benchmarking with performance dashboards, A/B test management, improvement trend reports
- **Team features**: shared wiki with role-based access, multi-user Brain with delegation, team-wide Telegram bot management
- **Enterprise**: SSO, compliance audit exports, custom droid development, SLA on support
- **Managed hosting**: the entire system running on cloud infrastructure with monitoring

### Individual Users
**Package as:** A single `setup.sh` that initializes the wiki, creates user profile through onboarding conversation, sets up Keychain, installs droids, configures Telegram admin bot. User adds their API keys and they're running in 30 minutes.

**Target:** Solo developers, freelancers, entrepreneurs managing multiple projects. The value proposition is "your AI remembers everything, works in parallel, and never leaks your secrets."

### Business Teams
**Package as:** A Docker Compose stack with shared wiki, team Keychain vault, per-role Telegram bots, admin dashboard. Includes onboarding for each team member (creates their profile, configures their scope).

**Target:** Small teams (5-20 people) doing knowledge work — dev teams, consulting firms, investment teams, research groups. The value proposition is "institutional memory that doesn't leave when people do."

---

## REAL-WORLD TASKS AND AUTONOMY LEVELS

### High Autonomy (can run unattended)
- Research briefings via /last30days watchlists
- Wiki maintenance (lint, prune, update cross-references)
- Credential rotation reminders
- Service health monitoring and restart
- Daily log analysis and pattern reporting
- Code linting and formatting across repos
- Backup verification

### Medium Autonomy (needs approval at key points)
- Code generation (Brain plans, clones execute, human reviews before merge)
- Document creation (grant applications, business plans — draft then review)
- Accounting reconciliation (propose entries, human approves)
- Telegram bot responses to known question types
- Email drafting and scheduling

### Low Autonomy (human-in-the-loop throughout)
- Business decisions (the system provides analysis, human decides)
- Public-facing content (kids coding bot responses need content moderation)
- Financial transactions
- Legal document signing
- Hiring/personnel decisions

### Current Limitations

**Memory:** MemPalace is unproven at scale (6 commits, 11 stars). ChromaDB has known performance issues above 100k documents. AAAK compression is novel and untested with your specific data types. The wiki pattern doesn't have a built-in archival/tiering mechanism yet.

**Clones:** Each clone is a full Claude Code session — there's a practical limit to how many you can run simultaneously (API rate limits, local compute). Git worktree overhead is real: each worktree duplicates working files. On a 256GB SSD, 20 simultaneous worktrees of a large repo will eat disk fast.

**Droids:** They're scripts, not agents. They can detect problems but can't fix them autonomously. The dispatcher (launching Brain sessions from droid alerts) doesn't exist yet — it's a gap in the architecture.

**Forge:** Shadow benchmarking doubles compute cost. Running every process twice (production + shadow) means your API budget halves. The 80/20 split (80% building, 20% watching) needs careful budget management.

**BitNet:** The 2B model is small. It can handle formatting, scanning, and simple tasks, but it can't do complex reasoning, code generation, or nuanced writing. The tier system (BitNet for grunt work, Claude for judgment) only works if you correctly classify which tasks need which tier. Misclassification means either wasted API budget or bad outputs.

---

## OBVIOUS UPGRADES NOT YET CONSIDERED

### 1. MCP Server for the Keychain
Instead of CLI-based `keychain inject`, expose the Keychain as an MCP server. Claude Code sessions can then request credentials as tool calls. This is cleaner than environment variable injection and works across any MCP-compatible tool.

### 2. Obsidian as the wiki viewer
The wiki is markdown with wikilinks — drop it into Obsidian and get graph view, backlinks, and search for free. You already use Notion, but Obsidian runs locally (privacy), handles wikilinks natively, and the graph view shows you the shape of your knowledge at a glance. This is the viewer; Claude Code is the writer.

### 3. Voice interface via Telegram voice messages
You describe yourself as preferring talking over writing. Telegram supports voice messages. A droid could transcribe voice messages (Whisper on local GPU) and feed them to the Brain as tasks. You talk to your phone, the system executes. This leverages your natural preference instead of fighting it.

### 4. Pre-commit hook as a Keychain droid
Instead of scanning after the fact, block commits that contain credentials. A git pre-commit hook that runs `keychain scan --staged` and rejects the commit if patterns match. This is cheaper than rotating a leaked key.

### 5. Wiki diff reports
A weekly digest showing what changed in the wiki: new pages, updated pages, archived pages, new cross-references. Delivered via Telegram admin bot. This gives you a bird's-eye view of how the knowledge base is evolving without reading every page.

### 6. Cost tracking droid
A droid that monitors API spending in real-time. Tracks: tokens consumed per segment, cost per clone mission, cost trend over time, budget remaining. Sends alerts when spending exceeds thresholds. This is the financial counterpart to the Forge's performance tracking.

---

## LOW-HANGING FRUIT

1. **Add `.github/workflows/credential-scan.yml`** — takes 5 minutes, prevents accidental secret commits forever
2. **Create `scripts/worktree-create.sh`** — standardize how clones are launched, enforce naming convention
3. **Add pre-commit hook** to Agent4wiki repo that validates wikilinks (no broken `[[references]]`)
4. **Write the dispatcher** — 50 lines of Python that watches a directory for task files and launches Claude Code sessions
5. **Set up daily Telegram digest** — one message per day summarizing what the system did (tasks completed, errors, wiki changes)
6. **Move vault data path** to `~/.keychain-agent/` (outside any repo) and document it
