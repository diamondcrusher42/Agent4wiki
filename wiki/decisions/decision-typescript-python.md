# Decision: TypeScript Core + Python Clones

> Date: 2026-04-08
> Source: Gemini recommendation, filed after Opus review 2 flagged the language decision
> Status: Locked — apply to all new code in Core and Clone layers

---

## The Decision

| Layer | Language | Why |
|-------|----------|-----|
| Core Orchestrator (User Agent, Brain, Janitor, Keychain) | **TypeScript / Node.js** | Async I/O, type safety, React dashboard synergy, MCP-native |
| Specialized Clones | **Python** | Native AI/ML tooling, MemPalace, BitNet, data science ecosystem |
| Web Dashboard (future) | TypeScript / React | Shares interfaces directly with Core |
| MCP servers (MemPalace, Keychain) | Either — MCP is transport-agnostic | Accessed via JSON-RPC, not direct import |

---

## Why TypeScript for the Core

### 1. Orchestration is an I/O Problem, Not a Math Problem

The Core doesn't do machine learning — it does heavy async I/O:
- User Agent: waits for user input and Telegram events
- Brain: waits on Anthropic API calls
- Keychain: reads/writes encrypted files
- Janitor: parses JSON handshakes, runs audit sweeps

Node.js handles massive async I/O and concurrent operations significantly better than Python's `asyncio`. The Core's bottleneck is latency and concurrency, not compute.

### 2. Full-Stack UI Synergy

The future central command dashboard (React + Tailwind — visualizing `state.json`, watching Clones work) shares TypeScript interfaces directly with the Core. No translation layer needed. Schemas, types, and state objects flow from engine to UI without any conversion.

### 3. The MCP Firewall (a Feature, Not a Limitation)

Accessing MemPalace via MCP server instead of direct Python import is **deliberate isolation**:

- Phase 1 designed the `MemoryStore` interface to abstract MemPalace — MCP enforces this physically
- If the MemPalace Python process crashes, the Brain and User Agent don't crash with it — the MCP request times out, the TypeScript Core catches the error and triggers the [[concept-fallback-chains|fallback chain]]
- MCP is the standard Anthropic is building toward — the Core speaks MCP natively from day one

### 4. Type Safety for Interface Contracts

The `MemoryStore` interface, `HandshakeResult`, `MissionBrief`, `InteractionDigest` — these are exactly the kind of contracts that benefit from TypeScript's compile-time enforcement. Python duck-typing would pass any object silently; TypeScript fails at compile time on mismatches.

---

## Why Python for Clones

Clones are Python-native when they need AI/ML muscle:

```
Brain (TypeScript) → creates worktree → writes TASK.md
  ↓
Clone bootstrap.sh → pip install, activate venv
  ↓
Clone runs: MemPalace / BitNet / data science / Anthropic SDK (Python)
  ↓
Clone outputs JSON handshake
  ↓
Janitor (TypeScript) → parses handshake → BLOCK / SUGGEST / NOTE
```

The Clone is isolated in its worktree — it can use any language its skill requires. The handshake JSON is the only interface back to the TypeScript Core.

---

## What This Changes

- **`core/memory_store/interface.ts`** — already TypeScript ✅
- **`core/keychain/manager.ts`** — already TypeScript ✅
- **`brain/dispatcher.py`** — rename to `brain/dispatcher.ts` — TypeScript
- **`brain/planner.ts`** — TypeScript
- **`user-agent/summary-pipeline.py`** — rename to `summary-pipeline.ts` — TypeScript
- **Clone bootstraps** — Python (`setup.sh` + `venv`) per worktree
- **MemPalace adapter** — TypeScript MCP client calling MemPalace's 19-tool server via JSON-RPC

---

## What This Does NOT Change

- Clone mission briefs (TASK.md) — language-agnostic templates
- The MemoryStore interface — already async-first and abstracted
- The Keychain Manager — already TypeScript, spawn injection already uses Node.js `child_process`
- MCP as the inter-agent protocol — transport-agnostic
- E2B / Docker isolation tiers — container-level, language-agnostic

---

*See also: [[review-opus-review2]], [[concept-inter-agent-protocol]], [[tool-mcp-protocol]], [[tool-mempalace]], [[concept-git-worktrees]]*
