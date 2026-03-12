// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../rpc';
import { extractData, collectOne } from '../rpc';
import type { ChangelogEvent } from './types';

/** Typed client interface for changelog plugin */
export interface ChangelogClient {
  /** Add a changelog entry for a plexus hash transition */
  add(hash: string, summary: string, author?: string | null, details?: unknown[] | null, previousHash?: string | null, queueId?: string | null): AsyncGenerator<ChangelogEvent>;
  /** Check current status - is the current plexus hash documented? */
  check(currentHash: string): AsyncGenerator<ChangelogEvent>;
  /** Get a specific changelog entry by hash */
  get(hash: string): AsyncGenerator<ChangelogEvent>;
  /** List all changelog entries */
  list(): AsyncGenerator<ChangelogEvent>;
  /** Add a planned change to the queue */
  queueAdd(description: string, tags?: unknown[] | null): AsyncGenerator<ChangelogEvent>;
  /** Mark a queue entry as complete */
  queueComplete(hash: string, id: string): AsyncGenerator<ChangelogEvent>;
  /** Get a specific queue entry by ID */
  queueGet(id: string): AsyncGenerator<ChangelogEvent>;
  /** List all queue entries, optionally filtered by tag */
  queueList(tag?: string | null): AsyncGenerator<ChangelogEvent>;
  /** List pending queue entries, optionally filtered by tag */
  queuePending(tag?: string | null): AsyncGenerator<ChangelogEvent>;
  /** Get plugin or method schema. Pass {"method": "name"} for a specific method. */
  schema(): Promise<unknown>;
}

/** Typed client implementation for changelog plugin */
class ChangelogClientImpl implements ChangelogClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *add(hash: string, summary: string, author?: string | null, details?: unknown[] | null, previousHash?: string | null, queueId?: string | null): AsyncGenerator<ChangelogEvent> {
    const stream = this.rpc.call('changelog.add', { author, details, hash, previous_hash: previousHash, queue_id: queueId, summary });
    yield* extractData<ChangelogEvent>(stream);
  }

  async *check(currentHash: string): AsyncGenerator<ChangelogEvent> {
    const stream = this.rpc.call('changelog.check', { current_hash: currentHash });
    yield* extractData<ChangelogEvent>(stream);
  }

  async *get(hash: string): AsyncGenerator<ChangelogEvent> {
    const stream = this.rpc.call('changelog.get', { hash });
    yield* extractData<ChangelogEvent>(stream);
  }

  async *list(): AsyncGenerator<ChangelogEvent> {
    const stream = this.rpc.call('changelog.list', {});
    yield* extractData<ChangelogEvent>(stream);
  }

  async *queueAdd(description: string, tags?: unknown[] | null): AsyncGenerator<ChangelogEvent> {
    const stream = this.rpc.call('changelog.queue_add', { description, tags });
    yield* extractData<ChangelogEvent>(stream);
  }

  async *queueComplete(hash: string, id: string): AsyncGenerator<ChangelogEvent> {
    const stream = this.rpc.call('changelog.queue_complete', { hash, id });
    yield* extractData<ChangelogEvent>(stream);
  }

  async *queueGet(id: string): AsyncGenerator<ChangelogEvent> {
    const stream = this.rpc.call('changelog.queue_get', { id });
    yield* extractData<ChangelogEvent>(stream);
  }

  async *queueList(tag?: string | null): AsyncGenerator<ChangelogEvent> {
    const stream = this.rpc.call('changelog.queue_list', { tag });
    yield* extractData<ChangelogEvent>(stream);
  }

  async *queuePending(tag?: string | null): AsyncGenerator<ChangelogEvent> {
    const stream = this.rpc.call('changelog.queue_pending', { tag });
    yield* extractData<ChangelogEvent>(stream);
  }

  async schema(): Promise<unknown> {
    const stream = this.rpc.call('changelog.schema', {});
    return collectOne<unknown>(stream);
  }
}

/** Create a typed changelog client from an RPC client */
export function createChangelogClient(rpc: RpcClient): ChangelogClient {
  return new ChangelogClientImpl(rpc);
}