// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../../rpc';
import { extractData } from '../../rpc';
import type { SolarEvent } from '../../solar/types';

/** Typed client interface for solar.jupiter plugin */
export interface SolarJupiterClient {
  /** Get information about Jupiter */
  info(): AsyncGenerator<SolarEvent>;
}

/** Typed client implementation for solar.jupiter plugin */
class SolarJupiterClientImpl implements SolarJupiterClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *info(): AsyncGenerator<SolarEvent> {
    const stream = this.rpc.call('solar.jupiter.info', {});
    yield* extractData<SolarEvent>(stream);
  }
}

/** Create a typed solar.jupiter client from an RPC client */
export function createSolarJupiterClient(rpc: RpcClient): SolarJupiterClient {
  return new SolarJupiterClientImpl(rpc);
}