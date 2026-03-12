// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../rpc';
import { extractData, collectOne } from '../rpc';
import type { RegistryEvent } from './types';

/** Typed client interface for registry plugin */
export interface RegistryClient {
  /** Delete a backend */
  delete(name: string): AsyncGenerator<RegistryEvent>;
  /** Get a specific backend by name */
  get(name: string): AsyncGenerator<RegistryEvent>;
  /** List all registered backends */
  list(activeOnly?: boolean | null): AsyncGenerator<RegistryEvent>;
  /** Ping a backend to update its last_seen timestamp */
  ping(name: string): AsyncGenerator<RegistryEvent>;
  /** Register a new backend */
  register(host: string, name: string, port: number, description?: string | null, namespace?: string | null, protocol?: string | null): AsyncGenerator<RegistryEvent>;
  /** Reload the configuration file */
  reload(): AsyncGenerator<RegistryEvent>;
  /** Get plugin or method schema. Pass {"method": "name"} for a specific method. */
  schema(): Promise<unknown>;
  /** Update an existing backend */
  update(name: string, description?: string | null, host?: string | null, namespace?: string | null, port?: number | null, protocol?: string | null): AsyncGenerator<RegistryEvent>;
}

/** Typed client implementation for registry plugin */
class RegistryClientImpl implements RegistryClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *delete(name: string): AsyncGenerator<RegistryEvent> {
    const stream = this.rpc.call('registry.delete', { name });
    yield* extractData<RegistryEvent>(stream);
  }

  async *get(name: string): AsyncGenerator<RegistryEvent> {
    const stream = this.rpc.call('registry.get', { name });
    yield* extractData<RegistryEvent>(stream);
  }

  async *list(activeOnly?: boolean | null): AsyncGenerator<RegistryEvent> {
    const stream = this.rpc.call('registry.list', { active_only: activeOnly });
    yield* extractData<RegistryEvent>(stream);
  }

  async *ping(name: string): AsyncGenerator<RegistryEvent> {
    const stream = this.rpc.call('registry.ping', { name });
    yield* extractData<RegistryEvent>(stream);
  }

  async *register(host: string, name: string, port: number, description?: string | null, namespace?: string | null, protocol?: string | null): AsyncGenerator<RegistryEvent> {
    const stream = this.rpc.call('registry.register', { description, host, name, namespace, port, protocol });
    yield* extractData<RegistryEvent>(stream);
  }

  async *reload(): AsyncGenerator<RegistryEvent> {
    const stream = this.rpc.call('registry.reload', {});
    yield* extractData<RegistryEvent>(stream);
  }

  async schema(): Promise<unknown> {
    const stream = this.rpc.call('registry.schema', {});
    return collectOne<unknown>(stream);
  }

  async *update(name: string, description?: string | null, host?: string | null, namespace?: string | null, port?: number | null, protocol?: string | null): AsyncGenerator<RegistryEvent> {
    const stream = this.rpc.call('registry.update', { description, host, name, namespace, port, protocol });
    yield* extractData<RegistryEvent>(stream);
  }
}

/** Create a typed registry client from an RPC client */
export function createRegistryClient(rpc: RpcClient): RegistryClient {
  return new RegistryClientImpl(rpc);
}