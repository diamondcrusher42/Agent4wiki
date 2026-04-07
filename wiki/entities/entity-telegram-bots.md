# Telegram Bots

The communication layer. Claude Code is the engine; Telegram is the steering wheel.

## Admin Bot (Private)
Direct line to [[segment-brain]] and [[segment-user-agent]]. Send tasks, receive status updates, emergency alerts, query [[segment-memory]]. Full credential scope via [[tool-keychain-agent]].

## Company Role Bots (Private)
Per-entity interfaces for each d.o.o., društvo. Accounting queries routed to accounting [[segment-clones]]. Deadline reminders from [[segment-user-agent]]. Document generation requests.

## Kids Coding Bot (Public)
Public-facing, teaching kids to code. Builds websites from kids' ideas. Runs in security sandbox: --isolated flag, no admin credentials, separate MemPalace wing, content moderation by dedicated clone. Strict data privacy enforced by [[segment-user-agent]].

## Related
[[tool-keychain-agent]] (credential scoping per bot), [[concept-fallback-chains]] (bot recovery)
