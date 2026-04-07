# Directory Structure Review
The three-zone separation is clean: core/ (committed code, the engine), state/ (gitignored runtime data, the vault), wiki/ (committed knowledge, the brain's OS). This is the right division — code and knowledge travel in git, secrets and ephemeral state stay local.
The TypeScript commitment is now explicit. The directory has package.json, tsconfig.json, bin/agent4.ts. This means the orchestration layer is Node.js. The dispatcher I built in Python would need to be either ported to TypeScript or called as a subprocess. Given that you have the MemoryStore interface, Keychain manager, Janitor auditor, and now the routing classifier all in TypeScript, the decision is made — the core engine is TypeScript, Python tools (MemPalace, BitNet, /last30days) are called via MCP or subprocess.
This is actually the right call for the orchestration layer. TypeScript gives you type safety on the contracts (MemoryStore interface, Task schema, AuditResult), async/await for concurrent clone management, and the MCP SDK is natively available in Node.js. Python stays for the AI-specific tooling where the ecosystem is strongest.
The phased numbering in the directory comments is useful. It shows build order: Phase 1 (memory_store) → Phase 2 (keychain) → Phase 3 (routing + user_agent) → Phase 4 (brain) → Phase 5 (clones) → Phase 6 (janitor) → Phase 7 (forge). This matches the architecture spec's phased rollout but with a key addition I didn't have: Phase 3 includes a routing classifier.
The routing classifier (core/routing/classifier.ts) is new and important. Three modes: DIRECT, BRAIN_ONLY, FULL_PIPELINE. This is the intelligence that decides whether a task needs the full Brain → Clone → Janitor pipeline or can be handled directly. A simple question ("what time is my meeting?") doesn't need a clone worktree. A complex task ("refactor the authentication module") needs the full pipeline. This is a missing piece from the architecture spec — the dispatcher I built treats everything as a full pipeline task. The classifier sits between the dispatcher and the execution engine and saves resources on simple tasks.
One structural issue: state/worktrees/ as the clone sandbox location. The git worktree command creates directories at the path you specify — they don't have to be inside the repo. Putting worktrees inside state/ means they're inside the repo's directory tree, which can cause git confusion (nested git state). The standard pattern is to create worktrees as siblings of the repo, not children:
~/
├── agent-v4/           ← the repo
└── clone-code-842/     ← worktree (sibling, not child)
If you keep worktrees inside state/, you need to make sure .gitignore catches them properly (which the gitignore does with state/*) and that the worktrees reference the parent repo's .git correctly. It works, but siblings are cleaner. Consider changing state/worktrees/ to a path like ~/.agent4-worktrees/ that's completely outside the repo.
Soul.md is in wiki/ but the architecture spec puts it in user-agent/profile/. Both locations have arguments: in wiki/ it's committed and versioned (good), but it's also visible in the public repo if the repo is public (could be a privacy issue if SOUL.md contains personal communication patterns). In state/user_agent/ it's private but not versioned. Recommendation: keep it in wiki/ but add it to .gitignore if the repo is public. Or better: have two files — wiki/Soul.md with the generic voice profile (committed) and state/user_agent/soul-private.md with personal details (gitignored). The clone template injects both.
Missing from the structure: events/ directory. The dispatcher logs to events/dispatcher.jsonl. The Forge reads from event streams. The Janitor writes audit events. There's no events/ directory in this structure. Add it either under state/ (if ephemeral) or as a top-level directory (if you want event history in git).
Missing: config/ directory. The Keychain's scopes.yaml, fallback.yaml, patterns.yaml, rotation.yaml need a home. These are committed (not secret), so they should be in core/keychain/config/ or a top-level config/ directory. The current structure only has core/keychain/manager.ts and scanner.ts — the config files are orphaned.

## Gitignore Review
The defense-in-depth approach is correct. The gitignore blocks the entire state/ directory, then explicitly preserves .gitkeep files so the directory structure survives. The redundant .env and *.pem blocks at the top catch credentials that accidentally land outside state/. The final line specifically targets state/worktrees/*/.env as an extra safety net.
Two additions needed:
First, audit logs. If event/audit logs live in state/, they're already covered. But if they're anywhere else (like wiki/log.md containing sensitive operational details), you should decide: is wiki/log.md safe to commit? It records what operations happened but not credential values. Probably fine, but worth a conscious decision.
Second, add these patterns:
# Dispatcher runtime
*.dispatcher-prompt.md
events/*.jsonl

# Python artifacts (for MCP/MemPalace/BitNet tooling)
__pycache__/
*.py[cod]
*.egg-info/
.venv/

# Vault backups
*.vault.bak
*.vault.tmp
The .env.example file mentioned in the directory structure is a good practice — it shows what keys are needed without exposing values. It should list every key that appears in scopes.yaml with placeholder values:
# .env.example — copy to .env and fill in your values
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_ADMIN_BOT=123456:ABC...
TELEGRAM_KIDS_BOT=123456:DEF...
GITHUB_TOKEN=ghp_...
EXA_API_KEY=...

### Cross-File Status
You now have solid contracts and structure for:
ComponentStatusFileMemory interfaceContract defined (TypeScript)MemoryStore_Interface_template.mdKeychainMVP logic defined (TypeScript)Keychain_Agent_MVP.mdTASK templateComplete with lifecycleTASK_template.mdJanitorAuditor + WikiScythe defined (TypeScript)janitor.mdDirectory structureComplete scaffoldmaster_directory_proposal.mdGitignoreSecurity-hardenedgitignore_template.mdDispatcherWorking Python implementationdispatcher.py