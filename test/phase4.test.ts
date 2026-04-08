/**
 * Tests for Phase 4 — Brain Planning + PromptBuilder + UserAgent pipeline
 * Updated for plan-build-v4: async classifier, Soul.md injection, routeToBrain fix
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
// ComplexityClassifier tests — 2-pass (plan-build-v4 A1)
// ---------------------------------------------------------------------------

describe('ComplexityClassifier', () => {
  // Mock Anthropic client for Haiku fallback
  function mockAnthropicWith(response: string) {
    return {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: response }],
        }),
      },
    } as any;
  }

  test('routes greetings to DIRECT via pass 1 (no Haiku call)', async () => {
    const mock = mockAnthropicWith('DIRECT');
    const classifier = new ComplexityClassifier(mock);
    expect(await classifier.classify('hello')).toBe(TaskComplexity.DIRECT);
    expect(mock.messages.create).not.toHaveBeenCalled();
  });

  test('routes "yes" to DIRECT via pass 1 (no Haiku call)', async () => {
    const mock = mockAnthropicWith('DIRECT');
    const classifier = new ComplexityClassifier(mock);
    expect(await classifier.classify('yes')).toBe(TaskComplexity.DIRECT);
    expect(mock.messages.create).not.toHaveBeenCalled();
  });

  test('routes "ok" to DIRECT via pass 1', async () => {
    const mock = mockAnthropicWith('DIRECT');
    const classifier = new ComplexityClassifier(mock);
    expect(await classifier.classify('ok')).toBe(TaskComplexity.DIRECT);
    expect(mock.messages.create).not.toHaveBeenCalled();
  });

  test('routes "Write a Python script to parse CSV" to FULL_PIPELINE via pass 1 (no Haiku)', async () => {
    const mock = mockAnthropicWith('FULL_PIPELINE');
    const classifier = new ComplexityClassifier(mock);
    expect(await classifier.classify('Write a script to parse CSV')).toBe(TaskComplexity.FULL_PIPELINE);
    expect(mock.messages.create).not.toHaveBeenCalled();
  });

  test('"clone my recipe collection" does NOT route to FULL_PIPELINE', async () => {
    const mock = mockAnthropicWith('BRAIN_ONLY');
    const classifier = new ComplexityClassifier(mock);
    const result = await classifier.classify('clone my recipe collection');
    expect(result).not.toBe(TaskComplexity.FULL_PIPELINE);
    // Falls through to Haiku
    expect(mock.messages.create).toHaveBeenCalled();
  });

  test('"can you run me through how photosynthesis works?" → BRAIN_ONLY via Haiku', async () => {
    const mock = mockAnthropicWith('BRAIN_ONLY');
    const classifier = new ComplexityClassifier(mock);
    expect(await classifier.classify('can you run me through how photosynthesis works?'))
      .toBe(TaskComplexity.BRAIN_ONLY);
    expect(mock.messages.create).toHaveBeenCalled();
  });

  test('Haiku returns unexpected value → BRAIN_ONLY (safe fallback)', async () => {
    const mock = mockAnthropicWith('SOMETHING_WEIRD');
    const classifier = new ComplexityClassifier(mock);
    expect(await classifier.classify('do the thing')).toBe(TaskComplexity.BRAIN_ONLY);
  });

  test('Haiku call failure → BRAIN_ONLY (safe fallback)', async () => {
    const mock = {
      messages: {
        create: jest.fn().mockRejectedValue(new Error('API down')),
      },
    } as any;
    const classifier = new ComplexityClassifier(mock);
    expect(await classifier.classify('complex question')).toBe(TaskComplexity.BRAIN_ONLY);
  });

  test('routes build tasks to FULL_PIPELINE via pass 1', async () => {
    const mock = mockAnthropicWith('FULL_PIPELINE');
    const classifier = new ComplexityClassifier(mock);
    expect(await classifier.classify('Build a bot for Discord')).toBe(TaskComplexity.FULL_PIPELINE);
    expect(mock.messages.create).not.toHaveBeenCalled();
  });

  test('routes "how do i" questions via Haiku (no longer simple keyword match)', async () => {
    const mock = mockAnthropicWith('BRAIN_ONLY');
    const classifier = new ComplexityClassifier(mock);
    expect(await classifier.classify('How do I set up caching in Redis?'))
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

  test('handleUserInput routes BRAIN_ONLY via planner and produces answer', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Here is a detailed explanation.' }],
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
    // Force classifier to return BRAIN_ONLY
    (agent as any).classifier = { classify: jest.fn().mockResolvedValue(TaskComplexity.BRAIN_ONLY) };

    const result = await agent.handleUserInput('explain what the Brain does');
    // C2: routeToBrain now produces an actual answer via Haiku, not just reasoning
    expect(result).toBe('Here is a detailed explanation.');
    expect(mockClient.messages.create).toHaveBeenCalled();
  });

  test('triggerFullPipeline writes valid task JSON to brain/inbox/', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
        }),
      },
    } as any;
    const agent = new UserAgent(mockClient);

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
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
        }),
      },
    } as any;
    const agent = new UserAgent(mockClient);

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
    // Force classifier to FULL_PIPELINE
    (agent as any).classifier = { classify: jest.fn().mockResolvedValue(TaskComplexity.FULL_PIPELINE) };

    await agent.handleUserInput('Build something');

    const state = (agent as any).state;
    expect(state.active_worktrees.length).toBeGreaterThan(0);
    expect(state.current_intent).toContain('Build something');

    // Cleanup inbox
    const inboxDir = path.join(process.cwd(), 'brain', 'inbox');
    for (const f of fs.readdirSync(inboxDir)) {
      if (f.startsWith('task-')) fs.unlinkSync(path.join(inboxDir, f));
    }
  });

  test('triggerFullPipeline returns error string on failure (B3)', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
        }),
      },
    } as any;
    const agent = new UserAgent(mockClient);

    (agent as any).planner = {
      plan: jest.fn().mockRejectedValue(new Error('API timeout')),
    };

    const result = await (agent as any).triggerFullPipeline('do something');
    expect(result).toContain('error');
    expect(result).toContain('API timeout');
  });

  test('routeToBrain returns error string on failure (B3)', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockRejectedValue(new Error('rate limited')),
      },
    } as any;
    const agent = new UserAgent(mockClient);

    const result = await (agent as any).routeToBrain('explain something');
    expect(result).toContain('error');
    expect(result).toContain('rate limited');
  });

  test('executeDirect includes conversation history (C2)', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Hello!' }],
        }),
      },
    } as any;

    const agent = new UserAgent(mockClient);
    // Pre-fill some conversation history
    (agent as any).conversationHistory = [
      { role: 'user', content: 'previous message', timestamp: new Date().toISOString() },
      { role: 'assistant', content: 'previous response', timestamp: new Date().toISOString() },
    ];

    await (agent as any).executeDirect('hello');

    // Verify messages include history
    const call = mockClient.messages.create.mock.calls[0][0];
    expect(call.messages.length).toBeGreaterThan(1); // history + current
  });

  test('pruneCompleted removes task from active_worktrees (B1)', () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
        }),
      },
    } as any;
    const agent = new UserAgent(mockClient);
    (agent as any).state.active_worktrees = ['task-a', 'task-b', 'task-c'];

    agent.pruneCompleted('task-b');

    expect((agent as any).state.active_worktrees).toEqual(['task-a', 'task-c']);
  });

  test('cleanupStaleWorktrees removes IDs not in registry (B1)', () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
        }),
      },
    } as any;
    const agent = new UserAgent(mockClient);
    (agent as any).state.active_worktrees = ['task-a', 'task-b', 'task-c'];

    // No registry file exists → should clear all
    agent.cleanupStaleWorktrees();
    expect((agent as any).state.active_worktrees).toEqual([]);
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

  test('BrainPlanner accepts injected Anthropic client (B2)', () => {
    const mockClient = {
      messages: { create: jest.fn() },
    } as any;

    const planner = new BrainPlanner(mockClient);
    expect((planner as any).anthropic).toBe(mockClient);
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
    // Each handleUserInput adds user + assistant, trim happens before assistant push
    // So max overshoot is 1 (user trim to 50, then push assistant = 51)
    expect(history.length).toBeLessThanOrEqual(51);
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


// ---------------------------------------------------------------------------
// A2: executeDirect() duplicate message fix (plan-build-v5)
// ---------------------------------------------------------------------------

describe('executeDirect duplicate message fix (A2)', () => {
  test('user message does NOT appear twice in messages array', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'response' }],
        }),
      },
    } as any;

    const agent = new UserAgent(mockClient);
    // Force DIRECT routing
    (agent as any).classifier = { classify: jest.fn().mockResolvedValue(TaskComplexity.DIRECT) };
    // Pre-fill 5 history entries + the current one will be pushed by handleUserInput
    (agent as any).conversationHistory = [
      { role: 'user', content: 'msg1', timestamp: new Date().toISOString() },
      { role: 'assistant', content: 'resp1', timestamp: new Date().toISOString() },
      { role: 'user', content: 'msg2', timestamp: new Date().toISOString() },
      { role: 'assistant', content: 'resp2', timestamp: new Date().toISOString() },
      { role: 'user', content: 'msg3', timestamp: new Date().toISOString() },
    ];

    await agent.handleUserInput('hello');

    const call = mockClient.messages.create.mock.calls[0][0];
    // Count how many times 'hello' appears in messages
    const helloCount = call.messages.filter((m: any) => m.content === 'hello').length;
    expect(helloCount).toBe(1); // exactly once — not duplicated
  });

  test('history slice excludes current turn', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
        }),
      },
    } as any;

    const agent = new UserAgent(mockClient);
    // Force DIRECT routing
    (agent as any).classifier = { classify: jest.fn().mockResolvedValue(TaskComplexity.DIRECT) };
    // 5 history entries, then handleUserInput adds current
    (agent as any).conversationHistory = [
      { role: 'user', content: 'a', timestamp: new Date().toISOString() },
      { role: 'assistant', content: 'b', timestamp: new Date().toISOString() },
      { role: 'user', content: 'c', timestamp: new Date().toISOString() },
      { role: 'assistant', content: 'd', timestamp: new Date().toISOString() },
      { role: 'user', content: 'e', timestamp: new Date().toISOString() },
    ];

    await agent.handleUserInput('current');

    const call = mockClient.messages.create.mock.calls[0][0];
    // History should be 5 entries (a,b,c,d,e) + 1 explicit 'current' = 6 total
    expect(call.messages.length).toBe(6);
    // Last message should be the explicit prompt
    expect(call.messages[call.messages.length - 1].content).toBe('current');
  });
});


// ---------------------------------------------------------------------------
// A3: routeToBrain() includes conversation history (plan-build-v5)
// ---------------------------------------------------------------------------

describe('routeToBrain conversation history (A3)', () => {
  test('routeToBrain includes conversation history in API call', async () => {
    const mockClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Answer based on context' }],
        }),
      },
    } as any;

    const agent = new UserAgent(mockClient);
    (agent as any).planner = {
      plan: jest.fn().mockResolvedValue({
        reasoning: ['Step 1'],
        brief: { id: 'test', objective: 'test', skill: 'code',
          requiredKeys: [], wikiContext: [], constraints: [],
          allowedPaths: [], allowedEndpoints: [], timeoutMinutes: 10 },
        confidence: 0.8,
      }),
    };
    (agent as any).classifier = { classify: jest.fn().mockResolvedValue(TaskComplexity.BRAIN_ONLY) };

    // Pre-fill history
    (agent as any).conversationHistory = [
      { role: 'user', content: 'I described a system', timestamp: new Date().toISOString() },
      { role: 'assistant', content: 'I see, a system with X', timestamp: new Date().toISOString() },
    ];

    await agent.handleUserInput('explain what I just described');

    const call = mockClient.messages.create.mock.calls[0][0];
    // Should have history (2 entries) + contextPrompt (1) = 3 messages
    expect(call.messages.length).toBe(3);
    expect(call.messages[0].content).toBe('I described a system');
    expect(call.messages[1].content).toBe('I see, a system with X');
  });
});


// ---------------------------------------------------------------------------
// B2: loadWikiContext total budget cap (plan-build-v5)
// ---------------------------------------------------------------------------

describe('loadWikiContext total budget cap (B2)', () => {
  test('caps total wiki context at MAX_TOTAL_CHARS', async () => {
    const builder = new PromptBuilder();
    const loadWiki = (builder as any).loadWikiContext.bind(builder);

    // Create temp wiki with many large pages
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'test-wiki-cap-'));
    const pages: string[] = [];
    for (let i = 0; i < 30; i++) {
      const pageName = `page-${i}`;
      pages.push(pageName);
      fs.writeFileSync(path.join(tmpDir, `${pageName}.md`), 'x'.repeat(800));
    }

    // Monkey-patch resolveWikiPage to use our temp dir
    const origResolve = (builder as any).resolveWikiPage.bind(builder);
    (builder as any).resolveWikiPage = (name: string) => {
      const p = path.join(tmpDir, `${name}.md`);
      return fs.existsSync(p) ? p : null;
    };

    const result = await loadWiki(pages);

    // Total should be capped at ~2000 chars (not 30 * 800 = 24000)
    expect(result.length).toBeLessThan(3000);
    // Should have at least some content
    expect(result.length).toBeGreaterThan(0);

    // Restore
    (builder as any).resolveWikiPage = origResolve;
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('2 small pages under budget returns both', async () => {
    const builder = new PromptBuilder();
    const loadWiki = (builder as any).loadWikiContext.bind(builder);

    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'test-wiki-small-'));
    fs.writeFileSync(path.join(tmpDir, 'small-a.md'), 'Content A');
    fs.writeFileSync(path.join(tmpDir, 'small-b.md'), 'Content B');

    (builder as any).resolveWikiPage = (name: string) => {
      const p = path.join(tmpDir, `${name}.md`);
      return fs.existsSync(p) ? p : null;
    };

    const result = await loadWiki(['small-a', 'small-b']);
    expect(result).toContain('Content A');
    expect(result).toContain('Content B');

    fs.rmSync(tmpDir, { recursive: true });
  });
});


// ---------------------------------------------------------------------------
// A1: cleanupStaleWorktrees() registry format fix (plan-build-v6)
// ---------------------------------------------------------------------------

describe('cleanupStaleWorktrees — registry format fix (A1)', () => {
  test('keeps IDs present in object-format registry', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-cleanup-a1-'));
    const stateDir = path.join(tmpDir, 'state', 'user_agent');
    const worktreeDir = path.join(tmpDir, 'state', 'worktrees');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(worktreeDir, { recursive: true });

    // Write state with active_worktrees
    fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({
      last_updated: new Date().toISOString(),
      current_intent: '',
      active_worktrees: ['clone-abc', 'clone-def'],
      open_items: [],
      recent_context_summary: '',
      confidence_score: 1.0,
    }));

    // Write object-format registry (as spawner.ts writes it)
    fs.writeFileSync(path.join(worktreeDir, 'registry.json'), JSON.stringify({
      'clone-abc': { path: '/tmp/clone-abc', branch: 'task/abc', createdAt: new Date().toISOString() },
    }));

    const origEnv = process.env.AGENT_BASE_DIR;
    process.env.AGENT_BASE_DIR = tmpDir;
    try {
      const agent = new UserAgent({ messages: { create: jest.fn() } } as any);
      (agent as any).state.active_worktrees = ['clone-abc', 'clone-def'];
      agent.cleanupStaleWorktrees();

      // clone-abc is in registry, clone-def is not
      expect((agent as any).state.active_worktrees).toEqual(['clone-abc']);
    } finally {
      process.env.AGENT_BASE_DIR = origEnv;
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('removes all IDs when registry is empty object', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-cleanup-a1-empty-'));
    const stateDir = path.join(tmpDir, 'state', 'user_agent');
    const worktreeDir = path.join(tmpDir, 'state', 'worktrees');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(worktreeDir, { recursive: true });

    fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({
      last_updated: new Date().toISOString(),
      current_intent: '',
      active_worktrees: ['clone-abc'],
      open_items: [],
      recent_context_summary: '',
      confidence_score: 1.0,
    }));

    // Empty object registry
    fs.writeFileSync(path.join(worktreeDir, 'registry.json'), '{}');

    const origEnv = process.env.AGENT_BASE_DIR;
    process.env.AGENT_BASE_DIR = tmpDir;
    try {
      const agent = new UserAgent({ messages: { create: jest.fn() } } as any);
      (agent as any).state.active_worktrees = ['clone-abc'];
      agent.cleanupStaleWorktrees();

      expect((agent as any).state.active_worktrees).toEqual([]);
    } finally {
      process.env.AGENT_BASE_DIR = origEnv;
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('clears all when registry file is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-cleanup-a1-missing-'));
    const stateDir = path.join(tmpDir, 'state', 'user_agent');
    fs.mkdirSync(stateDir, { recursive: true });

    fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({
      last_updated: new Date().toISOString(),
      current_intent: '',
      active_worktrees: ['clone-xyz'],
      open_items: [],
      recent_context_summary: '',
      confidence_score: 1.0,
    }));

    const origEnv = process.env.AGENT_BASE_DIR;
    process.env.AGENT_BASE_DIR = tmpDir;
    try {
      const agent = new UserAgent({ messages: { create: jest.fn() } } as any);
      (agent as any).state.active_worktrees = ['clone-xyz'];
      agent.cleanupStaleWorktrees();

      expect((agent as any).state.active_worktrees).toEqual([]);
    } finally {
      process.env.AGENT_BASE_DIR = origEnv;
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});


// ---------------------------------------------------------------------------
// C1: parseMissionBrief retry + fallback (plan-build-v6)
// ---------------------------------------------------------------------------

describe('parseMissionBrief (C1)', () => {
  test('parses valid JSON on first try', () => {
    const planner = new BrainPlanner({ messages: { create: jest.fn() } } as any);
    const result = (planner as any).parseMissionBrief('{"skill":"code","reasoning":"test"}');
    expect(result.skill).toBe('code');
    expect(result.reasoning).toBe('test');
  });

  test('parses markdown-wrapped JSON', () => {
    const planner = new BrainPlanner({ messages: { create: jest.fn() } } as any);
    const raw = '```json\n{"skill":"research","reasoning":"wrapped"}\n```';
    const result = (planner as any).parseMissionBrief(raw);
    expect(result.skill).toBe('research');
  });

  test('returns default brief for completely invalid input', () => {
    const planner = new BrainPlanner({ messages: { create: jest.fn() } } as any);
    const result = (planner as any).parseMissionBrief('This is not JSON at all, just plain text.');
    expect(result.skill).toBe('code');
    expect(result.confidence).toBe(0.3);
    expect(result.reasoning).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// C2: loadSoul TTL cache (plan-build-v6)
// ---------------------------------------------------------------------------

describe('loadSoul TTL cache (C2)', () => {
  test('caches soul content within TTL', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-soul-ttl-'));
    const wikiDir = path.join(tmpDir, 'wiki');
    fs.mkdirSync(wikiDir, { recursive: true });
    fs.writeFileSync(path.join(wikiDir, 'Soul.md'), 'Original soul content');

    const origEnv = process.env.AGENT_BASE_DIR;
    process.env.AGENT_BASE_DIR = tmpDir;
    try {
      const agent = new UserAgent({ messages: { create: jest.fn() } } as any);
      const soul1 = (agent as any).loadSoul();
      expect(soul1).toContain('Original soul content');

      // Modify file
      fs.writeFileSync(path.join(wikiDir, 'Soul.md'), 'Updated soul content');

      // Should still return cached version (within TTL)
      const soul2 = (agent as any).loadSoul();
      expect(soul2).toContain('Original soul content');
    } finally {
      process.env.AGENT_BASE_DIR = origEnv;
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('re-reads soul content after TTL expires', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-soul-ttl-expire-'));
    const wikiDir = path.join(tmpDir, 'wiki');
    fs.mkdirSync(wikiDir, { recursive: true });
    fs.writeFileSync(path.join(wikiDir, 'Soul.md'), 'Original soul');

    const origEnv = process.env.AGENT_BASE_DIR;
    process.env.AGENT_BASE_DIR = tmpDir;
    try {
      const agent = new UserAgent({ messages: { create: jest.fn() } } as any);
      const soul1 = (agent as any).loadSoul();
      expect(soul1).toContain('Original soul');

      // Simulate TTL expiry by backdating soulLoadedAt
      (agent as any).soulLoadedAt = Date.now() - 120_000; // 2 minutes ago

      // Update file
      fs.writeFileSync(path.join(wikiDir, 'Soul.md'), 'Updated soul');

      const soul2 = (agent as any).loadSoul();
      expect(soul2).toContain('Updated soul');
    } finally {
      process.env.AGENT_BASE_DIR = origEnv;
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

// ---------------------------------------------------------------------------
// C3: routeToBrain single API call (plan-build-v6)
// ---------------------------------------------------------------------------

describe('routeToBrain single API call (C3)', () => {
  test('makes exactly 1 API call', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Brain response' }],
    });
    const mockClient = { messages: { create: mockCreate } };

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-brain-c3-'));
    const origEnv = process.env.AGENT_BASE_DIR;
    process.env.AGENT_BASE_DIR = tmpDir;

    try {
      const agent = new UserAgent(mockClient as any);
      const result = await (agent as any).routeToBrain('What is X?');

      expect(result).toBe('Brain response');
      // Should be exactly 1 call (not 2 like before)
      expect(mockCreate).toHaveBeenCalledTimes(1);
    } finally {
      process.env.AGENT_BASE_DIR = origEnv;
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  test('includes conversation history in the call', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Response with context' }],
    });
    const mockClient = { messages: { create: mockCreate } };

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-brain-c3-history-'));
    const origEnv = process.env.AGENT_BASE_DIR;
    process.env.AGENT_BASE_DIR = tmpDir;

    try {
      const agent = new UserAgent(mockClient as any);
      // Add some conversation history
      (agent as any).conversationHistory = [
        { role: 'user', content: 'Previous question', timestamp: new Date().toISOString() },
        { role: 'assistant', content: 'Previous answer', timestamp: new Date().toISOString() },
      ];

      await (agent as any).routeToBrain('Follow-up question');

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(2048);
      // Should have history + current prompt
      expect(callArgs.messages.length).toBeGreaterThanOrEqual(2);
    } finally {
      process.env.AGENT_BASE_DIR = origEnv;
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
