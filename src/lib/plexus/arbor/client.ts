// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../rpc';
import { extractData, collectOne } from '../rpc';
import type { ArborEvent, Handle } from './types';
import type { UUID } from '../cone/types';

/** Typed client interface for arbor plugin */
export interface ArborClient {
  /** Get all external handles in the path to a node */
  contextGetHandles(nodeId: UUID, treeId: UUID): AsyncGenerator<ArborEvent>;
  /** Get the full path data from root to a node */
  contextGetPath(nodeId: UUID, treeId: UUID): AsyncGenerator<ArborEvent>;
  /** List all leaf nodes in a tree */
  contextListLeaves(treeId: UUID): AsyncGenerator<ArborEvent>;
  /** Create an external node in a tree */
  nodeCreateExternal(handle: Handle, treeId: UUID, metadata?: unknown, parent?: UUID | null): AsyncGenerator<ArborEvent>;
  /** Create a text node in a tree */
  nodeCreateText(content: string, treeId: UUID, metadata?: unknown, parent?: UUID | null): AsyncGenerator<ArborEvent>;
  /** Get a node by ID */
  nodeGet(nodeId: UUID, treeId: UUID): AsyncGenerator<ArborEvent>;
  /** Get the children of a node */
  nodeGetChildren(nodeId: UUID, treeId: UUID): AsyncGenerator<ArborEvent>;
  /** Get the parent of a node */
  nodeGetParent(nodeId: UUID, treeId: UUID): AsyncGenerator<ArborEvent>;
  /** Get the path from root to a node */
  nodeGetPath(nodeId: UUID, treeId: UUID): AsyncGenerator<ArborEvent>;
  /** Get plugin or method schema. Pass {"method": "name"} for a specific method. */
  schema(): Promise<unknown>;
  /** Claim ownership of a tree (increment reference count) */
  treeClaim(count: number, ownerId: string, treeId: UUID): AsyncGenerator<ArborEvent>;
  /** Create a new conversation tree */
  treeCreate(ownerId: string, metadata?: unknown): AsyncGenerator<ArborEvent>;
  /** Retrieve a complete tree with all nodes */
  treeGet(treeId: UUID): AsyncGenerator<ArborEvent>;
  /** Get lightweight tree structure without node data */
  treeGetSkeleton(treeId: UUID): AsyncGenerator<ArborEvent>;
  /** List all active trees */
  treeList(): AsyncGenerator<ArborEvent>;
  /** List archived trees */
  treeListArchived(): AsyncGenerator<ArborEvent>;
  /** List trees scheduled for deletion */
  treeListScheduled(): AsyncGenerator<ArborEvent>;
  /** Release ownership of a tree (decrement reference count) */
  treeRelease(count: number, ownerId: string, treeId: UUID): AsyncGenerator<ArborEvent>;
  /** Render tree as text visualization  If parent context is available, automatically resolves handles to show actual content. Otherwise, shows handle references. */
  treeRender(treeId: UUID): AsyncGenerator<ArborEvent>;
  /** Update tree metadata */
  treeUpdateMetadata(metadata: unknown, treeId: UUID): AsyncGenerator<ArborEvent>;
}

/** Typed client implementation for arbor plugin */
class ArborClientImpl implements ArborClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *contextGetHandles(nodeId: UUID, treeId: UUID): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.context_get_handles', { node_id: nodeId, tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async *contextGetPath(nodeId: UUID, treeId: UUID): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.context_get_path', { node_id: nodeId, tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async *contextListLeaves(treeId: UUID): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.context_list_leaves', { tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async *nodeCreateExternal(handle: Handle, treeId: UUID, metadata?: unknown, parent?: UUID | null): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.node_create_external', { handle, metadata, parent, tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async *nodeCreateText(content: string, treeId: UUID, metadata?: unknown, parent?: UUID | null): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.node_create_text', { content, metadata, parent, tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async *nodeGet(nodeId: UUID, treeId: UUID): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.node_get', { node_id: nodeId, tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async *nodeGetChildren(nodeId: UUID, treeId: UUID): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.node_get_children', { node_id: nodeId, tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async *nodeGetParent(nodeId: UUID, treeId: UUID): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.node_get_parent', { node_id: nodeId, tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async *nodeGetPath(nodeId: UUID, treeId: UUID): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.node_get_path', { node_id: nodeId, tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async schema(): Promise<unknown> {
    const stream = this.rpc.call('arbor.schema', {});
    return collectOne<unknown>(stream);
  }

  async *treeClaim(count: number, ownerId: string, treeId: UUID): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.tree_claim', { count, owner_id: ownerId, tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async *treeCreate(ownerId: string, metadata?: unknown): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.tree_create', { metadata, owner_id: ownerId });
    yield* extractData<ArborEvent>(stream);
  }

  async *treeGet(treeId: UUID): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.tree_get', { tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async *treeGetSkeleton(treeId: UUID): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.tree_get_skeleton', { tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async *treeList(): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.tree_list', {});
    yield* extractData<ArborEvent>(stream);
  }

  async *treeListArchived(): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.tree_list_archived', {});
    yield* extractData<ArborEvent>(stream);
  }

  async *treeListScheduled(): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.tree_list_scheduled', {});
    yield* extractData<ArborEvent>(stream);
  }

  async *treeRelease(count: number, ownerId: string, treeId: UUID): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.tree_release', { count, owner_id: ownerId, tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async *treeRender(treeId: UUID): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.tree_render', { tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }

  async *treeUpdateMetadata(metadata: unknown, treeId: UUID): AsyncGenerator<ArborEvent> {
    const stream = this.rpc.call('arbor.tree_update_metadata', { metadata, tree_id: treeId });
    yield* extractData<ArborEvent>(stream);
  }
}

/** Create a typed arbor client from an RPC client */
export function createArborClient(rpc: RpcClient): ArborClient {
  return new ArborClientImpl(rpc);
}