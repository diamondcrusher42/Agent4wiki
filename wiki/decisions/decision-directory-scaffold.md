# Decision: Master Directory Scaffold

> Source: [[raw/master_directory_proposal.md]] | Author: Gemini

## The Canonical Structure

```
Agent4wiki/
├── .gitignore          ← State Vault security boundary (committed)
├── .env.example        ← Key template (committed, .env never committed)
├── package.json        ← TypeScript + MCP SDKs
├── tsconfig.json
├── README.md
│
├── bin/
│   └── agent4.ts       ← CLI: start | status | audit
│
├── core/               ← TypeScript Engine (immutable logic)
│   ├── memory_store/   ← Phase 1 ✓
│   ├── keychain/       ← Phase 2 ✓
│   ├── routing/        ← Phase 3 ✓
│   ├── user_agent/     ← Phase 3 ✓
│   ├── brain/          ← Phase 4 (planner.ts stub)
│   ├── clones/         ← Phase 5 (spawner.ts stub)
│   │   └── templates/  ← Mission Brief templates (migration from /templates/)
│   ├── janitor/        ← Phase 6 ✓
│   └── forge/          ← Phase 7 (benchmark.ts stub)
│
├── brain/              ← Python dispatcher infrastructure (MVP exception)
│   ├── dispatcher.py   ← Watch daemon (Python — see [[decision-typescript-python]])
│   └── TASK-FORMAT.md  ← Task JSON spec
│
├── state/              ← Runtime Vault (fully gitignored via .gitignore)
│   ├── keychain/
│   ├── memory/
│   ├── user_agent/
│   └── worktrees/
│
├── templates/          ← Root-level Mission Briefs (migrate to core/clones/templates/ in Phase 5)
│   └── code-clone-TASK.md
│
├── raw/                ← Immutable source documents
│
└── wiki/               ← The Brain's OS (all committed)
    ├── CLAUDE.md       ← Wiki schema and rules
    ├── Soul.md         ← Agent identity profile
    ├── index.md
    ├── log.md
    ├── segments/
    ├── concepts/
    ├── tools/
    ├── entities/
    └── decisions/
```

## Implementation Status

| Component | File | Status |
|-----------|------|--------|
| Memory | core/memory_store/interface.ts | ✓ Phase 1 |
| Keychain | core/keychain/manager.ts | ✓ Phase 2 |
| Classifier | core/routing/classifier.ts | ✓ Phase 3 |
| User Agent | core/user_agent/agent.ts | ✓ Phase 3 |
| Dispatcher | brain/dispatcher.py | ✓ Phase 4 (Python MVP) |
| Brain Planner | core/brain/planner.ts | stub — Phase 4 |
| Clone Spawner | core/clones/spawner.ts | stub — Phase 5 |
| Janitor | core/janitor/auditor.ts + scythe.ts | ✓ Phase 6 |
| Forge | core/forge/benchmark.ts | stub — Phase 7 |
| CLI | bin/agent4.ts | stub — wires up on Phase 5 |

## Known Conflicts

### brain/ at root (Python) vs core/brain/ (TypeScript)
Two different things:
- `brain/dispatcher.py` — Python watch daemon (infrastructure, no LLM calls)
- `core/brain/planner.ts` — TypeScript Brain orchestrator (reasoning, Sequential Thinking MCP)

These coexist intentionally. The dispatcher is a Phase 4 Python MVP; the planner is the Phase 4 TypeScript reasoning core. See [[decision-typescript-python]].

### templates/ at root vs core/clones/templates/
Migration deferred to Phase 5. The root `templates/` holds the master Code Clone template; `core/clones/templates/` is the canonical long-term location. A README.md in the new location documents the migration path.
