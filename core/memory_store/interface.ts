// core/memory_store/interface.ts
// Phase 1 deliverable — MemoryStore abstraction layer
// Nothing outside this directory calls MemPalace directly.

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
