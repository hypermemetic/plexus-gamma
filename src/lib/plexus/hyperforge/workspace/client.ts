// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../../rpc';
import { extractData, collectOne } from '../../rpc';
import type { HyperforgeEvent } from '../../hyperforge/types';

/** Typed client interface for hyperforge.workspace plugin */
export interface HyperforgeWorkspaceClient {
  /** Check all repos are on expected branch and clean */
  check(path: string, branch?: string | null): AsyncGenerator<HyperforgeEvent>;
  /** Clone all repos for an org from LocalForge into a workspace directory */
  clone(org: string, path: string, concurrency?: number | null, filter?: string | null, forge?: string | null): AsyncGenerator<HyperforgeEvent>;
  /** Compute sync diff between local and a remote forge */
  diff(forge?: string | null, org?: string | null, path?: string | null): AsyncGenerator<HyperforgeEvent>;
  /** Discover repos in a workspace directory */
  discover(path: string): AsyncGenerator<HyperforgeEvent>;
  /** Initialize unconfigured repos in a workspace */
  init(path: string, dryRun?: boolean | null, force?: boolean | null, forges?: unknown[] | null, noHooks?: boolean | null, noSshWrapper?: boolean | null, org?: string | null): AsyncGenerator<HyperforgeEvent>;
  /** Move repos from one workspace to another */
  moveRepos(path: string, targetPath: string, dryRun?: boolean | null, filter?: string | null, repo?: unknown[] | null, targetOrg?: string | null): AsyncGenerator<HyperforgeEvent>;
  /** Push all repos to their configured forges */
  pushAll(path: string, branch?: string | null, dryRun?: boolean | null, setUpstream?: boolean | null, validate?: boolean | null): AsyncGenerator<HyperforgeEvent>;
  /** Get plugin or method schema. Pass {"method": "name"} for a specific method. */
  schema(): Promise<unknown>;
  /** Set default branch on all repos in a workspace */
  setDefaultBranch(branch: string, path: string, checkout?: boolean | null, dryRun?: boolean | null): AsyncGenerator<HyperforgeEvent>;
  /** Full safe sync pipeline: discover → init → register → import → diff → apply (no deletes) → push */
  sync(path: string, dryRun?: boolean | null, forges?: unknown[] | null, noInit?: boolean | null, noPush?: boolean | null, org?: string | null, purge?: boolean | null, reflect?: boolean | null, validate?: boolean | null): AsyncGenerator<HyperforgeEvent>;
  /** Verify workspace sync state */
  verify(org?: string | null, path?: string | null): AsyncGenerator<HyperforgeEvent>;
}

/** Typed client implementation for hyperforge.workspace plugin */
class HyperforgeWorkspaceClientImpl implements HyperforgeWorkspaceClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *check(path: string, branch?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.workspace.check', { branch, path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *clone(org: string, path: string, concurrency?: number | null, filter?: string | null, forge?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.workspace.clone', { concurrency, filter, forge, org, path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *diff(forge?: string | null, org?: string | null, path?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.workspace.diff', { forge, org, path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *discover(path: string): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.workspace.discover', { path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *init(path: string, dryRun?: boolean | null, force?: boolean | null, forges?: unknown[] | null, noHooks?: boolean | null, noSshWrapper?: boolean | null, org?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.workspace.init', { dry_run: dryRun, force, forges, no_hooks: noHooks, no_ssh_wrapper: noSshWrapper, org, path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *moveRepos(path: string, targetPath: string, dryRun?: boolean | null, filter?: string | null, repo?: unknown[] | null, targetOrg?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.workspace.move_repos', { dry_run: dryRun, filter, path, repo, target_org: targetOrg, target_path: targetPath });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *pushAll(path: string, branch?: string | null, dryRun?: boolean | null, setUpstream?: boolean | null, validate?: boolean | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.workspace.push_all', { branch, dry_run: dryRun, path, set_upstream: setUpstream, validate });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async schema(): Promise<unknown> {
    const stream = this.rpc.call('hyperforge.workspace.schema', {});
    return collectOne<unknown>(stream);
  }

  async *setDefaultBranch(branch: string, path: string, checkout?: boolean | null, dryRun?: boolean | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.workspace.set_default_branch', { branch, checkout, dry_run: dryRun, path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *sync(path: string, dryRun?: boolean | null, forges?: unknown[] | null, noInit?: boolean | null, noPush?: boolean | null, org?: string | null, purge?: boolean | null, reflect?: boolean | null, validate?: boolean | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.workspace.sync', { dry_run: dryRun, forges, no_init: noInit, no_push: noPush, org, path, purge, reflect, validate });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *verify(org?: string | null, path?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.workspace.verify', { org, path });
    yield* extractData<HyperforgeEvent>(stream);
  }
}

/** Create a typed hyperforge.workspace client from an RPC client */
export function createHyperforgeWorkspaceClient(rpc: RpcClient): HyperforgeWorkspaceClient {
  return new HyperforgeWorkspaceClientImpl(rpc);
}