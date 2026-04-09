// core/memory_store/mempalace_adapter.ts
// MemPalace implementation of MemoryStore via MCP transport.
// Phase 5B: Full MCP client wiring — replaces TODO stubs.

import { MemoryStore, MemoryMetadata, MemoryTier, InteractionDigest, AuditReport } from './interface';

// MCP SDK types — imported dynamically to allow mocking in tests
let ClientClass: any = null;
let StdioTransportClass: any = null;

async function loadMcpSdk(): Promise<void> {
  if (!ClientClass) {
    const clientMod = await import('@modelcontextprotocol/sdk/client/index.js');
    ClientClass = clientMod.Client;
  }
  if (!StdioTransportClass) {
    const transportMod = await import('@modelcontextprotocol/sdk/client/stdio.js');
    StdioTransportClass = transportMod.StdioClientTransport;
  }
}

const EXPECTED_TOOLS = ['add_memory', 'get_aaak_summary', 'search_vault', 'delete_memory', 'audit_vault'];

export class MemPalaceAdapter implements MemoryStore {
  private client: any = null;

  async connect(): Promise<void> {
    try {
      await loadMcpSdk();
      const transport = new StdioTransportClass({
        command: 'python3',
        args: ['-m', 'mempalace.server'],
        env: { ...process.env },
      });
      const client = new ClientClass(
        { name: 'agent4-core', version: '1.0.0' },
        { capabilities: {} }
      );
      await client.connect(transport);
      this.client = client;
      console.log('[MEMPALACE] Vault connection established via MCP.');

      // Validate expected tools are available
      await this.validateTools();
    } catch (err) {
      console.error(`[MEMPALACE] Connection failed: ${err}`);
      this.client = null;
    }
  }

  /**
   * Validate that expected MCP tools are available on the server.
   * Logs warnings for missing tools — makes mismatches obvious at startup.
   */
  private async validateTools(): Promise<void> {
    if (!this.client) return;
    try {
      const result = await this.client.listTools();
      const availableNames = (result?.tools || []).map((t: any) => t.name);
      for (const expected of EXPECTED_TOOLS) {
        if (!availableNames.includes(expected)) {
          console.warn(`[MEMPALACE] Expected tool "${expected}" not found on server`);
        }
      }
    } catch (err) {
      console.warn(`[MEMPALACE] Could not list tools: ${err}`);
    }
  }

  async write(content: string, metadata: MemoryMetadata): Promise<string> {
    if (!this.client) {
      console.warn('[MEMPALACE] Not connected — write() returning empty string');
      return '';
    }
    try {
      const result = await this.client.callTool({
        name: 'add_memory',
        arguments: { text: content, meta: metadata },
      });
      return result?.content?.[0]?.text || '';
    } catch (err) {
      console.error(`[MEMPALACE] write() failed: ${err}`);
      return '';
    }
  }

  async writeSummary(digest: InteractionDigest): Promise<string> {
    if (!this.client) {
      console.warn('[MEMPALACE] Not connected — writeSummary() returning empty string');
      return '';
    }
    try {
      const result = await this.client.callTool({
        name: 'add_memory',
        arguments: {
          text: JSON.stringify(digest),
          meta: {
            source_id: 'user_agent',
            timestamp: digest.timestamp,
            tags: ['summary', 'interaction_digest'],
          },
        },
      });
      return result?.content?.[0]?.text || '';
    } catch (err) {
      console.error(`[MEMPALACE] writeSummary() failed: ${err}`);
      return '';
    }
  }

  async readContext(tier: MemoryTier, query?: string): Promise<string> {
    if (!this.client) {
      console.warn('[MEMPALACE] Not connected — readContext() returning empty string');
      return '';
    }
    try {
      if (tier === MemoryTier.L0_WAKE) {
        const result = await this.client.callTool({
          name: 'get_aaak_summary',
          arguments: {},
        });
        return result?.content?.[0]?.text || '';
      }
      const result = await this.client.callTool({
        name: 'search_vault',
        arguments: { tier, query, limit: 10 },
      });
      return JSON.stringify(result?.content || []);
    } catch (err) {
      console.error(`[MEMPALACE] readContext() failed: ${err}`);
      return '';
    }
  }

  async search(query: string, limit: number = 5): Promise<Array<{content: string, score: number}>> {
    if (!this.client) {
      console.warn('[MEMPALACE] Not connected — search() returning empty array');
      return [];
    }
    try {
      const result = await this.client.callTool({
        name: 'search_vault',
        arguments: { query, limit },
      });
      // Parse MCP response into expected shape
      const text = result?.content?.[0]?.text || '[]';
      return JSON.parse(text);
    } catch (err) {
      console.error(`[MEMPALACE] search() failed: ${err}`);
      return [];
    }
  }

  async delete(memoryId: string): Promise<boolean> {
    if (!this.client) {
      console.warn('[MEMPALACE] Not connected — delete() returning false');
      return false;
    }
    try {
      await this.client.callTool({
        name: 'delete_memory',
        arguments: { id: memoryId },
      });
      return true;
    } catch (err) {
      console.error(`[MEMPALACE] delete() failed: ${err}`);
      return false;
    }
  }

  async audit(olderThan?: Date): Promise<AuditReport> {
    if (!this.client) {
      console.warn('[MEMPALACE] Not connected — audit() returning empty report');
      return { contradictions: [], orphan_pages: [], stale_entries: [], timestamp: new Date().toISOString() };
    }
    try {
      const result = await this.client.callTool({
        name: 'audit_vault',
        arguments: { older_than: olderThan?.toISOString() },
      });
      const text = result?.content?.[0]?.text || '{}';
      const data = JSON.parse(text);
      return {
        contradictions: data.contradictions || [],
        orphan_pages: data.orphan_pages || [],
        stale_entries: data.stale_entries || [],
        timestamp: data.timestamp || new Date().toISOString(),
      };
    } catch (err) {
      console.error(`[MEMPALACE] audit() failed: ${err}`);
      return { contradictions: [], orphan_pages: [], stale_entries: [], timestamp: new Date().toISOString() };
    }
  }
}
