# Decision: TypeScript Core + Python Clones

Source: Gemini recommendation, 2026-04-08
Context: Language decision required before Phase 3 (flagged by Opus review 2)

## The Decision

**TypeScript** for the Core Orchestrator: User Agent, Brain, Janitor, Keychain
**Python** for Specialized Clones exclusively — spawned as isolated subprocess workers

## Rationale

### 1. Orchestration is an I/O Problem, Not a Math Problem
The core layer isn't doing machine learning — it's doing heavy async I/O. User Agent waits for user input. Brain waits on Anthropic API calls. Keychain reads from filesystem. Janitor parses JSON. Node.js/TypeScript handles massive async I/O and concurrent file operations significantly better than Python's asyncio.

### 2. Full-Stack UI Synergy
When it's time to build the central command dashboard (React + Tailwind to visualize state.json and watch Clones work), TypeScript core means interfaces, schemas, and state objects can be shared directly with the frontend. Headless engine → interactive web app transition becomes seamless.

### 3. The MCP "Limitation" is Actually a Firewall
Accessing MemPalace via MCP server (not direct import) is a feature, not a bug:
- Phase 1 designed MemoryStore interface to abstract MemPalace away — MCP enforces this physically
- If MemPalace Python process crashes, it doesn't take down Brain or User Agent — MCP request times out, TypeScript core catches and triggers fallback
- MCP is the standard Anthropic is pushing for tool use — aligning core to speak MCP natively future-proofs the architecture

### 4. Polyglot Worktrees — Where Python Belongs
Clones operate in isolated Git worktrees. When Brain delegates a data-science or ML task:
1. Brain spins up a Python-native Clone
2. Clone's bootstrap.sh installs the Python environment
3. Clone runs native Python AI tooling
4. Clone executes, returns JSON handshake to the TypeScript Janitor

**The Engine writes TypeScript. The Engine spawns Python micro-workers when it needs native AI muscle.**
