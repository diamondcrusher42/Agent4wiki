# Build State 2026-04-09 v9.1

> Branch: `opus-build`
> Commit: `fd45834`
> Tests: 160 Jest + 51 pytest = 211 total (all passing)
> TSC: clean

## What was fixed (v9.1 — post Opus review mandatory fixes)

Commit `fd45834`: `fix(security): replace execSync template literals with execFileSync in teardown + ratchet`

### teardown.ts — 6 execSync calls replaced

`core/clones/lifecycle/teardown.ts`:
- `mergeWorktree()`: 3 calls → `execFileSync('git', ['-C', path, ...], ...)`
- `removeWorktree()`: 2 calls → `execFileSync('git', ['-C', REPO_ROOT, 'worktree', ...], ...)`
- `pruneBranch()`: 2 calls (both `-d` and `-D` branch delete) → `execFileSync` array form

### ratchet.ts — 2 execSync calls replaced + tag validation added

`core/forge/ratchet.ts`:
- Added tag format validation: `/^[\w./-]+$/` (allows `/` for `forge/promotion/...` namespace, blocks all shell metacharacters)
- `git tag ${tag}` → `execFileSync('git', ['tag', tag], ...)`
- `git checkout ${tag} -- "${productionPath}"` → `execFileSync` array form

## Total shell injection fixes across v8-v9.1

| Version | File | Fix |
|---|---|---|
| v8 | runner.ts (runSetup) | execAsync → execFileAsync |
| v9 | runner.ts (runRepomix) | execAsync → execFileAsync |
| v9.1 | teardown.ts (3 functions) | execSync → execFileSync × 6 |
| v9.1 | ratchet.ts (promote + revert) | execSync → execFileSync × 2 |

All known shell injection surfaces in clone lifecycle now closed.

## Status after v9.1

| Check | Result |
|---|---|
| Jest | 160/160 ✅ |
| pytest | 51/51 ✅ |
| TSC | Clean ✅ |
| Shell injection surfaces | 0 remaining ✅ |
| Opus review mandatory fixes | Done ✅ |

**Ready for testing.** Recommended (non-blocking) fixes remain: handshake JSON schema validation, context size guard, conversation history persistence.
