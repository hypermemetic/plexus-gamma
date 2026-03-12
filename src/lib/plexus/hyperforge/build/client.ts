// Auto-generated typed client (Layer 2)
// Wraps RPC layer and unwraps PlexusStreamItem to domain types

import type { RpcClient } from '../../rpc';
import { extractData, collectOne } from '../../rpc';
import type { HyperforgeEvent } from '../../hyperforge/types';

/** Typed client interface for hyperforge.build plugin */
export interface HyperforgeBuildClient {
  /** Analyze workspace dependency graph and detect version mismatches */
  analyze(path: string, format?: string | null): AsyncGenerator<HyperforgeEvent>;
  /** Bump versions for workspace packages */
  bump(path: string, bump?: string | null, commit?: boolean | null, dryRun?: boolean | null, filter?: string | null): AsyncGenerator<HyperforgeEvent>;
  /** Detect mismatches between directory names and package names */
  detectNameMismatches(path: string): AsyncGenerator<HyperforgeEvent>;
  /** Run a command across all workspace repos */
  exec(command: string, path: string, dirty?: boolean | null, filter?: string | null, sequential?: boolean | null): AsyncGenerator<HyperforgeEvent>;
  /** Ensure sane .gitignore patterns across all workspace repos */
  gitignoreSync(path: string, dryRun?: boolean | null, filter?: string | null, patterns?: unknown[] | null): AsyncGenerator<HyperforgeEvent>;
  /** Compare local package versions against their registries */
  packageDiff(path: string, filter?: string | null): AsyncGenerator<HyperforgeEvent>;
  /** Publish packages with transitive dependency resolution */
  publish(path: string, bump?: string | null, execute?: boolean | null, filter?: string | null, noCommit?: boolean | null, noTag?: boolean | null): AsyncGenerator<HyperforgeEvent>;
  /** Get plugin or method schema. Pass {"method": "name"} for a specific method. */
  schema(): Promise<unknown>;
  /** Generate/update native workspace manifests (Cargo.toml, cabal.project) */
  unify(path: string, dryRun?: boolean | null): AsyncGenerator<HyperforgeEvent>;
  /** Validate workspace builds in Docker containers */
  validate(path: string, dryRun?: boolean | null, image?: string | null, test?: boolean | null): AsyncGenerator<HyperforgeEvent>;
}

/** Typed client implementation for hyperforge.build plugin */
class HyperforgeBuildClientImpl implements HyperforgeBuildClient {
  private rpc: RpcClient;
  constructor(rpc: RpcClient) { this.rpc = rpc; }

  async *analyze(path: string, format?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.build.analyze', { format, path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *bump(path: string, bump?: string | null, commit?: boolean | null, dryRun?: boolean | null, filter?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.build.bump', { bump, commit, dry_run: dryRun, filter, path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *detectNameMismatches(path: string): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.build.detect_name_mismatches', { path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *exec(command: string, path: string, dirty?: boolean | null, filter?: string | null, sequential?: boolean | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.build.exec', { command, dirty, filter, path, sequential });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *gitignoreSync(path: string, dryRun?: boolean | null, filter?: string | null, patterns?: unknown[] | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.build.gitignore_sync', { dry_run: dryRun, filter, path, patterns });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *packageDiff(path: string, filter?: string | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.build.package_diff', { filter, path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *publish(path: string, bump?: string | null, execute?: boolean | null, filter?: string | null, noCommit?: boolean | null, noTag?: boolean | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.build.publish', { bump, execute, filter, no_commit: noCommit, no_tag: noTag, path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async schema(): Promise<unknown> {
    const stream = this.rpc.call('hyperforge.build.schema', {});
    return collectOne<unknown>(stream);
  }

  async *unify(path: string, dryRun?: boolean | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.build.unify', { dry_run: dryRun, path });
    yield* extractData<HyperforgeEvent>(stream);
  }

  async *validate(path: string, dryRun?: boolean | null, image?: string | null, test?: boolean | null): AsyncGenerator<HyperforgeEvent> {
    const stream = this.rpc.call('hyperforge.build.validate', { dry_run: dryRun, image, path, test });
    yield* extractData<HyperforgeEvent>(stream);
  }
}

/** Create a typed hyperforge.build client from an RPC client */
export function createHyperforgeBuildClient(rpc: RpcClient): HyperforgeBuildClient {
  return new HyperforgeBuildClientImpl(rpc);
}