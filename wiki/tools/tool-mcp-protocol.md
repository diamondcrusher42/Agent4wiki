# MCP — Model Context Protocol

> Source: `raw/Claude-Agentic-Workflow-Ecosystem-Deep-Dive.pdf` | Created: 2026-04-08
> Official spec: modelcontextprotocol.io

## What It Is

Open-source standard by Anthropic (late 2024) that resolves the "N×M integration problem" — previously every model-tool pairing needed a bespoke connector. MCP standardizes the interface between AI models and external data sources/tools.

## Host-Client-Server Triad

| Component | Role | Interaction |
|-----------|------|-------------|
| MCP Host | Primary application (IDE, Claude Desktop). Manages LLM + environment. | Initiates lifecycle, provides user interface |
| MCP Client | Protocol translator inside the Host. | Queries servers for tool metadata, validates calls |
| MCP Server | Exposes resources, tools, and prompts. | Data retrieval and function execution |
| Transport | JSON-RPC 2.0 | stdio (local, fast) or SSE (remote, persistent) |

**Dual nature of tool descriptions:** Each tool description is simultaneously a functional spec for the server AND a prompt-like instruction that shapes the model's reasoning during planning. The description quality directly affects task success rate.

## Code Mode (Code Execution with MCP)

> Source: Anthropic engineering blog — 98.7% token reduction validated

Traditional tool loading: every tool's full JSON schema is loaded into context upfront. With n tools, context = Σ T_schema_i + T_results. At scale this overwhelms the context window.

**Code Mode** treats MCP servers as code APIs. The agent writes small code snippets to interact with the server rather than loading JSON schemas:
- Traditional: 150,000 tokens for same task
- Code Mode: 2,000 tokens — **98.7% reduction**
- Formula: C_code_mode = T_API_def + T_selected_tools + T_filtered_results

**Implication for this architecture:** [[segment-brain]] should interact with MCP servers via Code Mode by default. Never load full tool schemas unless a specific tool call requires it. See [[concept-token-economics]].

## Top Community MCP Skills

### Must-Have Technical

| Skill | Package | What it does |
|-------|---------|-------------|
| Sequential Thinking | `@modelcontextprotocol/server-sequential-thinking` | Structured thought branching: revisesThought, branchFromThought. Forces step-by-step reasoning, prevents premature conclusions. Auditable reasoning chain. |
| GitHub Orchestration | GitHub MCP server | Full SDLC in chat: issues, branches, PRs, commit history. Creates feature branch → modifies files → submits PR. |
| Repomix | `yamadashy/repomix` | Context packing: entire repo → single XML/Markdown file. Tree-sitter smart compression removes implementation details, keeps signatures. ~70% token reduction. Respects .gitignore. |
| Context7 | `@context7/mcp-server` | Real-time docs for 50+ frameworks (React, FastAPI, Next.js). Replaces static training knowledge with live API references. Reduces hallucination on deprecated methods. |
| Playwright/Puppeteer | Browser MCP servers | Browser automation: click, fill, screenshot. Visual design audits, UI bug detection, data extraction from dynamic sites without APIs. |

### High-Value Analytical Patterns

| Pattern | What it does |
|---------|-------------|
| **Evidence-Anchored Synthesis** | Every claim must cite a specific evidence anchor (quote/metric). Binary constraints (nouns not adjectives), hard limits, rationale in `<thinking>`, "Confidence and Caveats" footer. Transforms summarizer into rigorous analyst. |
| **5-Lens Framework** | Multi-pass audit: Assumption Audit → Narrative Flow → Notation Registry → Pedagogy Review → Visual Audit. Catches contradictions missed in single-pass summaries. |
| **Absolute-Human Workflow** | INTAKE → DECOMPOSE → DISCOVER → PLAN → EXECUTE → VERIFY → CONVERGE. Persistent `board.md` as stateful memory across sessions. Agent only asks what it cannot autonomously infer. |

## Source Directory (Community)

| Repo / Source | Purpose | Status |
|--------------|---------|--------|
| `modelcontextprotocol/servers` | Official Anthropic reference implementations | Gold Standard |
| `travisvn/awesome-claude-skills` | Curated prompt templates and skill modules | Highly Maintained |
| `appcypher/awesome-mcp-servers` | Comprehensive community MCP catalog | ~8.9k stars |
| `yamadashy/repomix` | Context optimization, codebase packing | High adoption |
| `AbsolutelySkilled` | Autonomous agentic workflow registry | Trend leader |
| `e2b-dev/E2B` | Open-source sandbox runtime (Firecracker microVMs) | 11.6k stars |
| `mcpservers.org` | Centralized web registry | Primary directory |

*See also: [[concept-inter-agent-protocol]], [[concept-token-economics]], [[tool-keychain-agent]], [[concept-git-worktrees]]*
