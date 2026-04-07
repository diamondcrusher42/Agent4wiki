// core/memory_store/interface.ts
// Phase 1 deliverable — MemoryStore abstraction layer (V2)
// Changelog: Added MemoryTier enum, writeSummary, audit methods, InteractionDigest type
//
// LANGUAGE DECISION (2026-04-08 — locked): TypeScript for Core Orchestrator.
// See wiki/decisions/decision-typescript-python.md
//
// MemPalace adapter = MCP client (not direct import — MemPalace is Python).
// Access via MemPalace's 19-tool MCP server over JSON-RPC / stdio.
// MCP enforces the MemoryStore abstraction physically — if MemPalace crashes,
// Core catches a timeout, not a process crash. This is the intended architecture.

// Tier enum — use this instead of raw strings to prevent silent typo failures
export enum MemoryTier {
  L0_WAKE   = 'L0_WAKE',    // ~50-170 tokens: identity + critical facts only
  L1_RECENT = 'L1_RECENT',  // recent session context
  L2_DOMAIN = 'L2_DOMAIN',  // domain-specific room recall for current task
  L3_DEEP   = 'L3_DEEP'     // full semantic search across all closets
}

export interface MemoryMetadata {
  source_id: string;      // Which Clone or session wrote this?
  timestamp: string;      // ISO format for the Janitor's expiration checks
  tags: string[];         // e.g., ["architecture", "code_review", "planning"]
  valid_until?: string;   // Optional expiration date for temporary context
}

// Structured digest from User Agent summary pipeline
// Format matches architecture spec: {timestamp, intent, entities_mentioned, outcome, open_items, confidence}
export interface InteractionDigest {
  timestamp: string;
  intent: string;
  entities_mentioned: string[];
  outcome: string;
  open_items: string[];
  confidence: number; // 0-1
}

// Structured report from Janitor audit pass
export interface AuditReport {
  contradictions: Array<{page_a: string, page_b: string, conflict: string}>;
  orphan_pages: string[];
  stale_entries: Array<{id: string, age_days: number}>;
  timestamp: string;
}

export interface MemoryStore {
  /**
   * Initializes the connection to the underlying database (MemPalace, Qdrant, etc.)
   */
  connect(): Promise<void>;

  /**
   * INGEST: Stores a new concept or log into the memory vault.
   * Used by Clones and Brain after completing a task.
   */
  write(content: string, metadata: MemoryMetadata): Promise<string>; // Returns Memory ID

  /**
   * SUMMARY PIPELINE: Stores a structured interaction digest from the User Agent.
   * Separate from write() to enforce the InteractionDigest schema.
   */
  writeSummary(digest: InteractionDigest): Promise<string>; // Returns Memory ID

  /**
   * RETRIEVE: Pulls context using the L0-L3 tier system.
   * L0_WAKE must return ≤170 tokens (AAAK compression enforced in adapter).
   * Uses MemoryTier enum — no raw strings.
   */
  readContext(tier: MemoryTier, query?: string): Promise<string>;

  /**
   * SEARCH: Semantic similarity search for Clones during [DISCOVER] phases.
   */
  search(query: string, limit?: number): Promise<Array<{content: string, score: number}>>;

  /**
   * PRUNE: Used exclusively by the Janitor segment to delete stale or contradicted memory.
   */
  delete(memoryId: string): Promise<boolean>;

  /**
   * AUDIT: Janitor lint pass — finds contradictions, orphans, and stale entries.
   * Returns a structured report for the Janitor to act on.
   * The Janitor should not implement its own search-and-analyze logic.
   */
  audit(olderThan?: Date): Promise<AuditReport>;
}
