// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../rpc';
import { extractData, collectOne } from '../rpc';
import type { BashEvent } from './types';

/** Typed client interface for bash plugin */
export interface BashClient {
  /** Execute a bash command and stream stdout, stderr, and exit code */
  execute(command: string): AsyncGenerator<BashEvent>;
  /** Get plugin or method schema. Pass {"method": "name"} for a specific method. */
  schema(): Promise<unknown>;
}

/** Typed client implementation for bash plugin */
class BashClientImpl implements BashClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *execute(command: string): AsyncGenerator<BashEvent> {
    const stream = this.rpc.call('bash.execute', { command });
    yield* extractData<BashEvent>(stream);
  }

  async schema(): Promise<unknown> {
    const stream = this.rpc.call('bash.schema', {});
    return collectOne<unknown>(stream);
  }
}

/** Create a typed bash client from an RPC client */
export function createBashClient(rpc: RpcClient): BashClient {
  return new BashClientImpl(rpc);
}