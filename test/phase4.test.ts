/**
 * Tests for Phase 4 — Brain Planning + PromptBuilder + UserAgent pipeline
 */

import { PromptBuilder } from '../core/brain/prompt_builder';
import { BrainPlanner, MissionBrief } from '../core/brain/planner';
import { UserAgent } from '../core/user_agent/agent';
import * as os from 'os';
import { ComplexityClassifier, TaskComplexity } from '../core/routing/classifier';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// PromptBuilder tests
// ---------------------------------------------------------------------------

describe('PromptBuilder', () => {
  test('build() replaces all injection variables', async () => {
    const builder = new PromptBuilder();
    const brief: MissionBrief = {
      id: 'test-001',
      objective: 'Write a test function',
      skill: 'code',
      requiredKeys: ['ANTHROPIC_API_KEY'],
      wikiContext: [],
      constraints: ['no network access'],
      allowedPaths: ['/tmp/test-001/'],
      allowedEndpoints: ['api.anthropic.com'],
      timeoutMinutes: 30,
    };

    const result = await builder.build('templates/code-clone-TASK.md', brief);

    // All injection vars should be replaced
    expect(result).not.toContain('{INJECT_TASK_HERE}');
    expect(result).not.toContain('{INJECT_ALLOWED_PATHS_HERE}');
    expect(result).not.toContain('{INJECT_ALLOWED_ENDPOINTS_HERE}');
    expect(result).not.toContain('{INJECT_WIKI_CONTEXT_HERE}');

    // Injected values should be present
    expect(result).toContain('Write a test function');
    expect(result).toContain('/tmp/test-001/');
    expect(result).toContain('api.anthropic.com');
  });

  test('build() injects Soul.md content', async () => {
    const builder = new PromptBuilder();
    const brief: MissionBrief = {
      id: 'test-soul',
      objective: 'Test soul injection',
      skill: 'code',
      requiredKeys: [],
      wikiContext: [],
      constraints: [],
      allowedPaths: ['/tmp/'],
      allowedEndpoints: [],
      timeoutMinutes: 10,
    };

    const result = await builder.build('templates/code-clone-TASK.md', brief);

    // Soul.md should not be the placeholder
    expect(result).not.toContain('{INJECT_SOUL_HERE}');
  });

  test('loadWikiContext resolves pages in subdirectories', async () => {
    const builder = new PromptBuilder();
    // Access private method
    const loadWiki = (builder as any).loadWikiContext.bind(builder);
    const result = await loadWiki(['segment-brain']);

    // segment-brain.md lives in wiki/segments/ — should be found
    expect(result).toContain('segment-brain');
    expect(result.length).toBeGreaterThan(0);
  });

  test('loadWikiContext handles missing pages gracefully', async () => {
    const builder = new PromptBuilder();
    const loadWiki = (builder as any).loadWikiContext.bind(builder);
    const result = await loadWiki(['nonexistent-page-xyz']);

    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------------------
// ComplexityClassifier tests (verify routing for Phase 4 pipeline)
// ---------------------------------------------------------------------------

describe('ComplexityClassifier', () => {
  const classifier = new ComplexityClassifier();

  test('routes code execution tasks to FULL_PIPELINE', () => {
    expect(classifier.classify('Write a script that prints hello world'))
      .toBe(TaskComplexity.FULL_PIPELINE);
  });

  test('routes planning tasks to BRAIN_ONLY', () => {
    expect(classifier.classify('Explain how the memory system works'))
      .toBe(TaskComplexity.BRAIN_ONLY);
  });

  test('routes simple greetings to DIRECT', () => {
    expect(classifier.classify('hello'))
      .toBe(TaskComplexity.DIRECT);
  });

  test('routes build tasks to FULL_PIPELINE', () => {
    expect(classifier.classify('Build a React dashboard'))
      .toBe(TaskComplexity.FULL_PIPELINE);
  });

  test('routes "how do i" questions to BRAIN_ONLY', () => {
    expect(classifier.classify('How do I set up caching in Redis?'))
      .toBe(TaskComplexity.BRAIN_ONLY);
  });
});

// ---------------------------------------------------------------------------
// UserAgent tests (mocked planner — no API calls)
// ---------------------------------------------------------------------------

describe('UserAgent', () => {
  test('handleUserInput routes DIRECT and calls Anthropic Haiku', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Hello! How can I help?' }],
        }),
      },
    } as any;

    const agent = new UserAgent(mockClient);
    const result = await agent.handleUserInput('hi there');
    expect(result).toBe('Hello! How can I help?');
    expect(mockClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
    );
  });

  test('handleUserInput routes BRAIN_ONLY via planner', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Brain explanation' }],
        }),
      },
    } as any;

    const agent = new UserAgent(mockClient);
    // Mock the planner
    (agent as any).planner = {
      plan: jest.fn().mockResolvedValue({
        reasoning: ['Step 1: Analyze', 'Step 2: Respond'],
        brief: { id: 'test', objective: 'explain', skill: 'code',
          requiredKeys: [], wikiContext: [], constraints: [],
          allowedPaths: [], allowedEndpoints: [], timeoutMinutes: 10 },
        confidence: 0.8,
      }),
    };

    const result = await agent.handleUserInput('explain what the Brain does');
    expect(result).toContain('Step 1');
    expect(result).toContain('Step 2');
  });

  test('triggerFullPipeline writes valid task JSON to brain/inbox/', async () => {
    const agent = new UserAgent();

    // Mock the planner to avoid real API calls
    (agent as any).planner = {
      plan: async (objective: string, taskId: string) => ({
        reasoning: ['Test reasoning'],
        brief: {
          id: taskId,
          objective,
          skill: 'code',
          requiredKeys: ['ANTHROPIC_API_KEY'],
          wikiContext: [],
          constraints: ['stay in /tmp/'],
          allowedPaths: ['/tmp/test/'],
          allowedEndpoints: ['api.anthropic.com'],
          timeoutMinutes: 15,
        },
        confidence: 0.8,
      }),
    };

    const result = await (agent as any).triggerFullPipeline('Write a Python hello world script');
    expect(result).toContain('Task queued:');

    // Verify the task file was written
    const inboxDir = path.join(process.cwd(), 'brain', 'inbox');
    const files = fs.readdirSync(inboxDir).filter(f => f.startsWith('task-') && f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    // Verify task structure
    const taskFile = JSON.parse(fs.readFileSync(path.join(inboxDir, files[files.length - 1]), 'utf-8'));
    expect(taskFile.type).toBe('clone');
    expect(taskFile.source).toBe('user_agent');
    expect(taskFile.skill).toBe('code');
    expect(taskFile.objective).toBe('Write a Python hello world script');
    expect(taskFile.required_keys).toContain('ANTHROPIC_API_KEY');

    // Cleanup
    for (const f of files) {
      if (f.startsWith('task-')) {
        fs.unlinkSync(path.join(inboxDir, f));
      }
    }
  });

  test('state.json is updated on FULL_PIPELINE', async () => {
    const agent = new UserAgent();

    // Mock the planner
    (agent as any).planner = {
      plan: async (objective: string, taskId: string) => ({
        reasoning: ['Test'],
        brief: {
          id: taskId, objective, skill: 'code',
          requiredKeys: ['ANTHROPIC_API_KEY'], wikiContext: [],
          constraints: [], allowedPaths: ['/tmp/'], allowedEndpoints: [],
          timeoutMinutes: 10,
        },
        confidence: 0.8,
      }),
    };

    await (agent as any).triggerFullPipeline('Build something');

    const state = (agent as any).state;
    expect(state.active_worktrees.length).toBeGreaterThan(0);
    expect(state.current_intent).toContain('Build something');

    // Cleanup inbox
    const inboxDir = path.join(process.cwd(), 'brain', 'inbox');
    for (const f of fs.readdirSync(inboxDir)) {
      if (f.startsWith('task-')) fs.unlinkSync(path.join(inboxDir, f));
    }
  });
});

// ---------------------------------------------------------------------------
// BrainPlanner — MissionBrief structure validation (no API call)
// ---------------------------------------------------------------------------

describe('BrainPlanner (structure)', () => {
  test('MissionBrief interface has all required fields', () => {
    const brief: MissionBrief = {
      id: 'test',
      objective: 'test objective',
      skill: 'code',
      requiredKeys: ['ANTHROPIC_API_KEY'],
      wikiContext: ['segment-brain'],
      constraints: ['no network'],
      allowedPaths: ['/tmp/test/'],
      allowedEndpoints: ['api.anthropic.com'],
      timeoutMinutes: 30,
    };

    expect(brief.id).toBe('test');
    expect(brief.skill).toBe('code');
    expect(brief.timeoutMinutes).toBe(30);
  });
});


// ---------------------------------------------------------------------------
// B3b: Recursive wiki page resolution
// ---------------------------------------------------------------------------

describe('PromptBuilder.findFileRecursive', () => {
  test('finds file in deeply nested wiki subdirectory', () => {
    const builder = new PromptBuilder();
    const find = (builder as any).findFileRecursive.bind(builder);

    // Create a temp wiki-like structure
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'test-wiki-'));
    const deepDir = path.join(tmpDir, 'decisions', 'archive');
    fs.mkdirSync(deepDir, { recursive: true });
    fs.writeFileSync(path.join(deepDir, 'old-decision.md'), '# Old Decision');

    const found = find(tmpDir, 'old-decision.md');
    expect(found).toBe(path.join(deepDir, 'old-decision.md'));

    fs.rmSync(tmpDir, { recursive: true });
  });

  test('returns null for nonexistent file', () => {
    const builder = new PromptBuilder();
    const find = (builder as any).findFileRecursive.bind(builder);
    expect(find('wiki', 'does-not-exist.md')).toBeNull();
  });
});


// ---------------------------------------------------------------------------
// C2: Conversation history limits
// ---------------------------------------------------------------------------

describe('UserAgent conversation history limits', () => {
  test('history is truncated at MAX_HISTORY_ENTRIES (50)', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
        }),
      },
    } as any;

    const agent = new UserAgent(mockClient);

    // Push 60 entries
    for (let i = 0; i < 60; i++) {
      await agent.handleUserInput(`msg ${i}`);
    }

    const history = (agent as any).conversationHistory;
    expect(history.length).toBeLessThanOrEqual(50);
  });

  test('flushState is triggered when estimated tokens exceed threshold', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
        }),
      },
    } as any;

    const agent = new UserAgent(mockClient);
    const flushSpy = jest.spyOn(agent as any, 'flushState');

    // Push a message with very long content to trigger token threshold
    const longMessage = 'x'.repeat(20000); // ~5000 tokens, exceeds 4000 threshold
    await agent.handleUserInput(longMessage);

    expect(flushSpy).toHaveBeenCalled();
  });
});
