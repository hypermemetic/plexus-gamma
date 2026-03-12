// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../../../rpc';
import { extractData } from '../../../rpc';
import type { SolarEvent } from '../../../solar/types';

/** Typed client interface for solar.uranus.miranda plugin */
export interface SolarUranusMirandaClient {
  /** Get information about Miranda */
  info(): AsyncGenerator<SolarEvent>;
}

/** Typed client implementation for solar.uranus.miranda plugin */
class SolarUranusMirandaClientImpl implements SolarUranusMirandaClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *info(): AsyncGenerator<SolarEvent> {
    const stream = this.rpc.call('solar.uranus.miranda.info', {});
    yield* extractData<SolarEvent>(stream);
  }
}

/** Create a typed solar.uranus.miranda client from an RPC client */
export function createSolarUranusMirandaClient(rpc: RpcClient): SolarUranusMirandaClient {
  return new SolarUranusMirandaClientImpl(rpc);
}