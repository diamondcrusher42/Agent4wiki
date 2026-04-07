// core/brain/prompt_builder.ts
// Phase 4 — Mission Brief prompt assembly
//
// Takes a chosen template and dynamically injects:
//   - Soul.md (agent identity + voice)
//   - allowedPaths (filesystem scope for this clone)
//   - allowedEndpoints (network scope from scopes.yaml)
//   - wikiContext (relevant pages from the 500-token index)
//   - task objective
//
// Output is the final prompt string passed to the clone's Claude session.
// No LLM calls here — pure string assembly.

import * as fs from 'fs';
import * as path from 'path';
import { MissionBrief } from './planner';

const SOUL_PATH = process.env.SOUL_PATH || 'wiki/Soul.md';
const SOUL_PRIVATE_PATH = process.env.SOUL_PRIVATE_PATH || 'state/user_agent/soul-private.md';
const WIKI_PATH = 'wiki';

export class PromptBuilder {

  /**
   * BUILD — assembles the final clone prompt from template + injections.
   * Replaces injection variables defined in the TASK.md template format:
   *   {INJECT_SOUL_HERE}, {INJECT_ALLOWED_PATHS_HERE},
   *   {INJECT_ALLOWED_ENDPOINTS_HERE}, {INJECT_WIKI_CONTEXT_HERE},
   *   {INJECT_TASK_HERE}
   */
  public async build(templatePath: string, brief: MissionBrief): Promise<string> {
    const template = await fs.promises.readFile(templatePath, 'utf-8');
    const soul = await this.loadSoul();
    const wikiContext = await this.loadWikiContext(brief.wikiContext);

    return template
      .replace('{INJECT_SOUL_HERE}', soul)
      .replace('{INJECT_ALLOWED_PATHS_HERE}', brief.allowedPaths.join('\n'))
      .replace('{INJECT_ALLOWED_ENDPOINTS_HERE}', brief.allowedEndpoints.join('\n'))
      .replace('{INJECT_WIKI_CONTEXT_HERE}', wikiContext)
      .replace('{INJECT_TASK_HERE}', brief.objective);
  }

  /**
   * Load Soul.md (committed, generic) + soul-private.md (gitignored, personal).
   * Private soul is optional — gracefully skipped if not present.
   */
  private async loadSoul(): Promise<string> {
    let soul = '';
    try {
      soul = await fs.promises.readFile(SOUL_PATH, 'utf-8');
    } catch {
      console.warn('[PROMPT_BUILDER] wiki/Soul.md not found — proceeding without soul context');
    }
    try {
      const privateSoul = await fs.promises.readFile(SOUL_PRIVATE_PATH, 'utf-8');
      soul += '\n\n## Private Context\n' + privateSoul;
    } catch {
      // soul-private.md is optional — no warning
    }
    return soul;
  }

  /**
   * Load requested wiki pages into a single context block.
   * Total budget: ~500 tokens. Pages truncated if over budget.
   */
  private async loadWikiContext(pageNames: string[]): Promise<string> {
    const sections: string[] = [];
    for (const pageName of pageNames) {
      const pagePath = path.join(WIKI_PATH, `${pageName}.md`);
      try {
        const content = await fs.promises.readFile(pagePath, 'utf-8');
        sections.push(`## ${pageName}\n${content.slice(0, 800)}`); // ~200 tokens each
      } catch {
        console.warn(`[PROMPT_BUILDER] Wiki page not found: ${pageName}`);
      }
    }
    return sections.join('\n\n---\n\n');
  }
}
