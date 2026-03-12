// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../../rpc';
import { extractData } from '../../rpc';
import type { SolarEvent } from '../../solar/types';

/** Typed client interface for solar.saturn plugin */
export interface SolarSaturnClient {
  /** Get information about Saturn */
  info(): AsyncGenerator<SolarEvent>;
}

/** Typed client implementation for solar.saturn plugin */
class SolarSaturnClientImpl implements SolarSaturnClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *info(): AsyncGenerator<SolarEvent> {
    const stream = this.rpc.call('solar.saturn.info', {});
    yield* extractData<SolarEvent>(stream);
  }
}

/** Create a typed solar.saturn client from an RPC client */
export function createSolarSaturnClient(rpc: RpcClient): SolarSaturnClient {
  return new SolarSaturnClientImpl(rpc);
}