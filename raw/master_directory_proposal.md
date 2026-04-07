# The Master Directory Scaffold

Agent4wiki/
├── .gitignore                  ← The most important security file in the repo
├── .env.example                ← Template for your root keys (never commit .env)
├── package.json                ← TypeScript, MCP SDKs, formatting tools
├── tsconfig.json               
├── README.md                   
│
├── bin/                        ← CLI Entry Points
│   └── agent4.ts               ← e.g., `npx ts-node bin/agent4.ts start`
│
├── core/                       ← THE ENGINE (TypeScript / Immutable Logic)
│   ├── memory_store/           ← Phase 1
│   │   ├── interface.ts        
│   │   └── mempalace_mcp.ts    ← MCP client wrapper
│   │
│   ├── keychain/               ← Phase 2
│   │   ├── manager.ts          ← JIT injection and revocation logic
│   │   └── scanner.ts          ← Credential leak detection regex
│   │
│   ├── routing/                ← Phase 3
│   │   └── classifier.ts       ← DIRECT / BRAIN_ONLY / FULL_PIPELINE heuristic
│   │
│   ├── user_agent/             ← Phase 3
│   │   ├── agent.ts            ← The main orchestrator
│   │   └── summary.ts          ← Compresses chat logs into state.json
│   │
│   ├── brain/                  ← Phase 4
│   │   └── planner.ts          ← Sequential Thinking MCP integration
│   │
│   ├── clones/                 ← Phase 5
│   │   ├── spawner.ts          ← Creates Git worktrees and triggers setup.sh
│   │   └── templates/          ← Your 8 Mission Briefs
│   │       ├── code_task.md    ← The Master Code Clone Template
│   │       ├── research.md
│   │       └── devops.md
│   │
│   ├── janitor/                ← Phase 6
│   │   ├── auditor.ts          ← Parses JSON handshakes (BLOCK/SUGGEST/NOTE)
│   │   └── scythe.ts           ← Wiki contradiction pruner
│   │
│   └── forge/                  ← Phase 7 (Deferred)
│       └── benchmark.ts        
│
├── state/                      ← THE VAULT (Strictly Gitignored)
│   ├── .gitkeep                ← Commit this so the empty folder tracks
│   │
│   ├── keychain/               ← Encrypted SQLite or JSON vaults
│   │   ├── master.vault        ← Your main API keys
│   │   └── kids/               ← Planet Zabave isolated wing
│   │       └── public.vault    
│   │
│   ├── memory/                 ← Local vector DB storage (if applicable)
│   │
│   ├── user_agent/             
│   │   └── state.json          ← The 500-token compressed context
│   │
│   └── worktrees/              ← The Execution Sandbox
│       ├── clone-842/          ← Auto-generated, temporary directory
│       │   ├── .env            ← JIT injected, destroyed on completion
│       │   ├── setup.sh        ← Installs Python/Node deps for the Clone
│       │   └── repomix.txt     ← Context packed by the Clone
│       └── .gitkeep
│
└── wiki/                       ← THE BRAIN'S OS (Committed to Git)
    ├── CLAUDE.md               ← Wiki schema and rules
    ├── index.md                ← Master catalog
    ├── log.md                  ← Janitor's append-only audit log
    ├── Soul.md                 ← Your voice/identity profile
    ├── raw/                    ← Immutable source documents
    ├── segments/               ← segment-brain.md, segment-clones.md, etc.
    ├── concepts/               
    ├── tools/                  
    ├── entities/               
    └── decisions/              
        └── plan-implementation-v4.md