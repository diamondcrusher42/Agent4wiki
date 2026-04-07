# Keychain Agent

Digital keychain for multi-agent systems. Original design from this architecture session.

Encrypted vault (AES-256-GCM + Argon2id KDF). Scoped injection: agents request capabilities, not credentials. Leak scanner with regex patterns (API keys, PII, IBANs, Slovenian tax IDs). Audit logging. Rotation scheduler. [[concept-fallback-chains|Fallback chains]] for graceful degradation. Six droids: credential-expiry, leak-watch, service-health, rate-limit, telegram-heartbeat, private-info-scan.

Public bot (kids coding) runs with --isolated flag: sandboxed, no parent env leakage, zero access to admin credentials.

Repo scaffolded and ready to push. Python 3.9+, cryptography, argon2-cffi, pyyaml, watchdog, click.

## ⚠️ Credential Proxying Upgrade

> Source: [[review-pdf-agentic-ecosystem]]

Current design injects credentials as environment variables into clone environments. Risk: env vars are visible inside the sandbox and can be scraped by malicious MCP servers (credential scraping attack vector).

**Upgrade:** Credential proxying — inject secrets as HTTP Authorization headers via a host-side proxy, never as env vars inside the sandbox. Clone makes HTTP request → host proxy adds the credential header → clone never sees the raw secret.

**Pairs with:** MCP client-side tokenization — replace PII (email addresses, IBANs, tax IDs) with tokens like `[EMAIL_1]` before they reach the model. Untokenization lookup stays in the client layer.

## ⚠️ MCP Server Target Architecture

> Source: [[review-pdf-agentic-ecosystem]] + [[review-opus-review1]]

The Keychain Agent should be implemented as an MCP server rather than a CLI tool. Benefits:
- Agents request credentials as tool calls (reflective discovery)
- Per-user authorization per MCP server call (prevents Confused Deputy problem)
- Works with any MCP-compatible host automatically
- stdio transport = no network exposure

**Confused Deputy threat:** If OAuth scopes are misconfigured, the model can use the server's broad permissions to access resources the end-user shouldn't reach. Fix: per-user authorization in every MCP server call, not just per-agent scoping.

## Used By
[[segment-user-agent]] (credential vault and security)
