// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../rpc';
import { extractData, collectOne } from '../rpc';
import type { EchoEvent } from './types';

/** Typed client interface for echo plugin */
export interface EchoClient {
  /** Echo a message back */
  echo(count: number, message: string): AsyncGenerator<EchoEvent>;
  /** Echo a simple message once */
  once(message: string): AsyncGenerator<EchoEvent>;
  /** Ping — returns a Pong response */
  ping(): AsyncGenerator<EchoEvent>;
  /** Get plugin or method schema. Pass {"method": "name"} for a specific method. */
  schema(): Promise<unknown>;
}

/** Typed client implementation for echo plugin */
class EchoClientImpl implements EchoClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *echo(count: number, message: string): AsyncGenerator<EchoEvent> {
    const stream = this.rpc.call('echo.echo', { count, message });
    yield* extractData<EchoEvent>(stream);
  }

  async *once(message: string): AsyncGenerator<EchoEvent> {
    const stream = this.rpc.call('echo.once', { message });
    yield* extractData<EchoEvent>(stream);
  }

  async *ping(): AsyncGenerator<EchoEvent> {
    const stream = this.rpc.call('echo.ping', {});
    yield* extractData<EchoEvent>(stream);
  }

  async schema(): Promise<unknown> {
    const stream = this.rpc.call('echo.schema', {});
    return collectOne<unknown>(stream);
  }
}

/** Create a typed echo client from an RPC client */
export function createEchoClient(rpc: RpcClient): EchoClient {
  return new EchoClientImpl(rpc);
}