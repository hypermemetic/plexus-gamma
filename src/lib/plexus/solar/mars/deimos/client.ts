// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../../../rpc';
import { extractData } from '../../../rpc';
import type { SolarEvent } from '../../../solar/types';

/** Typed client interface for solar.mars.deimos plugin */
export interface SolarMarsDeimosClient {
  /** Get information about Deimos */
  info(): AsyncGenerator<SolarEvent>;
}

/** Typed client implementation for solar.mars.deimos plugin */
class SolarMarsDeimosClientImpl implements SolarMarsDeimosClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *info(): AsyncGenerator<SolarEvent> {
    const stream = this.rpc.call('solar.mars.deimos.info', {});
    yield* extractData<SolarEvent>(stream);
  }
}

/** Create a typed solar.mars.deimos client from an RPC client */
export function createSolarMarsDeimosClient(rpc: RpcClient): SolarMarsDeimosClient {
  return new SolarMarsDeimosClientImpl(rpc);
}