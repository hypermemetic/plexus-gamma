// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../../../rpc';
import { extractData } from '../../../rpc';
import type { SolarEvent } from '../../../solar/types';

/** Typed client interface for solar.jupiter.callisto plugin */
export interface SolarJupiterCallistoClient {
  /** Get information about Callisto */
  info(): AsyncGenerator<SolarEvent>;
}

/** Typed client implementation for solar.jupiter.callisto plugin */
class SolarJupiterCallistoClientImpl implements SolarJupiterCallistoClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *info(): AsyncGenerator<SolarEvent> {
    const stream = this.rpc.call('solar.jupiter.callisto.info', {});
    yield* extractData<SolarEvent>(stream);
  }
}

/** Create a typed solar.jupiter.callisto client from an RPC client */
export function createSolarJupiterCallistoClient(rpc: RpcClient): SolarJupiterCallistoClient {
  return new SolarJupiterCallistoClientImpl(rpc);
}