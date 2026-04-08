# Code Suggestions — Skills Playbook Implementation

> Date: 2026-04-08
> Source: [[review-skills-playbook]], [[concept-skill-budget]]
> Branch to implement on: `opus-build`

These are concrete code changes the skills architecture requires. Ordered by impact and dependency.

---

## 1. Task JSON Schema — Add `required_skills` Field

**File:** `brain/TASK-FORMAT.md` + `brain/dispatcher.py` + task JSON validation

**Change:** Add `required_skills` array to clone task schema.

```json
{
  "id": "task-002",
  "type": "clone",
  "skill": "code",
  "required_skills": ["code-review", "testing"],
  "required_keys": ["ANTHROPIC_API_KEY"],
  "objective": "..."
}
```

`required_skills` = skill names from the library (`~/.claude/skills/` or repo `skills/` dir). The spawner copies only these into the worktree `.claude/skills/` before the claude session starts.

**Why first:** Everything else depends on the spawner knowing which skills to provision. This is the schema change that enables per-clone skill isolation.

---

## 2. CloneSpawner — Skill Provisioning Step

**File:** `core/clones/lifecycle/spawner.ts`

**Change:** Add `provisionSkills()` method called after worktree creation, before runner.

```typescript
/**
 * Copy only the required skills into the clone's worktree.
 * Skills live in REPO_ROOT/skills/ library.
 * Destination: worktreePath/.claude/skills/
 */
private async provisionSkills(worktreePath: string, requiredSkills: string[]): Promise<void> {
  const skillsLibrary = path.join(REPO_ROOT, 'skills');
  const dest = path.join(worktreePath, '.claude', 'skills');
  await fs.promises.mkdir(dest, { recursive: true });

  for (const skillName of requiredSkills) {
    const src = path.join(skillsLibrary, `${skillName}.md`);
    if (!await fileExists(src)) {
      console.warn(`[SPAWNER] Skill not found in library: ${skillName}`);
      continue;
    }
    await fs.promises.copyFile(src, path.join(dest, `${skillName}.md`));
    console.log(`[SPAWNER] Provisioned skill: ${skillName}`);
  }
}
```

Call in `createWorktree()` after setup.sh is written:

```typescript
if (task.required_skills?.length) {
  await this.provisionSkills(worktreePath, task.required_skills);
}
```

**Security note:** Skills are copied from a controlled library, not fetched from the internet at runtime. The library is version-controlled and audited. The spawner never pulls a skill it hasn't seen before.

---

## 3. Skills Library Directory

**File:** `skills/` (new top-level directory in repo)

**Change:** Create `skills/` as the canonical skill library. Each skill is one `.md` file following the Claude Code skill format.

```
skills/
  code-review.md         ← review code quality, find issues
  testing.md             ← write and run tests
  browser.md             ← Chrome automation via MIKE
  research.md            ← web research, Exa/scraping
  wiki-maintenance.md    ← wiki lint, cross-reference, stale content
  security-scan.md       ← credential check, dependency audit
  accounting.md          ← Slovenian d.o.o., DDV, FURS
  best-practices.md      ← coding standards (pull-based reference)
```

**Budget tracking file:** `skills/BUDGET.md` — lists all skills, which project contexts they're active in, last audit date.

**Gitignore note:** `skills/` is committed. Runtime `.claude/skills/` in worktrees is gitignored (part of `state/**`).

---

## 4. Docker Sandbox Flag in Spawner

**File:** `core/clones/lifecycle/spawner.ts`

**Change:** Add `sandboxed` option to `createWorktree()`. When set, the runner executes the claude session inside an ephemeral Docker container.

```typescript
interface WorktreeOptions {
  sandboxed?: boolean;  // default: false (trusted skills); true for first 5 runs of new skills
}

// In CloneRunner.run() when sandboxed=true:
const dockerCmd = [
  'docker', 'run', '--rm',
  '--network=none',
  '-v', `${worktreePath}:/workspace:ro`,
  '--tmpfs', '/tmp',
  '--workdir', '/workspace',
  'agent4-sandbox:latest',   // pre-built image with node + python + claude CLI
  'claude', '--print', '--dangerously-skip-permissions', '-p', escapedPrompt
].join(' ');
```

**Graduation tracking:** Add `sandbox_runs: number` to the clone registry entry. Spawner auto-sets `sandboxed=false` after 5 successful runs for a given skill, pending Janitor audit sign-off.

---

## 5. Scopes.yaml — Per-Skill Credential Mapping

**File:** `core/keychain/config/scopes.yaml`

**Change:** Extend existing per-skill scope entries to enforce minimum-privilege per skill, not just per task type.

```yaml
skills:
  code-review:
    allowed_keys: []          # code review needs no credentials
  testing:
    allowed_keys: []          # local test runner, no external API
  research:
    allowed_keys:
      - EXA_API_KEY
      - SCRAPECREATORS_API_KEY
  accounting:
    allowed_keys:
      - FURS_API_KEY          # if applicable
  browser:
    allowed_keys: []          # MIKE handles browser, no keys in clone
  wiki-maintenance:
    allowed_keys: []          # local file operations only
  security-scan:
    allowed_keys: []          # reads files, no external calls
```

`KeychainManager.buildScopedEnv()` already reads skill from task — extend to also intersect with this per-skill allowlist. Result: even if a task requests a broad key set, a skill can only receive the keys it's permitted to have.

---

## 6. GitHub Actions — Skill Scanner CI Gate

**File:** `.github/workflows/skill-scan.yml` (new)

**Change:** Block any PR that adds or modifies a file in `skills/` without passing Cisco skill-scanner.

```yaml
name: Skill Security Scan
on:
  pull_request:
    paths:
      - 'skills/**'
      - '.claude/skills/**'

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run skill-scanner
        run: |
          pip install cisco-ai-defense-skill-scanner
          skill-scanner scan skills/ --fail-on-medium
      - name: Secondary scan
        run: |
          npx @aliksir/claude-code-skill-security-check skills/
```

**Note:** This is a gate on the skill *library*, not on runtime worktrees. The library is the trust boundary.

---

## 7. Janitor — Skill Budget Audit Task

**File:** `core/janitor/auditor.ts` or a new `core/janitor/skill_auditor.ts`

**Change:** Add monthly skill budget audit to Janitor's scheduled tasks.

Audit checks:
1. Count `.md` files in `skills/` — alert if approaching 25
2. For each skill in library: last used (from forge/events.jsonl), graduation stage (BUDGET.md), last Cisco scan date
3. Flag skills unused for >60 days as candidates for removal
4. Flag any skill without a Nemotron scan in the past 30 days
5. Output to `janitor/skill-audit-YYYY-MM.md` in Absolute-Human board format

---

## Implementation Order

| # | Change | Files | Phase |
|---|--------|-------|-------|
| 1 | `required_skills` in task schema | `brain/TASK-FORMAT.md` | Now (schema only) |
| 2 | `provisionSkills()` in spawner | `core/clones/lifecycle/spawner.ts` | Phase 5 |
| 3 | `skills/` library directory | `skills/` (new) | Now (create structure) |
| 4 | Docker sandbox flag | `core/clones/lifecycle/spawner.ts`, `runner.ts` | Phase 5 |
| 5 | Per-skill scopes.yaml | `core/keychain/config/scopes.yaml` | Phase 5 |
| 6 | GitHub Actions gate | `.github/workflows/skill-scan.yml` | Now (CI setup) |
| 7 | Janitor skill audit | `core/janitor/` | Phase 6 |

Changes 1, 3, and 6 can be done immediately without touching the Opus-built code. Changes 2, 4, 5 belong in a Phase 5 commit on `opus-build`. Change 7 is Phase 6 (Janitor build).
