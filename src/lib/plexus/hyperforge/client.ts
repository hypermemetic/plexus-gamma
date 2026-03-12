// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../rpc';
import { extractData, collectOne } from '../rpc';
import type { HyperforgeEvent } from './types';

/** Typed client interface for hyperforge plugin */
export interface HyperforgeClient {
  /** Bootstrap an org — import all repos from remote forges into LocalForge */
  begin(forges: string[], org: string, dryRun?: boolean | null): AsyncGenerator<HyperforgeEvent>;
  /** Reload cached state from disk (repos.yaml for all known orgs) */
  reload(): AsyncGenerator<HyperforgeEvent>;
  /** Get plugin or method schema. Pass {"method": "name"} for a specific method. */
  schema(): Promise<unknown>;
  /** Show hyperforge status */
  status(): AsyncGenerator<HyperforgeEvent>;
}

/** Typed client implementation for hyperforge plugin */
class HyperforgeClientImpl implements HyperforgeClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *begin(forges: string[], org: string, dryRun?: boolean | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.begin', { dry_run: dryRun, forges, org });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *reload(): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.reload', {});
    yield* extractData<HyperforgeEvent>(stream);
  }

  async schema(): Promise<unknown> {
    const stream = this.rpc.call('hyperforge.schema', {});
    return collectOne<unknown>(stream);
  }

  async *status(): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.status', {});
    yield* extractData<HyperforgeEvent>(stream);
  }
}

/** Create a typed hyperforge client from an RPC client */
export function createHyperforgeClient(rpc: RpcClient): HyperforgeClient {
  return new HyperforgeClientImpl(rpc);
}