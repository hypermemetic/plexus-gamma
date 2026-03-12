// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../../rpc';
import { extractData, collectOne } from '../../rpc';
import type { HyperforgeEvent } from '../../hyperforge/types';

/** Typed client interface for hyperforge.repo plugin */
export interface HyperforgeRepoClient {
  /** Clone a repository from LocalForge */
  clone(name: string, org: string, forge?: string | null, path?: string | null): AsyncGenerator<HyperforgeEvent>;
  /** Create a new repository in LocalForge */
  create(name: string, org: string, origin: string, visibility: string, description?: string | null, mirrors?: string | null): AsyncGenerator<HyperforgeEvent>;
  /** Soft-delete a repository: privatize on remote forges, then mark dismissed locally */
  delete(name: string, org: string): AsyncGenerator<HyperforgeEvent>;
  /** Import repositories from a remote forge */
  import(forge: string, org: string): AsyncGenerator<HyperforgeEvent>;
  /** Initialize hyperforge for a git repository */
  init(forges: string, org: string, path: string, description?: string | null, dryRun?: boolean | null, force?: boolean | null, noHooks?: boolean | null, noSshWrapper?: boolean | null, repoName?: string | null, sshKeys?: string | null, visibility?: string | null): AsyncGenerator<HyperforgeEvent>;
  /** List repositories for an organization (from LocalForge) */
  list(org: string): AsyncGenerator<HyperforgeEvent>;
  /** Purge a soft-deleted repository: hard-delete from remote forges and remove from repos.yaml  Only works on dismissed (soft-deleted) repos that have been privatized. Protected repos cannot be purged — remove protection first. */
  purge(name: string, org: string): AsyncGenerator<HyperforgeEvent>;
  /** Push to configured forges */
  push(path: string, dryRun?: boolean | null, force?: boolean | null, onlyForges?: string | null, setUpstream?: boolean | null): AsyncGenerator<HyperforgeEvent>;
  /** Rename a repository on remote forge(s) and in local config */
  rename(newName: string, oldName: string, org: string, forges?: string | null): AsyncGenerator<HyperforgeEvent>;
  /** Get plugin or method schema. Pass {"method": "name"} for a specific method. */
  schema(): Promise<unknown>;
  /** Set the default branch on remote forges and optionally checkout locally */
  setDefaultBranch(branch: string, name: string, org: string, checkout?: boolean | null, path?: string | null): AsyncGenerator<HyperforgeEvent>;
  /** Show git repository status */
  status(path: string): AsyncGenerator<HyperforgeEvent>;
  /** Update an existing repository */
  update(name: string, org: string, description?: string | null, visibility?: string | null): AsyncGenerator<HyperforgeEvent>;
}

/** Typed client implementation for hyperforge.repo plugin */
class HyperforgeRepoClientImpl implements HyperforgeRepoClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *clone(name: string, org: string, forge?: string | null, path?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.repo.clone', { forge, name, org, path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *create(name: string, org: string, origin: string, visibility: string, description?: string | null, mirrors?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.repo.create', { description, mirrors, name, org, origin, visibility });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *delete(name: string, org: string): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.repo.delete', { name, org });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *import(forge: string, org: string): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.repo.import', { forge, org });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *init(forges: string, org: string, path: string, description?: string | null, dryRun?: boolean | null, force?: boolean | null, noHooks?: boolean | null, noSshWrapper?: boolean | null, repoName?: string | null, sshKeys?: string | null, visibility?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.repo.init', { description, dry_run: dryRun, force, forges, no_hooks: noHooks, no_ssh_wrapper: noSshWrapper, org, path, repo_name: repoName, ssh_keys: sshKeys, visibility });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *list(org: string): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.repo.list', { org });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *purge(name: string, org: string): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.repo.purge', { name, org });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *push(path: string, dryRun?: boolean | null, force?: boolean | null, onlyForges?: string | null, setUpstream?: boolean | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.repo.push', { dry_run: dryRun, force, only_forges: onlyForges, path, set_upstream: setUpstream });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *rename(newName: string, oldName: string, org: string, forges?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.repo.rename', { forges, new_name: newName, old_name: oldName, org });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async schema(): Promise<unknown> {
    const stream = this.rpc.call('hyperforge.repo.schema', {});
    return collectOne<unknown>(stream);
  }

  async *setDefaultBranch(branch: string, name: string, org: string, checkout?: boolean | null, path?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.repo.set_default_branch', { branch, checkout, name, org, path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *status(path: string): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.repo.status', { path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *update(name: string, org: string, description?: string | null, visibility?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.repo.update', { description, name, org, visibility });
    yield* extractData<HyperforgeEvent>(stream);
  }
}

/** Create a typed hyperforge.repo client from an RPC client */
export function createHyperforgeRepoClient(rpc: RpcClient): HyperforgeRepoClient {
  return new HyperforgeRepoClientImpl(rpc);
}