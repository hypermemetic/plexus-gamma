// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../../rpc';
import { extractData } from '../../rpc';
import type { SolarEvent } from '../../solar/types';

/** Typed client interface for solar.venus plugin */
export interface SolarVenusClient {
  /** Get information about Venus */
  info(): AsyncGenerator<SolarEvent>;
}

/** Typed client implementation for solar.venus plugin */
class SolarVenusClientImpl implements SolarVenusClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *info(): AsyncGenerator<SolarEvent> {
    const stream = this.rpc.call('solar.venus.info', {});
    yield* extractData<SolarEvent>(stream);
  }
}

/** Create a typed solar.venus client from an RPC client */
export function createSolarVenusClient(rpc: RpcClient): SolarVenusClient {
  return new SolarVenusClientImpl(rpc);
}