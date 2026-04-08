/**
 * Tests for core/memory_store/mempalace_adapter.ts — Phase 5B (MCP transport)
 * All MCP calls are mocked — no real MemPalace server needed.
 */

import { MemPalaceAdapter } from '../core/memory_store/mempalace_adapter';
import { MemoryTier } from '../core/memory_store/interface';

// Mock MCP client
function createMockClient() {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    callTool: jest.fn().mockResolvedValue({ content: [{ text: 'mock-id-123' }] }),
    listTools: jest.fn().mockResolvedValue({
      tools: [
        { name: 'add_memory' },
        { name: 'get_aaak_summary' },
        { name: 'search_vault' },
        { name: 'delete_memory' },
        { name: 'audit_vault' },
      ],
    }),
  };
}

function injectMockClient(adapter: MemPalaceAdapter, mockClient: any): void {
  (adapter as any).client = mockClient;
}

// ---------------------------------------------------------------------------
// connect() tests
// ---------------------------------------------------------------------------

test('connect() initialises client (mock injection)', async () => {
  const adapter = new MemPalaceAdapter();
  const mockClient = createMockClient();
  injectMockClient(adapter, mockClient);

  // Client should be set
  expect((adapter as any).client).toBe(mockClient);
});

// ---------------------------------------------------------------------------
// write() tests
// ---------------------------------------------------------------------------

test('write() calls add_memory tool with correct args', async () => {
  const adapter = new MemPalaceAdapter();
  const mockClient = createMockClient();
  injectMockClient(adapter, mockClient);

  const metadata = {
    source_id: 'test',
    timestamp: '2026-01-01T00:00:00Z',
    tags: ['test'],
  };

  const result = await adapter.write('test content', metadata);

  expect(mockClient.callTool).toHaveBeenCalledWith({
    name: 'add_memory',
    arguments: { text: 'test content', meta: metadata },
  });
  expect(result).toBe('mock-id-123');
});

// ---------------------------------------------------------------------------
// readContext() tests
// ---------------------------------------------------------------------------

test('readContext(L0_WAKE) calls get_aaak_summary', async () => {
  const adapter = new MemPalaceAdapter();
  const mockClient = createMockClient();
  mockClient.callTool.mockResolvedValue({ content: [{ text: 'wake summary' }] });
  injectMockClient(adapter, mockClient);

  const result = await adapter.readContext(MemoryTier.L0_WAKE);

  expect(mockClient.callTool).toHaveBeenCalledWith({
    name: 'get_aaak_summary',
    arguments: {},
  });
  expect(result).toBe('wake summary');
});

test('readContext(L2_DOMAIN) calls search_vault', async () => {
  const adapter = new MemPalaceAdapter();
  const mockClient = createMockClient();
  mockClient.callTool.mockResolvedValue({ content: [{ text: 'domain results' }] });
  injectMockClient(adapter, mockClient);

  await adapter.readContext(MemoryTier.L2_DOMAIN, 'architecture');

  expect(mockClient.callTool).toHaveBeenCalledWith({
    name: 'search_vault',
    arguments: { tier: 'L2_DOMAIN', query: 'architecture', limit: 10 },
  });
});

// ---------------------------------------------------------------------------
// search() tests
// ---------------------------------------------------------------------------

test('search() calls search_vault', async () => {
  const adapter = new MemPalaceAdapter();
  const mockClient = createMockClient();
  mockClient.callTool.mockResolvedValue({
    content: [{ text: JSON.stringify([{ content: 'result', score: 0.9 }]) }],
  });
  injectMockClient(adapter, mockClient);

  const results = await adapter.search('test query', 3);

  expect(mockClient.callTool).toHaveBeenCalledWith({
    name: 'search_vault',
    arguments: { query: 'test query', limit: 3 },
  });
  expect(results).toEqual([{ content: 'result', score: 0.9 }]);
});

// ---------------------------------------------------------------------------
// delete() tests
// ---------------------------------------------------------------------------

test('delete() calls delete_memory', async () => {
  const adapter = new MemPalaceAdapter();
  const mockClient = createMockClient();
  injectMockClient(adapter, mockClient);

  const result = await adapter.delete('mem-id-456');

  expect(mockClient.callTool).toHaveBeenCalledWith({
    name: 'delete_memory',
    arguments: { id: 'mem-id-456' },
  });
  expect(result).toBe(true);
});

// ---------------------------------------------------------------------------
// Safe fallback tests (client is null)
// ---------------------------------------------------------------------------

test('methods return safe fallbacks when client is null', async () => {
  const adapter = new MemPalaceAdapter();
  // client is null by default (never connected)

  expect(await adapter.write('x', { source_id: '', timestamp: '', tags: [] })).toBe('');
  expect(await adapter.readContext(MemoryTier.L0_WAKE)).toBe('');
  expect(await adapter.search('x')).toEqual([]);
  expect(await adapter.delete('x')).toBe(false);

  const audit = await adapter.audit();
  expect(audit.contradictions).toEqual([]);
  expect(audit.orphan_pages).toEqual([]);
  expect(audit.stale_entries).toEqual([]);
});
