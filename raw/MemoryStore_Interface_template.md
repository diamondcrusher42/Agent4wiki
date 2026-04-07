# The MemoryStore Abstraction Layer
## TypeScript

// core/memory_store/interface.ts

export interface MemoryMetadata {
  source_id: string;      // Which Clone or session wrote this?
  timestamp: string;      // ISO format for the Janitor's expiration checks
  tags: string[];         // e.g., ["architecture", "code_review", "planning"]
  valid_until?: string;   // Optional expiration date for temporary context
}

export interface MemoryStore {
  /**
   * Initializes the connection to the underlying database (MemPalace, Qdrant, etc.)
   */
  connect(): Promise<void>;

  /**
   * INGEST: Stores a new concept or log into the memory vault.
   */
  write(content: string, metadata: MemoryMetadata): Promise<string>; // Returns Memory ID

  /**
   * RETRIEVE: Pulls exact context using the L0-L3 tier system (max ~170 tokens for L0).
   * @param tier 'L0_WAKE' | 'L1_RECENT' | 'L2_DOMAIN' | 'L3_DEEP'
   */
  readContext(tier: string, query?: string): Promise<string>;

  /**
   * SEARCH: Semantic similarity search for Clones to use during [DISCOVER] phases.
   */
  search(query: string, limit?: number): Promise<Array<{content: string, score: number}>>;

  /**
   * PRUNE: Used exclusively by the Janitor segment to delete stale or contradicted memory.
   */
  delete(memoryId: string): Promise<boolean>;
}


# The MemPalace Implementation (The Wrapper)
## Typescript

// core/memory_store/mempalace_adapter.ts

import { MemoryStore, MemoryMetadata } from './interface';
// import { MemPalaceClient } from 'mempalace'; // The fragile external dependency

export class MemPalaceAdapter implements MemoryStore {
  private client: any;

  async connect() {
    // Initialize MemPalace MCP or local DB here
    console.log("Vault connection established via MemPalace.");
  }

  async write(content: string, metadata: MemoryMetadata) {
    // Translate our generic write into MemPalace's specific 'add_room' logic
    return await this.client.add({ text: content, meta: metadata });
  }

  async readContext(tier: string, query?: string) {
    // Implement the AAAK Compression logic here.
    // E.g., if tier === 'L0_WAKE', only return the global state summary.
    return await this.client.getWakeupContext(); 
  }

  async search(query: string, limit: number = 5) {
    return await this.client.vectorSearch(query, limit);
  }

  async delete(memoryId: string) {
    return await this.client.remove(memoryId);
  }
}



# architecture win
The Brain's Code Remains Clean: The Brain segment will simply call await memory.readContext('L0_WAKE'). It doesn't know or care what vector database is running underneath.

The AAAK Compression is Isolated: The logic that keeps the wake-up prompt under 170 tokens is safely boxed inside the readContext function. If you need to tweak the compression algorithm, you edit one file, not the Brain's core prompt.

The Janitor's Scythe: The delete method provides the exact tool the Janitor needs in Phase 6 to clear out contradictory or stale wiki pages.