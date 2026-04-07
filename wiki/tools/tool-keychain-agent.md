# Keychain Agent

Digital keychain for multi-agent systems. Original design from this architecture session.

Encrypted vault (AES-256-GCM + Argon2id KDF). Scoped injection: agents request capabilities, not credentials. Leak scanner with regex patterns (API keys, PII, IBANs, Slovenian tax IDs). Audit logging. Rotation scheduler. [[concept-fallback-chains|Fallback chains]] for graceful degradation. Six droids: credential-expiry, leak-watch, service-health, rate-limit, telegram-heartbeat, private-info-scan.

Public bot (kids coding) runs with --isolated flag: sandboxed, no parent env leakage, zero access to admin credentials.

Repo scaffolded and ready to push. Python 3.9+, cryptography, argon2-cffi, pyyaml, watchdog, click.

## Used By
[[segment-user-agent]] (credential vault and security)
