

## explicit file structure for **Phase 4, 5, and 7**
### Expanded Phase 4: The Brain (Planning & Dispatch)
The Brain needs to separate the act of *thinking* from the act of *delegating*. 

```text
core/brain/
├── planner.ts          ← Uses Sequential Thinking MCP. Drafts the step-by-step logic.
├── dispatcher.ts       ← The routing switchboard. Takes the plan, selects the right Mission Brief (Code vs Docs), and requests credentials from the Keychain.
└── prompt_builder.ts   ← Dynamically injects Soul.md, allowedPaths, and the task into the chosen Mission Brief template before handing it to the Clone.
```

### Expanded Phase 5: Clone Lifecycle (The Execution Engine)
Clones are not just API calls; they are physical processes interacting with the disk. Their lifecycle must be violently strictly managed to prevent orphaned worktrees from eating your storage.

```text
core/clones/
├── templates/          ← Your 8 Mission Briefs (code_task.md, etc.)
│
├── lifecycle/
│   ├── spawner.ts      ← Creates the isolated Git worktree (e.g., `git worktree add ../state/worktrees/clone-123`)
│   ├── runner.ts       ← Executes the Clone's environment (triggers `setup.sh`, runs the repomix hook, calls the LLM, and waits for the JSON handshake).
│   └── teardown.ts     ← CRITICAL: Called after Janitor approval. Commits the code, deletes the temporary worktree, and prunes the git references.
│
└── clone_worker.ts     ← The main class that orchestrates spawner -> runner -> teardown.
```

### Expanded Phase 7: The Forge (The Ratchet Mechanism)
Even though we are deferring the full build of the Forge, we must scaffold its exact components now so the Janitor knows where to send its logs.

```text
core/forge/
├── shadow_runner.ts    ← Spawns a parallel Clone execution in the background using an experimental template (Variant B) while Variant A runs in production.
├── evaluator.ts        ← The "LLM-as-a-Judge". Uses Sonnet to grade Variant A vs Variant B based on the Janitor's notes and test outputs.
├── ratchet.ts          ← The 5-Win Promotion Logic. Tracks win/loss ratios. If Variant B beats A five times in a row, it rewrites the template in `core/clones/templates/`.
└── metrics_db.ts       ← A lightweight SQLite wrapper specifically to track latency, token usage, and Janitor rejection rates over time.
```

### The Strategic Map is Now Complete

By separating the `dispatcher` from the `planner`, the Brain can think freely without worrying about how a Git worktree operates. By separating the `teardown` logic from the `runner`, you guarantee that even if a Clone crashes catastrophically, the orchestrator can still clean up the disk space and revoke the `.env` keys.

We have the entire map from Phase 1 through Phase 7 fully visualized. 

Are we officially opening the code editor? Shall we draft the `mempalace_mcp.ts` wrapper (Phase 1) or the `keychain/manager.ts` (Phase 2) first?