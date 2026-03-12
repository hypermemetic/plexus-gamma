// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../rpc';
import { extractData, collectOne } from '../rpc';
import type { ChatEvent, ConeIdentifier, CreateResult, DeleteResult, GetResult, ListResult, RegistryResult, SetHeadResult, UUID } from './types';

/** Typed client interface for cone plugin */
export interface ConeClient {
  /** Chat with a cone - appends prompt to context, calls LLM, advances head */
  chat(identifier: ConeIdentifier, prompt: string, ephemeral?: boolean | null): AsyncGenerator<ChatEvent>;
  /** Create a new cone (LLM agent with persistent conversation context) */
  create(modelId: string, name: string, metadata?: unknown, systemPrompt?: string | null): Promise<CreateResult>;
  /** Delete a cone (associated tree is preserved) */
  delete(identifier: ConeIdentifier): Promise<DeleteResult>;
  /** Get cone configuration by name or ID */
  get(identifier: ConeIdentifier): Promise<GetResult>;
  /** List all cones */
  list(): Promise<ListResult>;
  /** Get available LLM services and models */
  registry(): Promise<RegistryResult>;
  /** Get plugin or method schema. Pass {"method": "name"} for a specific method. */
  schema(): Promise<unknown>;
  /** Move cone's canonical head to a different node in the tree */
  setHead(identifier: ConeIdentifier, nodeId: UUID): Promise<SetHeadResult>;
}

/** Typed client implementation for cone plugin */
class ConeClientImpl implements ConeClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *chat(identifier: ConeIdentifier, prompt: string, ephemeral?: boolean | null): AsyncGenerator<ChatEvent> {
    const stream = this.rpc.call('cone.chat', { ephemeral, identifier, prompt });
    yield* extractData<ChatEvent>(stream);
  }

  async create(modelId: string, name: string, metadata?: unknown, systemPrompt?: string | null): Promise<CreateResult> {
    const stream = this.rpc.call('cone.create', { metadata, model_id: modelId, name, system_prompt: systemPrompt });
    return collectOne<CreateResult>(stream);
  }

  async delete(identifier: ConeIdentifier): Promise<DeleteResult> {
    const stream = this.rpc.call('cone.delete', { identifier });
    return collectOne<DeleteResult>(stream);
  }

  async get(identifier: ConeIdentifier): Promise<GetResult> {
    const stream = this.rpc.call('cone.get', { identifier });
    return collectOne<GetResult>(stream);
  }

  async list(): Promise<ListResult> {
    const stream = this.rpc.call('cone.list', {});
    return collectOne<ListResult>(stream);
  }

  async registry(): Promise<RegistryResult> {
    const stream = this.rpc.call('cone.registry', {});
    return collectOne<RegistryResult>(stream);
  }

  async schema(): Promise<unknown> {
    const stream = this.rpc.call('cone.schema', {});
    return collectOne<unknown>(stream);
  }

  async setHead(identifier: ConeIdentifier, nodeId: UUID): Promise<SetHeadResult> {
    const stream = this.rpc.call('cone.set_head', { identifier, node_id: nodeId });
    return collectOne<SetHeadResult>(stream);
  }
}

/** Create a typed cone client from an RPC client */
export function createConeClient(rpc: RpcClient): ConeClient {
  return new ConeClientImpl(rpc);
}