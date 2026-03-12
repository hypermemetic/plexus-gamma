// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../../../rpc';
import { extractData } from '../../../rpc';
import type { SolarEvent } from '../../../solar/types';

/** Typed client interface for solar.uranus.titania plugin */
export interface SolarUranusTitaniaClient {
  /** Get information about Titania */
  info(): AsyncGenerator<SolarEvent>;
}

/** Typed client implementation for solar.uranus.titania plugin */
class SolarUranusTitaniaClientImpl implements SolarUranusTitaniaClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *info(): AsyncGenerator<SolarEvent> {
    const stream = this.rpc.call('solar.uranus.titania.info', {});
    yield* extractData<SolarEvent>(stream);
  }
}

/** Create a typed solar.uranus.titania client from an RPC client */
export function createSolarUranusTitaniaClient(rpc: RpcClient): SolarUranusTitaniaClient {
  return new SolarUranusTitaniaClientImpl(rpc);
}