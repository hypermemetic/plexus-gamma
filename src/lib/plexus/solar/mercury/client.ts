// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../../rpc';
import { extractData } from '../../rpc';
import type { SolarEvent } from '../../solar/types';

/** Typed client interface for solar.mercury plugin */
export interface SolarMercuryClient {
  /** Get information about Mercury */
  info(): AsyncGenerator<SolarEvent>;
}

/** Typed client implementation for solar.mercury plugin */
class SolarMercuryClientImpl implements SolarMercuryClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *info(): AsyncGenerator<SolarEvent> {
    const stream = this.rpc.call('solar.mercury.info', {});
    yield* extractData<SolarEvent>(stream);
  }
}

/** Create a typed solar.mercury client from an RPC client */
export function createSolarMercuryClient(rpc: RpcClient): SolarMercuryClient {
  return new SolarMercuryClientImpl(rpc);
}